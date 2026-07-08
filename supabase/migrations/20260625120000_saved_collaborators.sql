create table if not exists public.waiting_list_collaborators (
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  collaborator_user_id uuid not null references auth.users (id) on delete cascade,
  last_shared_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_user_id, collaborator_user_id),
  constraint waiting_list_collaborators_not_self_check
    check (owner_user_id <> collaborator_user_id)
);

create index if not exists waiting_list_collaborators_owner_user_id_idx
  on public.waiting_list_collaborators (owner_user_id, last_shared_at desc);

create index if not exists waiting_list_collaborators_collaborator_user_id_idx
  on public.waiting_list_collaborators (collaborator_user_id);

drop trigger if exists waiting_list_collaborators_set_updated_at on public.waiting_list_collaborators;
create trigger waiting_list_collaborators_set_updated_at
  before update on public.waiting_list_collaborators
  for each row execute function public.set_updated_at();

create or replace function public.remember_waiting_list_collaborator(
  target_owner_user_id uuid,
  target_collaborator_user_id uuid
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.waiting_list_collaborators (
    owner_user_id,
    collaborator_user_id,
    last_shared_at
  )
  values (
    target_owner_user_id,
    target_collaborator_user_id,
    now()
  )
  on conflict (owner_user_id, collaborator_user_id) do update
    set last_shared_at = excluded.last_shared_at;
$$;

create or replace function public.remember_waiting_list_collaborator_pair(
  first_user_id uuid,
  second_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if first_user_id is null or second_user_id is null or first_user_id = second_user_id then
    return;
  end if;

  perform public.remember_waiting_list_collaborator(first_user_id, second_user_id);
  perform public.remember_waiting_list_collaborator(second_user_id, first_user_id);
end;
$$;

create or replace function public.list_waiting_list_saved_collaborators()
returns table (
  user_id uuid,
  email text,
  display_name text,
  avatar_url text,
  last_shared_at timestamptz
)
language sql
security definer
stable
set search_path = public, auth
as $$
  select
    profile.id as user_id,
    profile.email,
    profile.display_name,
    profile.avatar_url,
    collaborator.last_shared_at
  from public.waiting_list_collaborators collaborator
  join public.profiles profile
    on profile.id = collaborator.collaborator_user_id
  where collaborator.owner_user_id = auth.uid()
  order by collaborator.last_shared_at desc, profile.display_name nulls last, profile.email nulls last;
$$;

create or replace function public.share_waiting_list_folder_with_user(
  target_folder_id text,
  target_user_id uuid,
  share_role text default 'viewer',
  share_scope text default 'folder_only'
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_owner_id uuid;
  next_share_id uuid;
begin
  if target_user_id is null or target_user_id = auth.uid() then
    raise exception 'Choose a collaborator to share with.';
  end if;

  if share_role not in ('viewer', 'editor') then
    raise exception 'Unsupported share role.';
  end if;

  if share_scope not in ('folder_only', 'folder_and_subfolders') then
    raise exception 'Unsupported share scope.';
  end if;

  select folder.owner_id
    into target_owner_id
  from public.waiting_list_folders folder
  where folder.id = target_folder_id;

  if target_owner_id is null or target_owner_id <> auth.uid() then
    raise exception 'Only the folder owner can share this folder.';
  end if;

  if not exists (
    select 1
    from public.waiting_list_collaborators collaborator
    where collaborator.owner_user_id = auth.uid()
      and collaborator.collaborator_user_id = target_user_id
  ) then
    raise exception 'Choose a saved collaborator.';
  end if;

  insert into public.waiting_list_folder_shares (
    folder_id,
    owner_id,
    shared_with_user_id,
    role,
    scope
  )
  values (
    target_folder_id,
    target_owner_id,
    target_user_id,
    share_role,
    share_scope
  )
  on conflict (folder_id, shared_with_user_id) do update
    set role = excluded.role,
        scope = excluded.scope,
        owner_id = excluded.owner_id
  returning id into next_share_id;

  perform public.remember_waiting_list_collaborator_pair(target_owner_id, target_user_id);

  return next_share_id;
end;
$$;

create or replace function public.list_waiting_list_folder_access(target_folder_id text)
returns table (
  access_kind text,
  share_id uuid,
  user_id uuid,
  email text,
  display_name text,
  avatar_url text,
  role text,
  scope text,
  source_folder_id text,
  source_folder_name text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
stable
set search_path = public, auth
as $$
  with recursive target as (
    select folder.id, folder.owner_id, folder.parent_folder_id, folder.name
    from public.waiting_list_folders folder
    where folder.id = target_folder_id
      and public.can_access_folder(folder.id)
  ),
  ancestors as (
    select target.id, target.parent_folder_id, target.name, 0 as depth
    from target

    union all

    select parent.id, parent.parent_folder_id, parent.name, ancestors.depth + 1
    from public.waiting_list_folders parent
    join ancestors on ancestors.parent_folder_id = parent.id
  ),
  candidate_shares as (
    select
      case
        when share.folder_id = target.id then 'direct'
        else 'inherited'
      end as access_kind,
      share.id as share_id,
      share.shared_with_user_id as user_id,
      share.role,
      share.scope,
      share.folder_id as source_folder_id,
      source_folder.name as source_folder_name,
      share.created_at,
      share.updated_at,
      case share.role when 'editor' then 2 else 1 end as role_rank,
      case when share.folder_id = target.id then 0 else 1 end as source_rank,
      ancestors.depth
    from target
    join ancestors
      on true
    join public.waiting_list_folder_shares share
      on share.owner_id = target.owner_id
      and share.folder_id = ancestors.id
      and (
        share.folder_id = target.id
        or share.scope = 'folder_and_subfolders'
      )
    join public.waiting_list_folders source_folder
      on source_folder.id = share.folder_id
  ),
  ranked_shares as (
    select distinct on (candidate_shares.user_id)
      candidate_shares.access_kind,
      candidate_shares.share_id,
      candidate_shares.user_id,
      candidate_shares.role,
      candidate_shares.scope,
      candidate_shares.source_folder_id,
      candidate_shares.source_folder_name,
      candidate_shares.created_at,
      candidate_shares.updated_at
    from candidate_shares
    order by
      candidate_shares.user_id,
      candidate_shares.role_rank desc,
      candidate_shares.source_rank,
      candidate_shares.depth
  )
  select *
  from (
    select
      'owner'::text as access_kind,
      null::uuid as share_id,
      target.owner_id as user_id,
      profile.email,
      profile.display_name,
      profile.avatar_url,
      'owner'::text as role,
      'all'::text as scope,
      target.id as source_folder_id,
      target.name as source_folder_name,
      null::timestamptz as created_at,
      null::timestamptz as updated_at
    from target
    left join public.profiles profile
      on profile.id = target.owner_id

    union all

    select
      ranked_shares.access_kind,
      ranked_shares.share_id,
      ranked_shares.user_id,
      profile.email,
      profile.display_name,
      profile.avatar_url,
      ranked_shares.role,
      ranked_shares.scope,
      ranked_shares.source_folder_id,
      ranked_shares.source_folder_name,
      ranked_shares.created_at,
      ranked_shares.updated_at
    from ranked_shares
    left join public.profiles profile
      on profile.id = ranked_shares.user_id
  ) access_rows
  order by
    case access_kind when 'owner' then 0 when 'direct' then 1 else 2 end,
    display_name nulls last,
    email nulls last;
$$;

create or replace function public.share_waiting_list_folder(
  target_folder_id text,
  target_email text,
  share_role text default 'viewer',
  share_scope text default 'folder_only'
)
returns table (
  share_id uuid,
  invite_id uuid,
  matched_user_id uuid
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  normalized_email text;
  target_owner_id uuid;
  target_user_id uuid;
  next_share_id uuid;
  next_invite_id uuid;
begin
  normalized_email := lower(trim(target_email));

  if normalized_email is null or length(normalized_email) < 4 or position('@' in normalized_email) = 0 then
    raise exception 'A valid email address is required.';
  end if;

  if share_role not in ('viewer', 'editor') then
    raise exception 'Unsupported share role.';
  end if;

  if share_scope not in ('folder_only', 'folder_and_subfolders') then
    raise exception 'Unsupported share scope.';
  end if;

  if normalized_email = lower(trim(auth.jwt() ->> 'email')) then
    raise exception 'You already own this folder.';
  end if;

  select folder.owner_id
    into target_owner_id
  from public.waiting_list_folders folder
  where folder.id = target_folder_id;

  if target_owner_id is null or target_owner_id <> auth.uid() then
    raise exception 'Only the folder owner can share this folder.';
  end if;

  select profile.id
    into target_user_id
  from public.profiles profile
  where lower(profile.email) = normalized_email
    and profile.id <> auth.uid()
  limit 1;

  if target_user_id is not null then
    insert into public.waiting_list_folder_shares (
      folder_id,
      owner_id,
      shared_with_user_id,
      role,
      scope
    )
    values (
      target_folder_id,
      target_owner_id,
      target_user_id,
      share_role,
      share_scope
    )
    on conflict (folder_id, shared_with_user_id) do update
      set role = excluded.role,
          scope = excluded.scope,
          owner_id = excluded.owner_id
    returning id into next_share_id;

    perform public.remember_waiting_list_collaborator_pair(target_owner_id, target_user_id);

    share_id := next_share_id;
    invite_id := null;
    matched_user_id := target_user_id;
    return next;
    return;
  end if;

  select invite.id
    into next_invite_id
  from public.waiting_list_folder_share_invites invite
  where invite.folder_id = target_folder_id
    and lower(invite.email) = normalized_email
    and invite.status = 'pending'
  limit 1;

  if next_invite_id is not null then
    update public.waiting_list_folder_share_invites
      set role = share_role,
          scope = share_scope,
          owner_id = target_owner_id
    where id = next_invite_id;
  else
    insert into public.waiting_list_folder_share_invites (
      folder_id,
      owner_id,
      email,
      role,
      scope
    )
    values (
      target_folder_id,
      target_owner_id,
      normalized_email,
      share_role,
      share_scope
    )
    returning id into next_invite_id;
  end if;

  share_id := null;
  invite_id := next_invite_id;
  matched_user_id := null;
  return next;
end;
$$;

create or replace function public.accept_waiting_list_folder_invite(invite_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_email text;
  invite_record public.waiting_list_folder_share_invites%rowtype;
  next_share_id uuid;
begin
  current_email := lower(trim(auth.jwt() ->> 'email'));

  if current_email is null or current_email = '' then
    raise exception 'A signed-in email address is required.';
  end if;

  select *
    into invite_record
  from public.waiting_list_folder_share_invites invite
  where invite.token = invite_token
    and invite.status = 'pending'
    and lower(invite.email) = current_email
  limit 1;

  if invite_record.id is null then
    raise exception 'Invite not found.';
  end if;

  insert into public.waiting_list_folder_shares (
    folder_id,
    owner_id,
    shared_with_user_id,
    role,
    scope
  )
  values (
    invite_record.folder_id,
    invite_record.owner_id,
    auth.uid(),
    invite_record.role,
    invite_record.scope
  )
  on conflict (folder_id, shared_with_user_id) do update
    set role = excluded.role,
        scope = excluded.scope,
        owner_id = excluded.owner_id
  returning id into next_share_id;

  perform public.remember_waiting_list_collaborator_pair(invite_record.owner_id, auth.uid());

  update public.waiting_list_folder_share_invites
    set status = 'accepted',
        accepted_by_user_id = auth.uid(),
        accepted_at = now()
  where id = invite_record.id;

  return next_share_id;
end;
$$;

revoke all on function public.remember_waiting_list_collaborator(uuid, uuid) from public;
revoke all on function public.remember_waiting_list_collaborator_pair(uuid, uuid) from public;
revoke all on function public.list_waiting_list_saved_collaborators() from public;
revoke all on function public.list_waiting_list_folder_access(text) from public;
revoke all on function public.share_waiting_list_folder_with_user(text, uuid, text, text) from public;
revoke all on function public.share_waiting_list_folder(text, text, text, text) from public;
revoke all on function public.accept_waiting_list_folder_invite(uuid) from public;

grant execute on function public.list_waiting_list_saved_collaborators() to authenticated;
grant execute on function public.list_waiting_list_folder_access(text) to authenticated;
grant execute on function public.share_waiting_list_folder_with_user(text, uuid, text, text) to authenticated;
grant execute on function public.share_waiting_list_folder(text, text, text, text) to authenticated;
grant execute on function public.accept_waiting_list_folder_invite(uuid) to authenticated;

alter table public.waiting_list_collaborators enable row level security;

drop policy if exists "waiting_list_collaborators_select_own" on public.waiting_list_collaborators;
drop policy if exists "waiting_list_collaborators_delete_own" on public.waiting_list_collaborators;

create policy "waiting_list_collaborators_select_own"
  on public.waiting_list_collaborators for select
  using (auth.uid() = owner_user_id);

create policy "waiting_list_collaborators_delete_own"
  on public.waiting_list_collaborators for delete
  using (auth.uid() = owner_user_id);

drop policy if exists "profiles_select_saved_collaborators" on public.profiles;
create policy "profiles_select_saved_collaborators"
  on public.profiles for select
  using (
    exists (
      select 1
      from public.waiting_list_collaborators collaborator
      where collaborator.owner_user_id = auth.uid()
        and collaborator.collaborator_user_id = profiles.id
    )
  );

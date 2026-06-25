-- Normalized collaboration schema for shared Waiting List folders and items.
-- This runs alongside waiting_list_data while the app migrates off JSON payload sync.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.waiting_list_sync_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  normalized_initialized boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.waiting_list_folders (
  id text primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  parent_folder_id text references public.waiting_list_folders (id) on delete cascade,
  name text not null,
  icon text,
  color text,
  purpose text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.waiting_list_items (
  id text primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  folder_id text references public.waiting_list_folders (id) on delete cascade,
  title text not null,
  description text,
  type text not null,
  url text,
  source_url text,
  source_platform text,
  shared_text text,
  media_uri text,
  thumbnail_uri text,
  media jsonb,
  media_items jsonb,
  attachments jsonb,
  list_items jsonb,
  rich_text text,
  connections jsonb,
  tags jsonb not null default '[]'::jsonb,
  status text not null default 'waiting',
  priority text not null default 'medium',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint waiting_list_items_type_check
    check (type in ('text', 'list', 'link', 'media', 'image', 'video')),
  constraint waiting_list_items_status_check
    check (status in ('waiting', 'planned', 'done', 'skipped')),
  constraint waiting_list_items_priority_check
    check (priority in ('low', 'medium', 'high')),
  constraint waiting_list_items_tags_array_check
    check (jsonb_typeof(tags) = 'array')
);

create table if not exists public.waiting_list_folder_shares (
  id uuid primary key default gen_random_uuid(),
  folder_id text not null references public.waiting_list_folders (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  shared_with_user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'viewer',
  scope text not null default 'folder_only',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint waiting_list_folder_shares_role_check
    check (role in ('viewer', 'editor')),
  constraint waiting_list_folder_shares_scope_check
    check (scope in ('folder_only', 'folder_and_subfolders')),
  constraint waiting_list_folder_shares_not_self_check
    check (owner_id <> shared_with_user_id),
  constraint waiting_list_folder_shares_folder_user_key
    unique (folder_id, shared_with_user_id)
);

create table if not exists public.waiting_list_folder_share_invites (
  id uuid primary key default gen_random_uuid(),
  folder_id text not null references public.waiting_list_folders (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  email text not null,
  role text not null default 'viewer',
  scope text not null default 'folder_only',
  status text not null default 'pending',
  token uuid not null default gen_random_uuid(),
  accepted_by_user_id uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint waiting_list_folder_share_invites_role_check
    check (role in ('viewer', 'editor')),
  constraint waiting_list_folder_share_invites_scope_check
    check (scope in ('folder_only', 'folder_and_subfolders')),
  constraint waiting_list_folder_share_invites_status_check
    check (status in ('pending', 'accepted', 'revoked')),
  constraint waiting_list_folder_share_invites_email_check
    check (length(trim(email)) > 3)
);

create index if not exists waiting_list_folders_owner_id_idx
  on public.waiting_list_folders (owner_id);

create index if not exists waiting_list_sync_state_updated_at_idx
  on public.waiting_list_sync_state (updated_at desc);

create index if not exists waiting_list_folders_parent_folder_id_idx
  on public.waiting_list_folders (parent_folder_id);

create index if not exists waiting_list_folders_updated_at_idx
  on public.waiting_list_folders (updated_at desc);

create index if not exists waiting_list_items_owner_id_idx
  on public.waiting_list_items (owner_id);

create index if not exists waiting_list_items_created_by_idx
  on public.waiting_list_items (created_by);

create index if not exists waiting_list_items_folder_id_idx
  on public.waiting_list_items (folder_id);

create index if not exists waiting_list_items_updated_at_idx
  on public.waiting_list_items (updated_at desc);

create index if not exists waiting_list_folder_shares_folder_id_idx
  on public.waiting_list_folder_shares (folder_id);

create index if not exists waiting_list_folder_shares_owner_id_idx
  on public.waiting_list_folder_shares (owner_id);

create index if not exists waiting_list_folder_shares_shared_with_user_id_idx
  on public.waiting_list_folder_shares (shared_with_user_id);

create index if not exists waiting_list_folder_share_invites_owner_id_idx
  on public.waiting_list_folder_share_invites (owner_id);

create index if not exists waiting_list_folder_share_invites_folder_id_idx
  on public.waiting_list_folder_share_invites (folder_id);

create unique index if not exists waiting_list_folder_share_invites_token_key
  on public.waiting_list_folder_share_invites (token);

create unique index if not exists waiting_list_folder_share_invites_pending_email_key
  on public.waiting_list_folder_share_invites (folder_id, lower(email))
  where status = 'pending';

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists waiting_list_sync_state_set_updated_at on public.waiting_list_sync_state;
create trigger waiting_list_sync_state_set_updated_at
  before update on public.waiting_list_sync_state
  for each row execute function public.set_updated_at();

drop trigger if exists waiting_list_folders_set_updated_at on public.waiting_list_folders;
create trigger waiting_list_folders_set_updated_at
  before update on public.waiting_list_folders
  for each row execute function public.set_updated_at();

drop trigger if exists waiting_list_items_set_updated_at on public.waiting_list_items;
create trigger waiting_list_items_set_updated_at
  before update on public.waiting_list_items
  for each row execute function public.set_updated_at();

drop trigger if exists waiting_list_folder_shares_set_updated_at on public.waiting_list_folder_shares;
create trigger waiting_list_folder_shares_set_updated_at
  before update on public.waiting_list_folder_shares
  for each row execute function public.set_updated_at();

drop trigger if exists waiting_list_folder_share_invites_set_updated_at on public.waiting_list_folder_share_invites;
create trigger waiting_list_folder_share_invites_set_updated_at
  before update on public.waiting_list_folder_share_invites
  for each row execute function public.set_updated_at();

create or replace function public.folder_scope_contains(scope_root_id text, target_folder_id text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  with recursive ancestors(id, parent_folder_id, visited) as (
    select folder.id, folder.parent_folder_id, array[folder.id]
    from public.waiting_list_folders folder
    where folder.id = target_folder_id

    union all

    select parent.id, parent.parent_folder_id, ancestors.visited || parent.id
    from public.waiting_list_folders parent
    join ancestors on ancestors.parent_folder_id = parent.id
    where not parent.id = any(ancestors.visited)
  )
  select exists (
    select 1
    from ancestors
    where ancestors.id = scope_root_id
  );
$$;

create or replace function public.can_access_folder(target_folder_id text)
returns boolean
language sql
security definer
stable
set search_path = public, auth
as $$
  select coalesce(
    exists (
      select 1
      from public.waiting_list_folders folder
      where folder.id = target_folder_id
        and folder.owner_id = auth.uid()
    )
    or exists (
      select 1
      from public.waiting_list_folder_shares share
      where share.shared_with_user_id = auth.uid()
        and (
          share.folder_id = target_folder_id
          or (
            share.scope = 'folder_and_subfolders'
            and public.folder_scope_contains(share.folder_id, target_folder_id)
          )
        )
    ),
    false
  );
$$;

create or replace function public.owns_folder(target_folder_id text)
returns boolean
language sql
security definer
stable
set search_path = public, auth
as $$
  select coalesce(
    exists (
      select 1
      from public.waiting_list_folders folder
      where folder.id = target_folder_id
        and folder.owner_id = auth.uid()
    ),
    false
  );
$$;

create or replace function public.folder_is_owned_by(target_folder_id text, target_owner_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    exists (
      select 1
      from public.waiting_list_folders folder
      where folder.id = target_folder_id
        and folder.owner_id = target_owner_id
    ),
    false
  );
$$;

create or replace function public.can_edit_folder(target_folder_id text)
returns boolean
language sql
security definer
stable
set search_path = public, auth
as $$
  select coalesce(
    exists (
      select 1
      from public.waiting_list_folders folder
      where folder.id = target_folder_id
        and folder.owner_id = auth.uid()
    )
    or exists (
      select 1
      from public.waiting_list_folder_shares share
      where share.shared_with_user_id = auth.uid()
        and share.role = 'editor'
        and (
          share.folder_id = target_folder_id
          or (
            share.scope = 'folder_and_subfolders'
            and public.folder_scope_contains(share.folder_id, target_folder_id)
          )
        )
    ),
    false
  );
$$;

create or replace function public.can_access_item(target_item_id text)
returns boolean
language sql
security definer
stable
set search_path = public, auth
as $$
  select coalesce(
    exists (
      select 1
      from public.waiting_list_items item
      where item.id = target_item_id
        and (
          (
            item.folder_id is null
            and item.owner_id = auth.uid()
          )
          or public.can_access_folder(item.folder_id)
        )
    ),
    false
  );
$$;

create or replace function public.can_edit_item(target_item_id text)
returns boolean
language sql
security definer
stable
set search_path = public, auth
as $$
  select coalesce(
    exists (
      select 1
      from public.waiting_list_items item
      where item.id = target_item_id
        and (
          (
            item.folder_id is null
            and item.owner_id = auth.uid()
          )
          or public.can_edit_folder(item.folder_id)
        )
    ),
    false
  );
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

  update public.waiting_list_folder_share_invites
    set status = 'accepted',
        accepted_by_user_id = auth.uid(),
        accepted_at = now()
  where id = invite_record.id;

  return next_share_id;
end;
$$;

revoke all on function public.set_updated_at() from public;
revoke all on function public.folder_scope_contains(text, text) from public;
revoke all on function public.can_access_folder(text) from public;
revoke all on function public.owns_folder(text) from public;
revoke all on function public.folder_is_owned_by(text, uuid) from public;
revoke all on function public.can_edit_folder(text) from public;
revoke all on function public.can_access_item(text) from public;
revoke all on function public.can_edit_item(text) from public;
revoke all on function public.share_waiting_list_folder(text, text, text, text) from public;
revoke all on function public.accept_waiting_list_folder_invite(uuid) from public;

grant execute on function public.folder_scope_contains(text, text) to authenticated;
grant execute on function public.can_access_folder(text) to authenticated;
grant execute on function public.owns_folder(text) to authenticated;
grant execute on function public.folder_is_owned_by(text, uuid) to authenticated;
grant execute on function public.can_edit_folder(text) to authenticated;
grant execute on function public.can_access_item(text) to authenticated;
grant execute on function public.can_edit_item(text) to authenticated;
grant execute on function public.share_waiting_list_folder(text, text, text, text) to authenticated;
grant execute on function public.accept_waiting_list_folder_invite(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.waiting_list_sync_state enable row level security;
alter table public.waiting_list_folders enable row level security;
alter table public.waiting_list_items enable row level security;
alter table public.waiting_list_folder_shares enable row level security;
alter table public.waiting_list_folder_share_invites enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_select_collaborators" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_select_collaborators"
  on public.profiles for select
  using (
    exists (
      select 1
      from public.waiting_list_folder_shares share
      where (
        share.owner_id = auth.uid()
        and share.shared_with_user_id = profiles.id
      )
      or (
        share.shared_with_user_id = auth.uid()
        and share.owner_id = profiles.id
      )
    )
  );

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "waiting_list_sync_state_select_own" on public.waiting_list_sync_state;
drop policy if exists "waiting_list_sync_state_insert_own" on public.waiting_list_sync_state;
drop policy if exists "waiting_list_sync_state_update_own" on public.waiting_list_sync_state;
drop policy if exists "waiting_list_sync_state_delete_own" on public.waiting_list_sync_state;

create policy "waiting_list_sync_state_select_own"
  on public.waiting_list_sync_state for select
  using (auth.uid() = user_id);

create policy "waiting_list_sync_state_insert_own"
  on public.waiting_list_sync_state for insert
  with check (auth.uid() = user_id);

create policy "waiting_list_sync_state_update_own"
  on public.waiting_list_sync_state for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "waiting_list_sync_state_delete_own"
  on public.waiting_list_sync_state for delete
  using (auth.uid() = user_id);

drop policy if exists "waiting_list_folders_select_accessible" on public.waiting_list_folders;
drop policy if exists "waiting_list_folders_insert_own" on public.waiting_list_folders;
drop policy if exists "waiting_list_folders_update_own" on public.waiting_list_folders;
drop policy if exists "waiting_list_folders_delete_own" on public.waiting_list_folders;

create policy "waiting_list_folders_select_accessible"
  on public.waiting_list_folders for select
  using (public.can_access_folder(id));

create policy "waiting_list_folders_insert_own"
  on public.waiting_list_folders for insert
  with check (
    auth.uid() = owner_id
    and (
      parent_folder_id is null
      or public.owns_folder(parent_folder_id)
    )
  );

create policy "waiting_list_folders_update_own"
  on public.waiting_list_folders for update
  using (auth.uid() = owner_id)
  with check (
    auth.uid() = owner_id
    and (
      parent_folder_id is null
      or public.owns_folder(parent_folder_id)
    )
  );

create policy "waiting_list_folders_delete_own"
  on public.waiting_list_folders for delete
  using (auth.uid() = owner_id);

drop policy if exists "waiting_list_items_select_accessible" on public.waiting_list_items;
drop policy if exists "waiting_list_items_insert_editable_folder" on public.waiting_list_items;
drop policy if exists "waiting_list_items_update_editable_folder" on public.waiting_list_items;
drop policy if exists "waiting_list_items_delete_editable_folder" on public.waiting_list_items;

create policy "waiting_list_items_select_accessible"
  on public.waiting_list_items for select
  using (
    (
      folder_id is null
      and auth.uid() = owner_id
    )
    or public.can_access_folder(folder_id)
  );

create policy "waiting_list_items_insert_editable_folder"
  on public.waiting_list_items for insert
  with check (
    created_by = auth.uid()
    and (
      (
        folder_id is null
        and auth.uid() = owner_id
      )
      or (
        folder_id is not null
        and public.can_edit_folder(folder_id)
        and public.folder_is_owned_by(folder_id, owner_id)
      )
    )
  );

create policy "waiting_list_items_update_editable_folder"
  on public.waiting_list_items for update
  using (
    (
      folder_id is null
      and auth.uid() = owner_id
    )
    or public.can_edit_folder(folder_id)
  )
  with check (
    (
      folder_id is null
      and auth.uid() = owner_id
    )
    or (
      folder_id is not null
      and public.can_edit_folder(folder_id)
      and public.folder_is_owned_by(folder_id, owner_id)
    )
  );

create policy "waiting_list_items_delete_editable_folder"
  on public.waiting_list_items for delete
  using (
    (
      folder_id is null
      and auth.uid() = owner_id
    )
    or public.can_edit_folder(folder_id)
  );

drop policy if exists "waiting_list_folder_shares_select_related" on public.waiting_list_folder_shares;
drop policy if exists "waiting_list_folder_shares_insert_owner" on public.waiting_list_folder_shares;
drop policy if exists "waiting_list_folder_shares_update_owner" on public.waiting_list_folder_shares;
drop policy if exists "waiting_list_folder_shares_delete_related" on public.waiting_list_folder_shares;

create policy "waiting_list_folder_shares_select_related"
  on public.waiting_list_folder_shares for select
  using (auth.uid() = owner_id or auth.uid() = shared_with_user_id);

create policy "waiting_list_folder_shares_insert_owner"
  on public.waiting_list_folder_shares for insert
  with check (
    auth.uid() = owner_id
    and public.owns_folder(folder_id)
  );

create policy "waiting_list_folder_shares_update_owner"
  on public.waiting_list_folder_shares for update
  using (auth.uid() = owner_id)
  with check (
    auth.uid() = owner_id
    and public.owns_folder(folder_id)
  );

create policy "waiting_list_folder_shares_delete_related"
  on public.waiting_list_folder_shares for delete
  using (auth.uid() = owner_id or auth.uid() = shared_with_user_id);

drop policy if exists "waiting_list_folder_share_invites_select_owner" on public.waiting_list_folder_share_invites;
drop policy if exists "waiting_list_folder_share_invites_select_recipient" on public.waiting_list_folder_share_invites;
drop policy if exists "waiting_list_folder_share_invites_insert_owner" on public.waiting_list_folder_share_invites;
drop policy if exists "waiting_list_folder_share_invites_update_owner" on public.waiting_list_folder_share_invites;
drop policy if exists "waiting_list_folder_share_invites_delete_owner" on public.waiting_list_folder_share_invites;

create policy "waiting_list_folder_share_invites_select_owner"
  on public.waiting_list_folder_share_invites for select
  using (auth.uid() = owner_id);

create policy "waiting_list_folder_share_invites_select_recipient"
  on public.waiting_list_folder_share_invites for select
  using (
    status = 'pending'
    and lower(email) = lower(auth.jwt() ->> 'email')
  );

create policy "waiting_list_folder_share_invites_insert_owner"
  on public.waiting_list_folder_share_invites for insert
  with check (
    auth.uid() = owner_id
    and public.owns_folder(folder_id)
  );

create policy "waiting_list_folder_share_invites_update_owner"
  on public.waiting_list_folder_share_invites for update
  using (auth.uid() = owner_id)
  with check (
    auth.uid() = owner_id
    and public.owns_folder(folder_id)
  );

create policy "waiting_list_folder_share_invites_delete_owner"
  on public.waiting_list_folder_share_invites for delete
  using (auth.uid() = owner_id);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'waiting_list_sync_state'
    ) then
      alter publication supabase_realtime add table public.waiting_list_sync_state;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'waiting_list_folders'
    ) then
      alter publication supabase_realtime add table public.waiting_list_folders;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'waiting_list_items'
    ) then
      alter publication supabase_realtime add table public.waiting_list_items;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'waiting_list_folder_shares'
    ) then
      alter publication supabase_realtime add table public.waiting_list_folder_shares;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'waiting_list_folder_share_invites'
    ) then
      alter publication supabase_realtime add table public.waiting_list_folder_share_invites;
    end if;
  end if;
end $$;

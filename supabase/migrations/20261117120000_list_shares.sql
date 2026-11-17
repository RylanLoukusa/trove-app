-- Share one list.
--
-- Until now a list was shared by sharing the folder it's in. This lets the
-- owner of a list share just that list with someone, to view or to edit. The
-- person sees it on their Home and gets its changes live, like a shared
-- folder. Someone without a Trove account yet is kept as a pending invite and
-- gets the list as soon as they sign up with that email.
--
-- A list's access now comes from its folder's shares or its own shares,
-- whichever gives more. Someone the list itself is shared with can change its
-- lines and settings (if they can edit), but can't move it, delete it or
-- share it on: that stays with the owner.

create table if not exists public.trove_list_shares (
  id uuid primary key default gen_random_uuid(),
  item_id text not null references public.trove_items (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  shared_with_user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'editor',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trove_list_shares_role_check
    check (role in ('viewer', 'editor')),
  constraint trove_list_shares_not_self_check
    check (owner_id <> shared_with_user_id),
  constraint trove_list_shares_item_user_key
    unique (item_id, shared_with_user_id)
);

create table if not exists public.trove_list_share_invites (
  id uuid primary key default gen_random_uuid(),
  item_id text not null references public.trove_items (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  email text not null,
  role text not null default 'editor',
  status text not null default 'pending',
  accepted_by_user_id uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trove_list_share_invites_role_check
    check (role in ('viewer', 'editor')),
  constraint trove_list_share_invites_status_check
    check (status in ('pending', 'accepted', 'revoked')),
  constraint trove_list_share_invites_email_check
    check (length(trim(email)) > 3)
);

create index if not exists trove_list_shares_item_id_idx
  on public.trove_list_shares (item_id);

create index if not exists trove_list_shares_owner_id_idx
  on public.trove_list_shares (owner_id);

create index if not exists trove_list_shares_shared_with_user_id_idx
  on public.trove_list_shares (shared_with_user_id);

create index if not exists trove_list_share_invites_item_id_idx
  on public.trove_list_share_invites (item_id);

create unique index if not exists trove_list_share_invites_pending_email_key
  on public.trove_list_share_invites (item_id, lower(email))
  where status = 'pending';

create index if not exists trove_list_share_invites_pending_lookup_idx
  on public.trove_list_share_invites (lower(email))
  where status = 'pending';

drop trigger if exists trove_list_shares_set_updated_at on public.trove_list_shares;
create trigger trove_list_shares_set_updated_at
  before update on public.trove_list_shares
  for each row execute function public.set_updated_at();

drop trigger if exists trove_list_share_invites_set_updated_at on public.trove_list_share_invites;
create trigger trove_list_share_invites_set_updated_at
  before update on public.trove_list_share_invites
  for each row execute function public.set_updated_at();

-- A share coming, changing or going is news for the person it's with: their
-- app pulls when their sync state moves, and a removed share leaves no row
-- with a newer time behind to notice otherwise.
create or replace function public.trove_touch_list_share_recipient()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient uuid;
begin
  if tg_op = 'DELETE' then
    recipient := old.shared_with_user_id;
  else
    recipient := new.shared_with_user_id;
  end if;

  insert into public.trove_sync_state (user_id, updated_at)
  values (recipient, now())
  on conflict (user_id) do update set updated_at = now();

  if tg_op = 'UPDATE' and old.shared_with_user_id <> new.shared_with_user_id then
    insert into public.trove_sync_state (user_id, updated_at)
    values (old.shared_with_user_id, now())
    on conflict (user_id) do update set updated_at = now();
  end if;

  return coalesce(new, old);
end;
$$;

revoke all on function public.trove_touch_list_share_recipient() from public;

drop trigger if exists trove_list_shares_touch_recipient on public.trove_list_shares;
create trigger trove_list_shares_touch_recipient
  after insert or update or delete on public.trove_list_shares
  for each row execute function public.trove_touch_list_share_recipient();

-- The role the signed-in person has on a list through its own shares, or null.
create or replace function public.trove_list_share_role(target_item_id text)
returns text
language sql
security definer
stable
set search_path = public, auth
as $$
  select share.role
  from public.trove_list_shares share
  where share.item_id = target_item_id
    and share.shared_with_user_id = auth.uid()
  limit 1;
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
      from public.trove_items item
      where item.id = target_item_id
        and (
          (
            item.folder_id is null
            and item.owner_id = auth.uid()
          )
          or public.can_access_folder(item.folder_id)
        )
    )
    or public.trove_list_share_role(target_item_id) is not null,
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
      from public.trove_items item
      where item.id = target_item_id
        and (
          (
            item.folder_id is null
            and item.owner_id = auth.uid()
          )
          or public.can_edit_folder(item.folder_id)
        )
    )
    or public.trove_list_share_role(target_item_id) = 'editor',
    false
  );
$$;

-- Can edit the list through its folder or as its owner, not only through a
-- share of the list itself. Moving, deleting and sharing need this.
create or replace function public.can_manage_item(target_item_id text)
returns boolean
language sql
security definer
stable
set search_path = public, auth
as $$
  select coalesce(
    exists (
      select 1
      from public.trove_items item
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

revoke all on function public.trove_list_share_role(text) from public;
revoke all on function public.can_manage_item(text) from public;
grant execute on function public.trove_list_share_role(text) to authenticated;
grant execute on function public.can_manage_item(text) to authenticated;

-- Lists can be read by the people they're shared with. Writes still go
-- through the sync functions below.
drop policy if exists "waiting_list_items_select_accessible" on public.trove_items;
drop policy if exists "trove_items_select_accessible" on public.trove_items;
create policy "trove_items_select_accessible"
  on public.trove_items for select
  using (
    (
      folder_id is null
      and auth.uid() = owner_id
    )
    or public.can_access_folder(folder_id)
    or public.trove_list_share_role(id) is not null
  );

alter table public.trove_list_shares enable row level security;
alter table public.trove_list_share_invites enable row level security;

drop policy if exists "trove_list_shares_select_related" on public.trove_list_shares;
drop policy if exists "trove_list_shares_update_owner" on public.trove_list_shares;
drop policy if exists "trove_list_shares_delete_related" on public.trove_list_shares;

-- Shares are made by trove_share_list. The owner can change the role or take
-- a share away, and the person it's with can leave.
create policy "trove_list_shares_select_related"
  on public.trove_list_shares for select
  using (auth.uid() = owner_id or auth.uid() = shared_with_user_id);

create policy "trove_list_shares_update_owner"
  on public.trove_list_shares for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "trove_list_shares_delete_related"
  on public.trove_list_shares for delete
  using (auth.uid() = owner_id or auth.uid() = shared_with_user_id);

drop policy if exists "trove_list_share_invites_select_owner" on public.trove_list_share_invites;
drop policy if exists "trove_list_share_invites_update_owner" on public.trove_list_share_invites;
drop policy if exists "trove_list_share_invites_delete_owner" on public.trove_list_share_invites;

create policy "trove_list_share_invites_select_owner"
  on public.trove_list_share_invites for select
  using (auth.uid() = owner_id);

create policy "trove_list_share_invites_update_owner"
  on public.trove_list_share_invites for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "trove_list_share_invites_delete_owner"
  on public.trove_list_share_invites for delete
  using (auth.uid() = owner_id);

-- Shares a list with someone by email, or with a saved collaborator by id.
-- Returns 'share' when they have an account (they get the list right away)
-- or 'invite' when they don't yet.
create or replace function public.trove_share_list(
  target_item_id text,
  target_email text default null,
  target_user_id uuid default null,
  share_role text default 'editor'
)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_email text := lower(trim(coalesce(target_email, '')));
  item_owner_id uuid;
  item_type text;
  recipient_id uuid := target_user_id;
begin
  if current_user_id is null then
    raise exception 'Sign in to share lists.';
  end if;

  if share_role not in ('viewer', 'editor') then
    raise exception 'Unsupported share role.';
  end if;

  select item.owner_id, item.type
    into item_owner_id, item_type
  from public.trove_items item
  where item.id = target_item_id;

  if item_owner_id is null then
    raise exception 'Sync this list before sharing it.';
  end if;

  if item_type <> 'list' then
    raise exception 'Only lists can be shared this way.';
  end if;

  if item_owner_id <> current_user_id then
    raise exception 'Only the owner of this list can share it.';
  end if;

  if recipient_id is null then
    if length(normalized_email) < 4 or position('@' in normalized_email) = 0 then
      raise exception 'A valid email address is required.';
    end if;

    if normalized_email = lower(trim(coalesce(auth.jwt() ->> 'email', ''))) then
      raise exception 'You already own this list.';
    end if;

    select profile.id
      into recipient_id
    from public.profiles profile
    where lower(profile.email) = normalized_email
    limit 1;
  elsif not exists (
    select 1
    from public.trove_collaborators collaborator
    where collaborator.owner_user_id = current_user_id
      and collaborator.collaborator_user_id = recipient_id
  ) then
    raise exception 'Share with this person by email.';
  end if;

  if recipient_id = current_user_id then
    raise exception 'You already own this list.';
  end if;

  if recipient_id is null then
    update public.trove_list_share_invites invite
      set role = share_role
    where invite.item_id = target_item_id
      and lower(invite.email) = normalized_email
      and invite.status = 'pending';

    if not found then
      insert into public.trove_list_share_invites (item_id, owner_id, email, role)
      values (target_item_id, current_user_id, normalized_email, share_role);
    end if;

    return 'invite';
  end if;

  insert into public.trove_list_shares (item_id, owner_id, shared_with_user_id, role)
  values (target_item_id, current_user_id, recipient_id, share_role)
  on conflict (item_id, shared_with_user_id) do update
    set role = excluded.role;

  perform public.trove_remember_collaborator_pair(current_user_id, recipient_id);

  return 'share';
end;
$$;

revoke all on function public.trove_share_list(text, text, uuid, text) from public;
grant execute on function public.trove_share_list(text, text, uuid, text) to authenticated;

-- Turns pending invites for the signed-in person's email into shares. The app
-- calls this when it syncs, so an invite sent before they had an account
-- arrives once they do. Returns how many were claimed.
create or replace function public.trove_claim_list_invites()
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  invite_record record;
  claimed integer := 0;
begin
  if current_user_id is null or current_email = '' then
    return 0;
  end if;

  for invite_record in
    select invite.id, invite.item_id, invite.owner_id, invite.role
    from public.trove_list_share_invites invite
    where invite.status = 'pending'
      and lower(invite.email) = current_email
    for update
  loop
    if invite_record.owner_id <> current_user_id then
      insert into public.trove_list_shares (item_id, owner_id, shared_with_user_id, role)
      values (invite_record.item_id, invite_record.owner_id, current_user_id, invite_record.role)
      on conflict (item_id, shared_with_user_id) do nothing;

      perform public.trove_remember_collaborator_pair(invite_record.owner_id, current_user_id);
      claimed := claimed + 1;
    end if;

    update public.trove_list_share_invites
      set status = 'accepted',
          accepted_by_user_id = current_user_id,
          accepted_at = now()
    where id = invite_record.id;
  end loop;

  return claimed;
end;
$$;

revoke all on function public.trove_claim_list_invites() from public;
grant execute on function public.trove_claim_list_invites() to authenticated;

-- Everyone with access to a list, for its Share screen: the owner, the people
-- it's shared with, and (for the owner only) invites still waiting.
create or replace function public.trove_list_access(target_item_id text)
returns table (
  access_kind text,
  id text,
  user_id uuid,
  email text,
  display_name text,
  avatar_url text,
  role text,
  created_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public, auth
as $$
declare
  item_owner_id uuid;
begin
  if not public.can_access_item(target_item_id) then
    raise exception 'List not found.';
  end if;

  select item.owner_id into item_owner_id
  from public.trove_items item
  where item.id = target_item_id;

  return query
  select 'owner'::text, item_owner_id::text, item_owner_id, profile.email, profile.display_name, profile.avatar_url,
    'owner'::text, null::timestamptz
  from (select 1) one
  left join public.profiles profile on profile.id = item_owner_id;

  return query
  select 'share'::text, share.id::text, share.shared_with_user_id, profile.email, profile.display_name,
    profile.avatar_url, share.role, share.created_at
  from public.trove_list_shares share
  left join public.profiles profile on profile.id = share.shared_with_user_id
  where share.item_id = target_item_id
  order by share.created_at;

  if item_owner_id = auth.uid() then
    return query
    select 'invite'::text, invite.id::text, null::uuid, invite.email, null::text, null::text,
      invite.role, invite.created_at
    from public.trove_list_share_invites invite
    where invite.item_id = target_item_id
      and invite.status = 'pending'
    order by invite.created_at;
  end if;
end;
$$;

revoke all on function public.trove_list_access(text) from public;
grant execute on function public.trove_list_access(text) to authenticated;

-- For the app's sync: the lists shared with the signed-in person (with their
-- role and who shared them), and how many people each of their own lists is
-- shared with.
create or replace function public.trove_list_share_summary()
returns table (
  item_id text,
  direction text,
  role text,
  people integer,
  owner_name text,
  updated_at timestamptz
)
language sql
security definer
stable
set search_path = public, auth
as $$
  select share.item_id, 'in'::text, share.role, 1,
    coalesce(nullif(trim(profile.display_name), ''), profile.email), share.updated_at
  from public.trove_list_shares share
  left join public.profiles profile on profile.id = share.owner_id
  where share.shared_with_user_id = auth.uid()

  union all

  select people.item_id, 'out'::text, null::text, people.total::integer, null::text, people.latest
  from (
    select shared.item_id, count(*) as total, max(shared.updated_at) as latest
    from (
      select share.item_id, share.updated_at
      from public.trove_list_shares share
      where share.owner_id = auth.uid()
      union all
      select invite.item_id, invite.updated_at
      from public.trove_list_share_invites invite
      where invite.owner_id = auth.uid()
        and invite.status = 'pending'
    ) shared
    group by shared.item_id
  ) people;
$$;

revoke all on function public.trove_list_share_summary() from public;
grant execute on function public.trove_list_share_summary() to authenticated;

-- The item upsert, as in 20261110140000_focus_list_rules.sql, except that
-- someone who can edit the list only through its own share keeps it where
-- the owner put it: their app has no folder for it, so it sends none.
create or replace function public.trove_upsert_item_for_current_user(
  target_item_id text,
  target_folder_id text,
  target_title text,
  target_description text default null,
  target_type text default 'text',
  target_url text default null,
  target_source_url text default null,
  target_source_platform text default null,
  target_shared_text text default null,
  target_media_uri text default null,
  target_thumbnail_uri text default null,
  target_media jsonb default null,
  target_media_items jsonb default null,
  target_attachments jsonb default null,
  target_list_items jsonb default null,
  target_rich_text text default null,
  target_connections jsonb default null,
  target_tags jsonb default '[]'::jsonb,
  target_status text default 'waiting',
  target_priority text default 'medium',
  target_notes text default null,
  target_created_at timestamptz default now(),
  target_updated_at timestamptz default now(),
  target_expected_updated_at timestamptz default null,
  target_list_mode text default null,
  target_focus_rule text default null
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  existing_updated_at timestamptz;
  existing_folder_id text;
  existing_owner_id uuid;
  normalized_folder_id text := nullif(target_folder_id, '');
  normalized_list_mode text := nullif(target_list_mode, '');
  normalized_focus_rule text := nullif(target_focus_rule, '');
  target_owner_id uuid;
  through_list_share boolean := false;
begin
  if current_user_id is null then
    raise exception 'Sign in to sync items.';
  end if;

  if nullif(target_item_id, '') is null then
    raise exception 'Item id is required.';
  end if;

  if nullif(target_title, '') is null then
    raise exception 'Item title is required.';
  end if;

  if target_type not in ('text', 'list', 'link', 'media', 'image', 'video') then
    raise exception 'Invalid item type.';
  end if;

  if normalized_list_mode is not null
    and (normalized_list_mode <> 'focus' or target_type <> 'list') then
    raise exception 'Invalid list mode.';
  end if;

  if normalized_focus_rule is not null
    and normalized_focus_rule not in ('none', 'due_today', 'due_week', 'due_weekend', 'high_priority') then
    raise exception 'Invalid focus rule.';
  end if;

  if target_status not in ('waiting', 'planned', 'done', 'skipped') then
    raise exception 'Invalid item status.';
  end if;

  if target_priority not in ('low', 'medium', 'high') then
    raise exception 'Invalid item priority.';
  end if;

  if jsonb_typeof(coalesce(target_tags, '[]'::jsonb)) <> 'array' then
    raise exception 'Item tags must be an array.';
  end if;

  select item.updated_at, item.folder_id, item.owner_id
    into existing_updated_at, existing_folder_id, existing_owner_id
  from public.trove_items item
  where item.id = target_item_id
  for update;

  if existing_updated_at is not null
    and not public.can_edit_item(target_item_id) then
    raise exception 'You do not have permission to sync this item.';
  end if;

  if existing_updated_at is not null
    and target_expected_updated_at is not null
    and existing_updated_at > target_expected_updated_at then
    raise exception 'Sync conflict: item changed remotely.';
  end if;

  through_list_share := existing_updated_at is not null
    and not public.can_manage_item(target_item_id);

  if through_list_share then
    normalized_folder_id := existing_folder_id;
    target_owner_id := existing_owner_id;
    if target_type <> 'list' then
      raise exception 'You do not have permission to sync this item.';
    end if;
  elsif normalized_folder_id is null then
    target_owner_id := current_user_id;
  else
    if not public.can_edit_folder(normalized_folder_id) then
      raise exception 'You do not have permission to sync items in this folder.';
    end if;

    select folder.owner_id
      into target_owner_id
    from public.trove_folders folder
    where folder.id = normalized_folder_id;

    if target_owner_id is null then
      raise exception 'Folder must be synced before this item.';
    end if;
  end if;

  insert into public.trove_items (
    id,
    owner_id,
    created_by,
    folder_id,
    title,
    description,
    type,
    url,
    source_url,
    source_platform,
    shared_text,
    media_uri,
    thumbnail_uri,
    media,
    media_items,
    attachments,
    list_items,
    rich_text,
    connections,
    tags,
    status,
    priority,
    notes,
    list_mode,
    focus_rule,
    created_at,
    updated_at
  )
  values (
    target_item_id,
    target_owner_id,
    current_user_id,
    normalized_folder_id,
    target_title,
    target_description,
    target_type,
    target_url,
    target_source_url,
    target_source_platform,
    target_shared_text,
    target_media_uri,
    target_thumbnail_uri,
    target_media,
    target_media_items,
    target_attachments,
    target_list_items,
    target_rich_text,
    target_connections,
    coalesce(target_tags, '[]'::jsonb),
    target_status,
    target_priority,
    target_notes,
    normalized_list_mode,
    case
      when normalized_list_mode = 'focus' and normalized_focus_rule <> 'none' then normalized_focus_rule
    end,
    coalesce(target_created_at, now()),
    coalesce(target_updated_at, now())
  )
  on conflict (id) do update
  set
    owner_id = excluded.owner_id,
    created_by = public.trove_items.created_by,
    folder_id = excluded.folder_id,
    title = excluded.title,
    description = excluded.description,
    type = excluded.type,
    url = excluded.url,
    source_url = excluded.source_url,
    source_platform = excluded.source_platform,
    shared_text = excluded.shared_text,
    media_uri = excluded.media_uri,
    thumbnail_uri = excluded.thumbnail_uri,
    media = excluded.media,
    media_items = excluded.media_items,
    attachments = excluded.attachments,
    list_items = excluded.list_items,
    rich_text = excluded.rich_text,
    connections = excluded.connections,
    tags = excluded.tags,
    status = excluded.status,
    priority = excluded.priority,
    notes = excluded.notes,
    list_mode = case
      when excluded.type <> 'list' then null
      else coalesce(excluded.list_mode, public.trove_items.list_mode)
    end,
    focus_rule = case
      when excluded.type <> 'list' then null
      when normalized_focus_rule is null then public.trove_items.focus_rule
      when normalized_focus_rule = 'none' then null
      else normalized_focus_rule
    end,
    updated_at = excluded.updated_at
  where public.can_edit_item(public.trove_items.id);

  if not found then
    raise exception 'You do not have permission to sync this item.';
  end if;
end;
$$;

-- Deleting a list for good is for its owner and folder editors. Someone it was
-- only shared with leaves it instead (by removing their share).
create or replace function public.trove_delete_item_for_current_user(
  target_item_id text,
  target_expected_updated_at timestamptz default null,
  skip_conflict_check boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  existing_updated_at timestamptz;
begin
  if current_user_id is null then
    raise exception 'Sign in to delete items.';
  end if;

  if nullif(target_item_id, '') is null then
    raise exception 'Item id is required.';
  end if;

  select item.updated_at
    into existing_updated_at
  from public.trove_items item
  where item.id = target_item_id
  for update;

  if existing_updated_at is null then
    return;
  end if;

  if not public.can_manage_item(target_item_id) then
    raise exception 'You do not have permission to delete this item.';
  end if;

  if not skip_conflict_check
    and target_expected_updated_at is not null
    and existing_updated_at > target_expected_updated_at then
    raise exception 'Sync conflict: item changed remotely.';
  end if;

  delete from public.trove_items item
  where item.id = target_item_id
    and public.can_manage_item(item.id);
end;
$$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'trove_list_shares'
    ) then
      alter publication supabase_realtime add table public.trove_list_shares;
    end if;
  end if;
end $$;

notify pgrst, 'reload schema';

-- Public, read-only shareable folder links: an owner can generate an unguessable
-- token that lets anyone view a folder's items without an account. Reads for that
-- token go through the get-public-folder edge function using the service role, so
-- this table intentionally has no anon-role policy — only the owner can query it
-- directly, and only via RLS below.

create table if not exists public.trove_folder_public_links (
  id uuid primary key default gen_random_uuid(),
  folder_id text not null references public.trove_folders (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  token uuid not null default gen_random_uuid(),
  scope text not null default 'folder_only',
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trove_folder_public_links_scope_check
    check (scope in ('folder_only', 'folder_and_subfolders'))
);

create index if not exists trove_folder_public_links_folder_id_idx
  on public.trove_folder_public_links (folder_id);

create index if not exists trove_folder_public_links_owner_id_idx
  on public.trove_folder_public_links (owner_id);

create unique index if not exists trove_folder_public_links_token_key
  on public.trove_folder_public_links (token);

-- At most one active (non-revoked) link per folder.
create unique index if not exists trove_folder_public_links_active_folder_key
  on public.trove_folder_public_links (folder_id)
  where revoked_at is null;

drop trigger if exists trove_folder_public_links_set_updated_at on public.trove_folder_public_links;
create trigger trove_folder_public_links_set_updated_at
  before update on public.trove_folder_public_links
  for each row execute function public.set_updated_at();

-- Used by the get-public-folder edge function (service role) to resolve which
-- folders to include for a folder_and_subfolders-scoped link, mirroring the
-- ancestor-walk in folder_scope_contains but in the descendant direction.
create or replace function public.trove_folder_descendant_ids(root_folder_id text)
returns text[]
language sql
security definer
stable
set search_path = public
as $$
  with recursive descendants(id) as (
    select folder.id
    from public.trove_folders folder
    where folder.parent_folder_id = root_folder_id

    union all

    select folder.id
    from public.trove_folders folder
    join descendants on descendants.id = folder.parent_folder_id
  )
  select coalesce(array_agg(id), array[]::text[]) from descendants;
$$;

revoke all on function public.trove_folder_descendant_ids(text) from public;
grant execute on function public.trove_folder_descendant_ids(text) to authenticated, service_role;

create or replace function public.trove_create_folder_public_link(
  target_folder_id text,
  target_scope text default 'folder_only'
)
returns table (
  id uuid,
  folder_id text,
  token uuid,
  scope text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  existing_owner_id uuid;
  next_id uuid;
begin
  if current_user_id is null then
    raise exception 'Sign in to create a shareable link.';
  end if;

  if nullif(target_folder_id, '') is null then
    raise exception 'Folder id is required.';
  end if;

  if target_scope not in ('folder_only', 'folder_and_subfolders') then
    raise exception 'Unsupported link scope.';
  end if;

  select folder.owner_id
    into existing_owner_id
  from public.trove_folders folder
  where folder.id = target_folder_id
  for update;

  if existing_owner_id is null then
    raise exception 'Folder must be synced before it can be shared.';
  end if;

  if existing_owner_id <> current_user_id then
    raise exception 'Only the folder owner can create a shareable link.';
  end if;

  -- Revoke any existing active link first so the insert below never collides
  -- with trove_folder_public_links_active_folder_key.
  update public.trove_folder_public_links link
  set revoked_at = now()
  where link.folder_id = target_folder_id
    and link.revoked_at is null;

  insert into public.trove_folder_public_links (
    folder_id,
    owner_id,
    scope
  )
  values (
    target_folder_id,
    current_user_id,
    target_scope
  )
  returning trove_folder_public_links.id into next_id;

  return query
    select link.id, link.folder_id, link.token, link.scope, link.created_at, link.updated_at
    from public.trove_folder_public_links link
    where link.id = next_id;
end;
$$;

create or replace function public.trove_revoke_folder_public_link(
  target_link_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Sign in to revoke a shareable link.';
  end if;

  if target_link_id is null then
    raise exception 'Link id is required.';
  end if;

  update public.trove_folder_public_links link
  set revoked_at = now()
  where link.id = target_link_id
    and link.owner_id = current_user_id
    and link.revoked_at is null;

  if not found then
    raise exception 'Shareable link not found.';
  end if;
end;
$$;

revoke all on function public.trove_create_folder_public_link(text, text) from public;
revoke all on function public.trove_revoke_folder_public_link(uuid) from public;

grant execute on function public.trove_create_folder_public_link(text, text) to authenticated;
grant execute on function public.trove_revoke_folder_public_link(uuid) to authenticated;

alter table public.trove_folder_public_links enable row level security;

drop policy if exists "trove_folder_public_links_select_owner" on public.trove_folder_public_links;
drop policy if exists "trove_folder_public_links_insert_owner" on public.trove_folder_public_links;
drop policy if exists "trove_folder_public_links_update_owner" on public.trove_folder_public_links;
drop policy if exists "trove_folder_public_links_delete_owner" on public.trove_folder_public_links;

create policy "trove_folder_public_links_select_owner"
  on public.trove_folder_public_links for select
  using (auth.uid() = owner_id);

create policy "trove_folder_public_links_insert_owner"
  on public.trove_folder_public_links for insert
  with check (
    auth.uid() = owner_id
    and public.owns_folder(folder_id)
  );

create policy "trove_folder_public_links_update_owner"
  on public.trove_folder_public_links for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "trove_folder_public_links_delete_owner"
  on public.trove_folder_public_links for delete
  using (auth.uid() = owner_id);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'trove_folder_public_links'
    ) then
      alter publication supabase_realtime add table public.trove_folder_public_links;
    end if;
  end if;
end $$;

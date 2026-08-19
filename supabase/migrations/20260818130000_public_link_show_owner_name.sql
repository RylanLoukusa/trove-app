-- Lets a folder owner opt in, at link-creation time, to showing their display name
-- on a public link's preview. Defaults to false (off) so existing/new links stay
-- anonymous unless the owner explicitly checks the box.

alter table public.trove_folder_public_links
  add column if not exists show_owner_name boolean not null default false;

drop function if exists public.trove_create_folder_public_link(text, text);

create or replace function public.trove_create_folder_public_link(
  target_folder_id text,
  target_scope text default 'folder_only',
  target_show_owner_name boolean default false
)
returns table (
  id uuid,
  folder_id text,
  token uuid,
  scope text,
  show_owner_name boolean,
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
    scope,
    show_owner_name
  )
  values (
    target_folder_id,
    current_user_id,
    target_scope,
    coalesce(target_show_owner_name, false)
  )
  returning trove_folder_public_links.id into next_id;

  return query
    select link.id, link.folder_id, link.token, link.scope, link.show_owner_name, link.created_at, link.updated_at
    from public.trove_folder_public_links link
    where link.id = next_id;
end;
$$;

revoke all on function public.trove_create_folder_public_link(text, text, boolean) from public;
grant execute on function public.trove_create_folder_public_link(text, text, boolean) to authenticated;

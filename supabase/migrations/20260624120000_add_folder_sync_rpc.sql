create or replace function public.upsert_waiting_list_folder_for_current_user(
  target_folder_id text,
  target_parent_folder_id text,
  target_name text,
  target_icon text default null,
  target_color text default null,
  target_purpose text default null,
  target_created_at timestamptz default now(),
  target_updated_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  existing_owner_id uuid;
  normalized_parent_folder_id text := nullif(target_parent_folder_id, '');
begin
  if current_user_id is null then
    raise exception 'Sign in to sync folders.';
  end if;

  if nullif(target_folder_id, '') is null then
    raise exception 'Folder id is required.';
  end if;

  if nullif(target_name, '') is null then
    raise exception 'Folder name is required.';
  end if;

  select folder.owner_id
    into existing_owner_id
  from public.waiting_list_folders folder
  where folder.id = target_folder_id;

  if existing_owner_id is not null and existing_owner_id <> current_user_id then
    raise exception 'Only the folder owner can sync this folder.';
  end if;

  if normalized_parent_folder_id is not null and not exists (
    select 1
    from public.waiting_list_folders parent
    where parent.id = normalized_parent_folder_id
      and parent.owner_id = current_user_id
  ) then
    raise exception 'Parent folder must be synced before this folder.';
  end if;

  insert into public.waiting_list_folders (
    id,
    owner_id,
    parent_folder_id,
    name,
    icon,
    color,
    purpose,
    created_at,
    updated_at
  )
  values (
    target_folder_id,
    current_user_id,
    normalized_parent_folder_id,
    target_name,
    target_icon,
    target_color,
    target_purpose,
    coalesce(target_created_at, now()),
    coalesce(target_updated_at, now())
  )
  on conflict (id) do update
  set
    parent_folder_id = excluded.parent_folder_id,
    name = excluded.name,
    icon = excluded.icon,
    color = excluded.color,
    purpose = excluded.purpose,
    updated_at = excluded.updated_at
  where public.waiting_list_folders.owner_id = current_user_id;

  if not found then
    raise exception 'Only the folder owner can sync this folder.';
  end if;
end;
$$;

revoke all on function public.upsert_waiting_list_folder_for_current_user(
  text,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  timestamptz
) from public;
grant execute on function public.upsert_waiting_list_folder_for_current_user(
  text,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  timestamptz
) to authenticated;

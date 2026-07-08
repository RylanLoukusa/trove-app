drop function if exists public.upsert_waiting_list_folder_for_current_user(
  text,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  timestamptz
);

create or replace function public.upsert_waiting_list_folder_for_current_user(
  target_folder_id text,
  target_parent_folder_id text,
  target_name text,
  target_icon text default null,
  target_color text default null,
  target_purpose text default null,
  target_created_at timestamptz default now(),
  target_updated_at timestamptz default now(),
  target_expected_updated_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  existing_owner_id uuid;
  existing_updated_at timestamptz;
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

  select folder.owner_id, folder.updated_at
    into existing_owner_id, existing_updated_at
  from public.waiting_list_folders folder
  where folder.id = target_folder_id
  for update;

  if existing_owner_id is not null and existing_owner_id <> current_user_id then
    raise exception 'Only the folder owner can sync this folder.';
  end if;

  if existing_updated_at is not null
    and target_expected_updated_at is not null
    and existing_updated_at > target_expected_updated_at then
    raise exception 'Sync conflict: folder changed remotely.';
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

create or replace function public.upsert_waiting_list_item_for_current_user(
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
  target_expected_updated_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  existing_updated_at timestamptz;
  normalized_folder_id text := nullif(target_folder_id, '');
  target_owner_id uuid;
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

  if target_status not in ('waiting', 'planned', 'done', 'skipped') then
    raise exception 'Invalid item status.';
  end if;

  if target_priority not in ('low', 'medium', 'high') then
    raise exception 'Invalid item priority.';
  end if;

  if jsonb_typeof(coalesce(target_tags, '[]'::jsonb)) <> 'array' then
    raise exception 'Item tags must be an array.';
  end if;

  select item.updated_at
    into existing_updated_at
  from public.waiting_list_items item
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

  if normalized_folder_id is null then
    target_owner_id := current_user_id;
  else
    if not public.can_edit_folder(normalized_folder_id) then
      raise exception 'You do not have permission to sync items in this folder.';
    end if;

    select folder.owner_id
      into target_owner_id
    from public.waiting_list_folders folder
    where folder.id = normalized_folder_id;

    if target_owner_id is null then
      raise exception 'Folder must be synced before this item.';
    end if;
  end if;

  insert into public.waiting_list_items (
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
    coalesce(target_created_at, now()),
    coalesce(target_updated_at, now())
  )
  on conflict (id) do update
  set
    owner_id = excluded.owner_id,
    created_by = public.waiting_list_items.created_by,
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
    updated_at = excluded.updated_at
  where public.can_edit_item(public.waiting_list_items.id);

  if not found then
    raise exception 'You do not have permission to sync this item.';
  end if;
end;
$$;

create or replace function public.delete_missing_waiting_list_items_for_current_user(
  local_item_ids text[],
  known_updated_at jsonb default '{}'::jsonb,
  skip_conflict_check boolean default false
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
    raise exception 'Sign in to sync items.';
  end if;

  if not skip_conflict_check and exists (
    select 1
    from public.waiting_list_items item
    where item.owner_id = current_user_id
      and not (item.id = any(coalesce(local_item_ids, array[]::text[])))
      and (
        not (known_updated_at ? item.id)
        or item.updated_at > ((known_updated_at ->> item.id)::timestamptz)
      )
  ) then
    raise exception 'Sync conflict: item changed remotely.';
  end if;

  delete from public.waiting_list_items item
  where item.owner_id = current_user_id
    and not (item.id = any(coalesce(local_item_ids, array[]::text[])));
end;
$$;

create or replace function public.delete_waiting_list_item_for_current_user(
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
  from public.waiting_list_items item
  where item.id = target_item_id
  for update;

  if existing_updated_at is null then
    return;
  end if;

  if not public.can_edit_item(target_item_id) then
    raise exception 'You do not have permission to delete this item.';
  end if;

  if not skip_conflict_check
    and target_expected_updated_at is not null
    and existing_updated_at > target_expected_updated_at then
    raise exception 'Sync conflict: item changed remotely.';
  end if;

  delete from public.waiting_list_items item
  where item.id = target_item_id
    and public.can_edit_item(item.id);
end;
$$;

create or replace function public.delete_missing_waiting_list_folders_for_current_user(
  local_folder_ids text[],
  known_updated_at jsonb default '{}'::jsonb,
  skip_conflict_check boolean default false
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
    raise exception 'Sign in to sync folders.';
  end if;

  if not skip_conflict_check and exists (
    select 1
    from public.waiting_list_folders folder
    where folder.owner_id = current_user_id
      and not (folder.id = any(coalesce(local_folder_ids, array[]::text[])))
      and (
        not (known_updated_at ? folder.id)
        or folder.updated_at > ((known_updated_at ->> folder.id)::timestamptz)
      )
  ) then
    raise exception 'Sync conflict: folder changed remotely.';
  end if;

  delete from public.waiting_list_folders folder
  where folder.owner_id = current_user_id
    and not (folder.id = any(coalesce(local_folder_ids, array[]::text[])));
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
  timestamptz,
  timestamptz
) to authenticated;

revoke all on function public.upsert_waiting_list_item_for_current_user(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  text,
  jsonb,
  jsonb,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  timestamptz
) from public;
grant execute on function public.upsert_waiting_list_item_for_current_user(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  text,
  jsonb,
  jsonb,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  timestamptz
) to authenticated;

revoke all on function public.delete_missing_waiting_list_items_for_current_user(
  text[],
  jsonb,
  boolean
) from public;
grant execute on function public.delete_missing_waiting_list_items_for_current_user(
  text[],
  jsonb,
  boolean
) to authenticated;

revoke all on function public.delete_waiting_list_item_for_current_user(
  text,
  timestamptz,
  boolean
) from public;
grant execute on function public.delete_waiting_list_item_for_current_user(
  text,
  timestamptz,
  boolean
) to authenticated;

revoke all on function public.delete_missing_waiting_list_folders_for_current_user(
  text[],
  jsonb,
  boolean
) from public;
grant execute on function public.delete_missing_waiting_list_folders_for_current_user(
  text[],
  jsonb,
  boolean
) to authenticated;

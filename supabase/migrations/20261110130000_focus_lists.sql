-- Focus lists (lists phase 3).
--
-- A focus list ("Today", "This weekend") is a list whose lines can be
-- references to lines in other lists. A reference is an ordinary row in
-- trove_list_entries with ref_entry_id set: its position orders it within the
-- focus list, and everything else (text, checked, due date, priority, notes)
-- is read from the referenced line, which stays in its own list. Checking a
-- referenced line checks the original. Deleting the original removes its
-- references. A focus list can also have lines of its own.

alter table public.trove_items add column if not exists list_mode text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'trove_items_list_mode_check'
  ) then
    alter table public.trove_items
      add constraint trove_items_list_mode_check
      check (list_mode is null or (list_mode = 'focus' and type = 'list'));
  end if;
end $$;

alter table public.trove_list_entries
  add column if not exists ref_entry_id text
  references public.trove_list_entries (id) on delete cascade;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'trove_list_entries_ref_not_self_check'
  ) then
    alter table public.trove_list_entries
      add constraint trove_list_entries_ref_not_self_check
      check (ref_entry_id is null or ref_entry_id <> id);
  end if;
end $$;

-- A line appears at most once in a given focus list.
create unique index if not exists trove_list_entries_list_ref_idx
  on public.trove_list_entries (list_id, ref_entry_id)
  where ref_entry_id is not null;

create index if not exists trove_list_entries_ref_entry_id_idx
  on public.trove_list_entries (ref_entry_id)
  where ref_entry_id is not null;

-- The item upsert gains target_list_mode. The old signature is dropped first
-- so PostgREST has a single function to call; the new parameter defaults to
-- null, so app versions that don't send it keep working, and null leaves an
-- existing list's mode alone.
drop function if exists public.trove_upsert_item_for_current_user(
  text, text, text, text, text, text, text, text, text, text, text,
  jsonb, jsonb, jsonb, jsonb, text, jsonb, jsonb, text, text, text,
  timestamptz, timestamptz, timestamptz
);

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
  target_list_mode text default null
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
  normalized_list_mode text := nullif(target_list_mode, '');
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

  if normalized_list_mode is not null
    and (normalized_list_mode <> 'focus' or target_type <> 'list') then
    raise exception 'Invalid list mode.';
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

  if normalized_folder_id is null then
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
    updated_at = excluded.updated_at
  where public.can_edit_item(public.trove_items.id);

  if not found then
    raise exception 'You do not have permission to sync this item.';
  end if;
end;
$$;

grant execute on function public.trove_upsert_item_for_current_user(
  text, text, text, text, text, text, text, text, text, text, text,
  jsonb, jsonb, jsonb, jsonb, text, jsonb, jsonb, text, text, text,
  timestamptz, timestamptz, timestamptz, text
) to anon, authenticated, service_role;

-- Entries upsert: same signature, now also saves ref_entry_id.
create or replace function public.trove_upsert_list_entries_for_current_user(
  target_entries jsonb,
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
  entry jsonb;
  entry_id text;
  entry_list_id text;
  list_owner_id uuid;
  existing public.trove_list_entries%rowtype;
  next_kind text;
  next_text text;
  next_checked boolean;
  next_indent_level integer;
  next_position text;
  next_notes text;
  next_due_date date;
  next_completed_at timestamptz;
  next_tags jsonb;
  next_ref_entry_id text;
  ref_list_id text;
  ref_is_reference boolean;
  ref_list_mode text;
  list_mode_value text;
  existing_found boolean;
begin
  if current_user_id is null then
    raise exception 'Sign in to sync lists.';
  end if;

  if jsonb_typeof(coalesce(target_entries, '[]'::jsonb)) <> 'array' then
    raise exception 'List entries must be an array.';
  end if;

  for entry in
    select value from jsonb_array_elements(coalesce(target_entries, '[]'::jsonb))
  loop
    entry_id := nullif(entry ->> 'id', '');
    entry_list_id := nullif(entry ->> 'list_id', '');

    if entry_id is null then
      raise exception 'List entry id is required.';
    end if;

    if entry_list_id is null then
      raise exception 'List entry list id is required.';
    end if;

    next_kind := coalesce(nullif(entry ->> 'kind', ''), 'check');
    if next_kind not in ('check', 'bullet') then
      raise exception 'Invalid list entry kind.';
    end if;

    next_text := coalesce(entry ->> 'text', '');
    next_checked := next_kind = 'check' and coalesce((entry ->> 'checked')::boolean, false);
    next_indent_level := least(greatest(coalesce((entry ->> 'indent_level')::integer, 0), 0), 10);
    next_position := nullif(entry ->> 'position', '');
    next_notes := nullif(entry ->> 'notes', '');
    next_due_date := nullif(entry ->> 'due_date', '')::date;
    next_completed_at := nullif(entry ->> 'completed_at', '')::timestamptz;
    next_tags := coalesce(entry -> 'tags', '[]'::jsonb);
    next_ref_entry_id := nullif(entry ->> 'ref_entry_id', '');

    if next_position is null then
      raise exception 'List entry position is required.';
    end if;

    if jsonb_typeof(next_tags) <> 'array' then
      raise exception 'List entry tags must be an array.';
    end if;

    select item.owner_id, item.list_mode
      into list_owner_id, list_mode_value
    from public.trove_items item
    where item.id = entry_list_id;

    if list_owner_id is null then
      raise exception 'List must be synced before its entries.';
    end if;

    if not public.can_edit_item(entry_list_id) then
      raise exception 'You do not have permission to sync this list.';
    end if;

    select *
      into existing
    from public.trove_list_entries list_entry
    where list_entry.id = entry_id
    for update;

    existing_found := found;

    -- A reference puts a line from another list into a focus list. It is
    -- checked when it is first saved or changes, so losing access to the
    -- source list later never blocks syncing the rest of the focus list.
    if next_ref_entry_id is not null
      and (not existing_found or existing.ref_entry_id is distinct from next_ref_entry_id) then
      select source.list_id, source.ref_entry_id is not null, source_list.list_mode
        into ref_list_id, ref_is_reference, ref_list_mode
      from public.trove_list_entries source
      join public.trove_items source_list on source_list.id = source.list_id
      where source.id = next_ref_entry_id;

      if ref_list_id is null then
        -- The line was deleted elsewhere; its reference goes with it.
        continue;
      end if;

      if list_mode_value is distinct from 'focus' then
        raise exception 'Only focus lists can include lines from other lists.';
      end if;

      if ref_is_reference or ref_list_mode = 'focus' or ref_list_id = entry_list_id then
        raise exception 'Invalid list entry reference.';
      end if;

      if not public.can_access_item(ref_list_id) then
        raise exception 'You do not have access to that list.';
      end if;
    end if;

    if existing_found then
      if not public.can_edit_item(existing.list_id) then
        raise exception 'You do not have permission to sync this list entry.';
      end if;

      if not skip_conflict_check
        and known_updated_at ? entry_id
        and existing.updated_at > ((known_updated_at ->> entry_id)::timestamptz) then
        raise exception 'Sync conflict: list entry changed remotely.';
      end if;

      if existing.list_id = entry_list_id
        and existing.owner_id = list_owner_id
        and existing.kind = next_kind
        and existing.text = next_text
        and existing.checked = next_checked
        and existing.indent_level = next_indent_level
        and existing.position = next_position
        and existing.notes is not distinct from next_notes
        and existing.due_date is not distinct from next_due_date
        and existing.completed_at is not distinct from next_completed_at
        and existing.tags = next_tags
        and existing.ref_entry_id is not distinct from next_ref_entry_id then
        continue;
      end if;

      update public.trove_list_entries
      set
        list_id = entry_list_id,
        owner_id = list_owner_id,
        kind = next_kind,
        text = next_text,
        checked = next_checked,
        indent_level = next_indent_level,
        position = next_position,
        notes = next_notes,
        due_date = next_due_date,
        completed_at = next_completed_at,
        tags = next_tags,
        ref_entry_id = next_ref_entry_id
      where id = entry_id;
    else
      insert into public.trove_list_entries (
        id,
        list_id,
        owner_id,
        created_by,
        kind,
        text,
        checked,
        indent_level,
        position,
        notes,
        due_date,
        completed_at,
        tags,
        ref_entry_id,
        created_at,
        updated_at
      )
      values (
        entry_id,
        entry_list_id,
        list_owner_id,
        current_user_id,
        next_kind,
        next_text,
        next_checked,
        next_indent_level,
        next_position,
        next_notes,
        next_due_date,
        next_completed_at,
        next_tags,
        next_ref_entry_id,
        coalesce(nullif(entry ->> 'created_at', '')::timestamptz, now()),
        coalesce(nullif(entry ->> 'updated_at', '')::timestamptz, now())
      );
    end if;
  end loop;
end;
$$;

grant execute on function public.trove_upsert_list_entries_for_current_user(
  jsonb, jsonb, boolean
) to authenticated;

notify pgrst, 'reload schema';

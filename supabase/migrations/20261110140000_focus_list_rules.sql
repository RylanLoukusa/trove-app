-- Smart focus lists (lists phase 4).
--
-- A focus list can have a rule that pulls in matching lines from every list
-- on its own: due today (or overdue), due this week, due this weekend, or
-- high priority. Matching is done by the app; the rule is stored here so it
-- follows the list across devices and to people it's shared with.

alter table public.trove_items add column if not exists focus_rule text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'trove_items_focus_rule_check'
  ) then
    alter table public.trove_items
      add constraint trove_items_focus_rule_check
      check (
        focus_rule is null
        or (list_mode = 'focus' and focus_rule in ('due_today', 'due_week', 'due_weekend', 'high_priority'))
      );
  end if;
end $$;

-- The item upsert gains target_focus_rule. As before, the old signature is
-- dropped so PostgREST has one function to call. null (older apps) leaves an
-- existing rule alone; 'none' clears it.
drop function if exists public.trove_upsert_item_for_current_user(
  text, text, text, text, text, text, text, text, text, text, text,
  jsonb, jsonb, jsonb, jsonb, text, jsonb, jsonb, text, text, text,
  timestamptz, timestamptz, timestamptz, text
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
  normalized_folder_id text := nullif(target_folder_id, '');
  normalized_list_mode text := nullif(target_list_mode, '');
  normalized_focus_rule text := nullif(target_focus_rule, '');
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

grant execute on function public.trove_upsert_item_for_current_user(
  text, text, text, text, text, text, text, text, text, text, text,
  jsonb, jsonb, jsonb, jsonb, text, jsonb, jsonb, text, text, text,
  timestamptz, timestamptz, timestamptz, text, text
) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

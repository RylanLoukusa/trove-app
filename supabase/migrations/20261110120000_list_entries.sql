-- List entries as first-class rows.
--
-- Until now a list's lines lived in trove_items.list_items (a jsonb array), so
-- a line had no identity of its own: it could not be sorted by its own fields,
-- referenced from another list, or synced without rewriting the whole list.
-- This moves each line into trove_list_entries.
--
-- trove_items.list_items is kept and still written by the app as a snapshot of
-- the list, so older app versions and the public-link edge function keep
-- showing lists. Newer clients read entries and ignore it once entries exist.

create table if not exists public.trove_list_entries (
  id text primary key,
  list_id text not null references public.trove_items (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  kind text not null default 'check',
  text text not null default '',
  checked boolean not null default false,
  indent_level integer not null default 0,
  -- Fractional index key, compared as plain bytes by the client.
  position text not null,
  notes text,
  due_date date,
  completed_at timestamptz,
  -- Tag-option ids, same shape as trove_items.tags.
  tags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trove_list_entries_kind_check
    check (kind in ('check', 'bullet')),
  constraint trove_list_entries_indent_level_check
    check (indent_level between 0 and 10),
  constraint trove_list_entries_position_check
    check (position <> ''),
  constraint trove_list_entries_tags_array_check
    check (jsonb_typeof(tags) = 'array')
);

create index if not exists trove_list_entries_list_id_idx
  on public.trove_list_entries (list_id);

create index if not exists trove_list_entries_owner_id_idx
  on public.trove_list_entries (owner_id);

create index if not exists trove_list_entries_updated_at_idx
  on public.trove_list_entries (updated_at desc);

drop trigger if exists trove_list_entries_set_updated_at on public.trove_list_entries;
create trigger trove_list_entries_set_updated_at
  before update on public.trove_list_entries
  for each row execute function public.set_updated_at();

alter table public.trove_list_entries enable row level security;

drop policy if exists "trove_list_entries_select_accessible" on public.trove_list_entries;
drop policy if exists "trove_list_entries_insert_editable_list" on public.trove_list_entries;
drop policy if exists "trove_list_entries_update_editable_list" on public.trove_list_entries;
drop policy if exists "trove_list_entries_delete_editable_list" on public.trove_list_entries;

-- Entries follow their list's access, which follows the list's folder shares.
create policy "trove_list_entries_select_accessible"
  on public.trove_list_entries for select
  using (public.can_access_item(list_id));

create policy "trove_list_entries_insert_editable_list"
  on public.trove_list_entries for insert
  with check (public.can_edit_item(list_id));

create policy "trove_list_entries_update_editable_list"
  on public.trove_list_entries for update
  using (public.can_edit_item(list_id))
  with check (public.can_edit_item(list_id));

create policy "trove_list_entries_delete_editable_list"
  on public.trove_list_entries for delete
  using (public.can_edit_item(list_id));

-- Backfill from trove_items.list_items. Ids and positions use the same formula
-- as the client's local migration (src/utils/listEntries.ts: legacyEntryId,
-- legacyEntryPosition), so a device that migrates its local copy produces
-- exactly these rows. Timestamps come from the item so the backfill does not
-- look like a remote change to devices that are already up to date.
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
  tags,
  created_at,
  updated_at
)
select
  item.id || '~' || coalesce(nullif(line.value ->> 'id', ''), line.ordinality::text),
  item.id,
  item.owner_id,
  item.created_by,
  case when line.value ->> 'kind' = 'bullet' then 'bullet' else 'check' end,
  coalesce(line.value ->> 'text', ''),
  coalesce(line.value ->> 'kind', 'check') <> 'bullet' and coalesce((line.value -> 'checked') = 'true'::jsonb, false),
  case
    when jsonb_typeof(line.value -> 'indentLevel') = 'number'
      then least(greatest(round((line.value ->> 'indentLevel')::numeric)::integer, 0), 10)
    else 0
  end,
  'V' || lpad(line.ordinality::text, 6, '0') || 'V',
  '[]'::jsonb,
  item.created_at,
  item.updated_at
from public.trove_items item
cross join lateral jsonb_array_elements(item.list_items) with ordinality as line(value, ordinality)
where jsonb_typeof(item.list_items) = 'array'
  and not exists (
    select 1 from public.trove_list_entries existing where existing.list_id = item.id
  )
on conflict (id) do nothing;

-- Upserts a batch of entries in one call. Entries whose content already
-- matches are skipped so their updated_at stays put, which keeps per-entry
-- conflict detection meaningful. `known_updated_at` maps entry id to the
-- updated_at this device last saw; a newer remote row is a sync conflict.
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

    if next_position is null then
      raise exception 'List entry position is required.';
    end if;

    if jsonb_typeof(next_tags) <> 'array' then
      raise exception 'List entry tags must be an array.';
    end if;

    select item.owner_id
      into list_owner_id
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

    if found then
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
        and existing.tags = next_tags then
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
        tags = next_tags
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
        coalesce(nullif(entry ->> 'created_at', '')::timestamptz, now()),
        coalesce(nullif(entry ->> 'updated_at', '')::timestamptz, now())
      );
    end if;
  end loop;
end;
$$;

-- Deletes entries this device removed. Only lists in `local_list_ids` are
-- touched, and (unless skip_conflict_check) only entries this device has seen,
-- so entries someone else added since the last pull are left alone.
create or replace function public.trove_delete_missing_list_entries_for_current_user(
  local_list_ids text[],
  local_entry_ids text[],
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
    raise exception 'Sign in to sync lists.';
  end if;

  if not skip_conflict_check and exists (
    select 1
    from public.trove_list_entries list_entry
    where list_entry.list_id = any(coalesce(local_list_ids, array[]::text[]))
      and not (list_entry.id = any(coalesce(local_entry_ids, array[]::text[])))
      and known_updated_at ? list_entry.id
      and list_entry.updated_at > ((known_updated_at ->> list_entry.id)::timestamptz)
      and public.can_edit_item(list_entry.list_id)
  ) then
    raise exception 'Sync conflict: list entry changed remotely.';
  end if;

  delete from public.trove_list_entries list_entry
  where list_entry.list_id = any(coalesce(local_list_ids, array[]::text[]))
    and not (list_entry.id = any(coalesce(local_entry_ids, array[]::text[])))
    and (skip_conflict_check or known_updated_at ? list_entry.id)
    and public.can_edit_item(list_entry.list_id);
end;
$$;

revoke all on function public.trove_upsert_list_entries_for_current_user(
  jsonb, jsonb, boolean
) from public;
grant execute on function public.trove_upsert_list_entries_for_current_user(
  jsonb, jsonb, boolean
) to authenticated;

revoke all on function public.trove_delete_missing_list_entries_for_current_user(
  text[], text[], jsonb, boolean
) from public;
grant execute on function public.trove_delete_missing_list_entries_for_current_user(
  text[], text[], jsonb, boolean
) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'trove_list_entries'
    ) then
      alter publication supabase_realtime add table public.trove_list_entries;
    end if;
  end if;
end $$;

notify pgrst, 'reload schema';

-- Conflict-safe sync RPCs for trove_tag_groups/trove_tag_options, mirroring the
-- folder RPC pattern in 20260627120000_conflict_safe_sync_rpcs.sql.
--
-- trove_item_tag_assignments (added in 20260803120000) is dropped: the chosen
-- client design denormalizes each item's assigned option ids directly onto the
-- item (tagOptionIds, riding the existing trove_items.tags column) the same way
-- item.folder_id is already a plain FK rather than a join table, so the
-- relational assignments table is unused.

drop table if exists public.trove_item_tag_assignments;

create or replace function public.trove_upsert_tag_group_for_current_user(
  target_group_id text,
  target_name text,
  target_selection_mode text default 'multi',
  target_allow_inline_create boolean default true,
  target_is_system boolean default false,
  target_sort_order integer default 0,
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
begin
  if current_user_id is null then
    raise exception 'Sign in to sync tag groups.';
  end if;

  if nullif(target_group_id, '') is null then
    raise exception 'Tag group id is required.';
  end if;

  if nullif(target_name, '') is null then
    raise exception 'Tag group name is required.';
  end if;

  if target_selection_mode not in ('single', 'multi') then
    raise exception 'Tag group selection mode must be single or multi.';
  end if;

  select tag_group.owner_id, tag_group.updated_at
    into existing_owner_id, existing_updated_at
  from public.trove_tag_groups tag_group
  where tag_group.id = target_group_id
  for update;

  if existing_owner_id is not null and existing_owner_id <> current_user_id then
    raise exception 'Only the tag group owner can sync this tag group.';
  end if;

  if existing_updated_at is not null
    and target_expected_updated_at is not null
    and existing_updated_at > target_expected_updated_at then
    raise exception 'Sync conflict: tag group changed remotely.';
  end if;

  insert into public.trove_tag_groups (
    id,
    owner_id,
    name,
    selection_mode,
    allow_inline_create,
    is_system,
    sort_order,
    created_at,
    updated_at
  )
  values (
    target_group_id,
    current_user_id,
    target_name,
    target_selection_mode,
    target_allow_inline_create,
    target_is_system,
    target_sort_order,
    coalesce(target_created_at, now()),
    coalesce(target_updated_at, now())
  )
  on conflict (id) do update
  set
    name = excluded.name,
    selection_mode = excluded.selection_mode,
    allow_inline_create = excluded.allow_inline_create,
    is_system = excluded.is_system,
    sort_order = excluded.sort_order,
    updated_at = excluded.updated_at
  where public.trove_tag_groups.owner_id = current_user_id;

  if not found then
    raise exception 'Only the tag group owner can sync this tag group.';
  end if;
end;
$$;

create or replace function public.trove_delete_missing_tag_groups_for_current_user(
  local_group_ids text[],
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
    raise exception 'Sign in to sync tag groups.';
  end if;

  if not skip_conflict_check and exists (
    select 1
    from public.trove_tag_groups tag_group
    where tag_group.owner_id = current_user_id
      and not (tag_group.id = any(coalesce(local_group_ids, array[]::text[])))
      and (
        not (known_updated_at ? tag_group.id)
        or tag_group.updated_at > ((known_updated_at ->> tag_group.id)::timestamptz)
      )
  ) then
    raise exception 'Sync conflict: tag group changed remotely.';
  end if;

  delete from public.trove_tag_groups tag_group
  where tag_group.owner_id = current_user_id
    and not (tag_group.id = any(coalesce(local_group_ids, array[]::text[])));
end;
$$;

create or replace function public.trove_delete_tag_group_for_current_user(
  target_group_id text,
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
  existing_owner_id uuid;
  existing_updated_at timestamptz;
begin
  if current_user_id is null then
    raise exception 'Sign in to delete tag groups.';
  end if;

  if nullif(target_group_id, '') is null then
    raise exception 'Tag group id is required.';
  end if;

  select tag_group.owner_id, tag_group.updated_at
    into existing_owner_id, existing_updated_at
  from public.trove_tag_groups tag_group
  where tag_group.id = target_group_id
  for update;

  if existing_owner_id is null then
    return;
  end if;

  if existing_owner_id <> current_user_id then
    raise exception 'Only the tag group owner can delete this tag group.';
  end if;

  if not skip_conflict_check
    and target_expected_updated_at is not null
    and existing_updated_at > target_expected_updated_at then
    raise exception 'Sync conflict: tag group changed remotely.';
  end if;

  delete from public.trove_tag_groups tag_group
  where tag_group.id = target_group_id
    and tag_group.owner_id = current_user_id;
end;
$$;

create or replace function public.trove_upsert_tag_option_for_current_user(
  target_option_id text,
  target_group_id text,
  target_name text,
  target_color text default null,
  target_sort_order integer default 0,
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
  existing_group_id text;
  existing_updated_at timestamptz;
begin
  if current_user_id is null then
    raise exception 'Sign in to sync tag options.';
  end if;

  if nullif(target_option_id, '') is null then
    raise exception 'Tag option id is required.';
  end if;

  if nullif(target_name, '') is null then
    raise exception 'Tag option name is required.';
  end if;

  if not exists (
    select 1
    from public.trove_tag_groups tag_group
    where tag_group.id = target_group_id
      and tag_group.owner_id = current_user_id
  ) then
    raise exception 'Tag group must be synced before this tag option.';
  end if;

  select tag_option.group_id, tag_option.updated_at
    into existing_group_id, existing_updated_at
  from public.trove_tag_options tag_option
  join public.trove_tag_groups tag_group on tag_group.id = tag_option.group_id
  where tag_option.id = target_option_id
  for update;

  if existing_group_id is not null and not exists (
    select 1
    from public.trove_tag_groups tag_group
    where tag_group.id = existing_group_id
      and tag_group.owner_id = current_user_id
  ) then
    raise exception 'Only the tag group owner can sync this tag option.';
  end if;

  if existing_updated_at is not null
    and target_expected_updated_at is not null
    and existing_updated_at > target_expected_updated_at then
    raise exception 'Sync conflict: tag option changed remotely.';
  end if;

  insert into public.trove_tag_options (
    id,
    group_id,
    name,
    color,
    sort_order,
    created_at,
    updated_at
  )
  values (
    target_option_id,
    target_group_id,
    target_name,
    target_color,
    target_sort_order,
    coalesce(target_created_at, now()),
    coalesce(target_updated_at, now())
  )
  on conflict (id) do update
  set
    group_id = excluded.group_id,
    name = excluded.name,
    color = excluded.color,
    sort_order = excluded.sort_order,
    updated_at = excluded.updated_at
  where exists (
    select 1
    from public.trove_tag_groups tag_group
    where tag_group.id = excluded.group_id
      and tag_group.owner_id = current_user_id
  );

  if not found then
    raise exception 'Only the tag group owner can sync this tag option.';
  end if;
end;
$$;

create or replace function public.trove_delete_missing_tag_options_for_current_user(
  local_option_ids text[],
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
    raise exception 'Sign in to sync tag options.';
  end if;

  if not skip_conflict_check and exists (
    select 1
    from public.trove_tag_options tag_option
    join public.trove_tag_groups tag_group on tag_group.id = tag_option.group_id
    where tag_group.owner_id = current_user_id
      and not (tag_option.id = any(coalesce(local_option_ids, array[]::text[])))
      and (
        not (known_updated_at ? tag_option.id)
        or tag_option.updated_at > ((known_updated_at ->> tag_option.id)::timestamptz)
      )
  ) then
    raise exception 'Sync conflict: tag option changed remotely.';
  end if;

  delete from public.trove_tag_options tag_option
  using public.trove_tag_groups tag_group
  where tag_group.id = tag_option.group_id
    and tag_group.owner_id = current_user_id
    and not (tag_option.id = any(coalesce(local_option_ids, array[]::text[])));
end;
$$;

create or replace function public.trove_delete_tag_option_for_current_user(
  target_option_id text,
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
  existing_group_id text;
  existing_updated_at timestamptz;
begin
  if current_user_id is null then
    raise exception 'Sign in to delete tag options.';
  end if;

  if nullif(target_option_id, '') is null then
    raise exception 'Tag option id is required.';
  end if;

  select tag_option.group_id, tag_option.updated_at
    into existing_group_id, existing_updated_at
  from public.trove_tag_options tag_option
  where tag_option.id = target_option_id
  for update;

  if existing_group_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.trove_tag_groups tag_group
    where tag_group.id = existing_group_id
      and tag_group.owner_id = current_user_id
  ) then
    raise exception 'Only the tag group owner can delete this tag option.';
  end if;

  if not skip_conflict_check
    and target_expected_updated_at is not null
    and existing_updated_at > target_expected_updated_at then
    raise exception 'Sync conflict: tag option changed remotely.';
  end if;

  delete from public.trove_tag_options tag_option
  where tag_option.id = target_option_id;
end;
$$;

revoke all on function public.trove_upsert_tag_group_for_current_user(
  text, text, text, boolean, boolean, integer, timestamptz, timestamptz, timestamptz
) from public;
grant execute on function public.trove_upsert_tag_group_for_current_user(
  text, text, text, boolean, boolean, integer, timestamptz, timestamptz, timestamptz
) to authenticated;

revoke all on function public.trove_delete_missing_tag_groups_for_current_user(
  text[], jsonb, boolean
) from public;
grant execute on function public.trove_delete_missing_tag_groups_for_current_user(
  text[], jsonb, boolean
) to authenticated;

revoke all on function public.trove_delete_tag_group_for_current_user(
  text, timestamptz, boolean
) from public;
grant execute on function public.trove_delete_tag_group_for_current_user(
  text, timestamptz, boolean
) to authenticated;

revoke all on function public.trove_upsert_tag_option_for_current_user(
  text, text, text, text, integer, timestamptz, timestamptz, timestamptz
) from public;
grant execute on function public.trove_upsert_tag_option_for_current_user(
  text, text, text, text, integer, timestamptz, timestamptz, timestamptz
) to authenticated;

revoke all on function public.trove_delete_missing_tag_options_for_current_user(
  text[], jsonb, boolean
) from public;
grant execute on function public.trove_delete_missing_tag_options_for_current_user(
  text[], jsonb, boolean
) to authenticated;

revoke all on function public.trove_delete_tag_option_for_current_user(
  text, timestamptz, boolean
) from public;
grant execute on function public.trove_delete_tag_option_for_current_user(
  text, timestamptz, boolean
) to authenticated;

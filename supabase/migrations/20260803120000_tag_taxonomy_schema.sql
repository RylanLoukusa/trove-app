-- User-editable tag taxonomy: groups (e.g. "Status") containing options (e.g. "Waiting"),
-- assignable per item. Purely additive — does not touch trove_items.status/priority/tags.
-- Seeding default groups and backfilling existing items happens client-side in a later phase.

create table if not exists public.trove_tag_groups (
  id text primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  selection_mode text not null default 'multi',
  allow_inline_create boolean not null default true,
  is_system boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trove_tag_groups_selection_mode_check
    check (selection_mode in ('single', 'multi'))
);

create table if not exists public.trove_tag_options (
  id text primary key,
  group_id text not null references public.trove_tag_groups (id) on delete cascade,
  name text not null,
  color text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trove_item_tag_assignments (
  item_id text not null references public.trove_items (id) on delete cascade,
  tag_option_id text not null references public.trove_tag_options (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (item_id, tag_option_id)
);

create index if not exists trove_tag_groups_owner_id_idx
  on public.trove_tag_groups (owner_id);

create index if not exists trove_tag_options_group_id_idx
  on public.trove_tag_options (group_id);

create index if not exists trove_item_tag_assignments_tag_option_id_idx
  on public.trove_item_tag_assignments (tag_option_id);

drop trigger if exists trove_tag_groups_set_updated_at on public.trove_tag_groups;
create trigger trove_tag_groups_set_updated_at
  before update on public.trove_tag_groups
  for each row execute function public.set_updated_at();

drop trigger if exists trove_tag_options_set_updated_at on public.trove_tag_options;
create trigger trove_tag_options_set_updated_at
  before update on public.trove_tag_options
  for each row execute function public.set_updated_at();

alter table public.trove_tag_groups enable row level security;
alter table public.trove_tag_options enable row level security;
alter table public.trove_item_tag_assignments enable row level security;

drop policy if exists "trove_tag_groups_select_accessible" on public.trove_tag_groups;
drop policy if exists "trove_tag_groups_insert_own" on public.trove_tag_groups;
drop policy if exists "trove_tag_groups_update_own" on public.trove_tag_groups;
drop policy if exists "trove_tag_groups_delete_own" on public.trove_tag_groups;

-- A group's vocabulary isn't folder-scoped, so any collaborator the owner has shared
-- at least one folder with can read it (needed to render assigned tag names on shared items).
create policy "trove_tag_groups_select_accessible"
  on public.trove_tag_groups for select
  using (
    auth.uid() = owner_id
    or exists (
      select 1
      from public.trove_folder_shares share
      where share.owner_id = trove_tag_groups.owner_id
        and share.shared_with_user_id = auth.uid()
    )
  );

create policy "trove_tag_groups_insert_own"
  on public.trove_tag_groups for insert
  with check (auth.uid() = owner_id);

create policy "trove_tag_groups_update_own"
  on public.trove_tag_groups for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "trove_tag_groups_delete_own"
  on public.trove_tag_groups for delete
  using (auth.uid() = owner_id);

drop policy if exists "trove_tag_options_select_accessible" on public.trove_tag_options;
drop policy if exists "trove_tag_options_insert_own" on public.trove_tag_options;
drop policy if exists "trove_tag_options_update_own" on public.trove_tag_options;
drop policy if exists "trove_tag_options_delete_own" on public.trove_tag_options;

create policy "trove_tag_options_select_accessible"
  on public.trove_tag_options for select
  using (
    exists (
      select 1
      from public.trove_tag_groups tag_group
      where tag_group.id = trove_tag_options.group_id
        and (
          tag_group.owner_id = auth.uid()
          or exists (
            select 1
            from public.trove_folder_shares share
            where share.owner_id = tag_group.owner_id
              and share.shared_with_user_id = auth.uid()
          )
        )
    )
  );

create policy "trove_tag_options_insert_own"
  on public.trove_tag_options for insert
  with check (
    exists (
      select 1
      from public.trove_tag_groups tag_group
      where tag_group.id = trove_tag_options.group_id
        and tag_group.owner_id = auth.uid()
    )
  );

create policy "trove_tag_options_update_own"
  on public.trove_tag_options for update
  using (
    exists (
      select 1
      from public.trove_tag_groups tag_group
      where tag_group.id = trove_tag_options.group_id
        and tag_group.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.trove_tag_groups tag_group
      where tag_group.id = trove_tag_options.group_id
        and tag_group.owner_id = auth.uid()
    )
  );

create policy "trove_tag_options_delete_own"
  on public.trove_tag_options for delete
  using (
    exists (
      select 1
      from public.trove_tag_groups tag_group
      where tag_group.id = trove_tag_options.group_id
        and tag_group.owner_id = auth.uid()
    )
  );

drop policy if exists "trove_item_tag_assignments_select_accessible" on public.trove_item_tag_assignments;
drop policy if exists "trove_item_tag_assignments_insert_editable_item" on public.trove_item_tag_assignments;
drop policy if exists "trove_item_tag_assignments_delete_editable_item" on public.trove_item_tag_assignments;

create policy "trove_item_tag_assignments_select_accessible"
  on public.trove_item_tag_assignments for select
  using (public.can_access_item(item_id));

create policy "trove_item_tag_assignments_insert_editable_item"
  on public.trove_item_tag_assignments for insert
  with check (public.can_edit_item(item_id));

create policy "trove_item_tag_assignments_delete_editable_item"
  on public.trove_item_tag_assignments for delete
  using (public.can_edit_item(item_id));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'trove_tag_groups'
    ) then
      alter publication supabase_realtime add table public.trove_tag_groups;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'trove_tag_options'
    ) then
      alter publication supabase_realtime add table public.trove_tag_options;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'trove_item_tag_assignments'
    ) then
      alter publication supabase_realtime add table public.trove_item_tag_assignments;
    end if;
  end if;
end $$;

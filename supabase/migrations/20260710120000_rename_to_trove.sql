-- Finishes the app's rename from its original "TheWaitingList" prototype name to "Trove"
-- at the database level: tables, RPC functions, and storage policies all still carried
-- the old waiting_list_* naming. Done pre-launch, before any production data exists.
--
-- Functions are renamed by oid (via regprocedure) rather than a hand-written argument
-- list so the correct live overload is targeted regardless of its exact signature.

do $$
declare
  old_table_names text[] := array[
    'waiting_list_data',
    'waiting_list_sync_state',
    'waiting_list_folders',
    'waiting_list_items',
    'waiting_list_folder_shares',
    'waiting_list_folder_share_invites',
    'waiting_list_collaborators',
    'waiting_list_comments',
    'waiting_list_comment_reactions'
  ];
  old_function_names text[] := array[
    'accept_waiting_list_folder_invite',
    'delete_missing_waiting_list_folders_for_current_user',
    'delete_missing_waiting_list_items_for_current_user',
    'delete_waiting_list_item_for_current_user',
    'list_waiting_list_folder_access',
    'list_waiting_list_saved_collaborators',
    'prevent_waiting_list_comment_retarget',
    'remember_waiting_list_collaborator',
    'remember_waiting_list_collaborator_pair',
    'share_waiting_list_folder',
    'share_waiting_list_folder_with_user',
    'upsert_waiting_list_folder_for_current_user',
    'upsert_waiting_list_item_for_current_user',
    'waiting_list_comment_parent_matches_target'
  ];
  new_name text;
  r record;
  found_count int;
begin
  -- Tables
  found_count := 0;
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname = any(old_table_names)
  loop
    new_name := 'trove_' || replace(r.relname, 'waiting_list_', '');
    execute format('alter table public.%I rename to %I', r.relname, new_name);
    found_count := found_count + 1;
  end loop;
  if found_count <> array_length(old_table_names, 1) then
    raise exception 'Expected to rename % tables, found %', array_length(old_table_names, 1), found_count;
  end if;

  -- Functions
  found_count := 0;
  for r in
    select p.oid, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(old_function_names)
  loop
    new_name := 'trove_' || replace(r.proname, 'waiting_list_', '');
    execute format('alter function %s rename to %I', r.oid::regprocedure, new_name);
    found_count := found_count + 1;
  end loop;
  if found_count <> array_length(old_function_names, 1) then
    raise exception 'Expected to rename % functions, found %', array_length(old_function_names, 1), found_count;
  end if;

  -- Table rename doesn't rename dependent constraints/indexes/triggers, so sweep up
  -- anything left over under the old naming (pkeys, unique keys, plain indexes, triggers).
  for r in
    select conname, conrelid::regclass::text as tbl
    from pg_constraint
    where connamespace = 'public'::regnamespace
      and conname ilike '%waiting_list%'
  loop
    new_name := 'trove_' || replace(r.conname, 'waiting_list_', '');
    execute format('alter table %s rename constraint %I to %I', r.tbl, r.conname, new_name);
  end loop;

  for r in
    select indexname
    from pg_indexes
    where schemaname = 'public'
      and indexname ilike '%waiting_list%'
  loop
    new_name := 'trove_' || replace(r.indexname, 'waiting_list_', '');
    execute format('alter index public.%I rename to %I', r.indexname, new_name);
  end loop;

  for r in
    select tgname, tgrelid::regclass::text as tbl
    from pg_trigger
    where tgrelid in (select oid from pg_class where relnamespace = 'public'::regnamespace)
      and not tgisinternal
      and tgname ilike '%waiting_list%'
  loop
    new_name := 'trove_' || replace(r.tgname, 'waiting_list_', '');
    execute format('alter trigger %I on %s rename to %I', r.tgname, r.tbl, new_name);
  end loop;

  -- RLS policies on the public schema's own tables (postgres owns these, unlike
  -- storage.objects, so a plain rename works here).
  for r in
    select pol.polname, c.relname as tbl
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and pol.polname ilike '%waiting_list%'
  loop
    new_name := 'trove_' || replace(r.polname, 'waiting_list_', '');
    execute format('alter policy %I on public.%I rename to %I', r.polname, r.tbl, new_name);
  end loop;
end $$;

-- Storage policies on storage.objects (cosmetic only; bucket id is already "media").
-- storage.objects is owned by supabase_storage_admin, not postgres, so RENAME isn't
-- available to a migration running as postgres -- drop and recreate under the new
-- names instead, with identical definitions to the originals.
drop policy if exists "waiting_list_media_select_own" on storage.objects;
drop policy if exists "waiting_list_media_insert_own" on storage.objects;
drop policy if exists "waiting_list_media_update_own" on storage.objects;
drop policy if exists "waiting_list_media_delete_own" on storage.objects;

create policy "trove_media_select_own"
  on storage.objects for select
  using (
    bucket_id = 'media'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "trove_media_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'media'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "trove_media_update_own"
  on storage.objects for update
  using (
    bucket_id = 'media'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'media'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "trove_media_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'media'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

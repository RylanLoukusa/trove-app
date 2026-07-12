-- The rename to trove_* (20260710120000_rename_to_trove.sql) renamed table and function
-- *identities* via ALTER TABLE/FUNCTION RENAME, which Postgres propagates automatically
-- into views, RLS policies, and triggers -- but NOT into the literal SQL text inside
-- plpgsql/sql function bodies. Every function (including helper functions like
-- can_access_folder/owns_folder that were never renamed because their own names never
-- contained "waiting_list") still had `public.waiting_list_folders` etc. hardcoded in its
-- body, so any RLS policy or RPC that called through them broke with
-- "relation ... does not exist" once the underlying tables were actually renamed.
--
-- This migration rewrites every function body in the public schema that still contains
-- the old naming, replacing old table/function name references with their trove_
-- equivalents, then re-executes the corrected CREATE OR REPLACE FUNCTION statement
-- (same name/signature/OID, only the body text changes).

do $$
declare
  old_names text[] := array[
    'waiting_list_data',
    'waiting_list_sync_state',
    'waiting_list_folders',
    'waiting_list_items',
    'waiting_list_folder_shares',
    'waiting_list_folder_share_invites',
    'waiting_list_collaborators',
    'waiting_list_comments',
    'waiting_list_comment_reactions',
    'accept_waiting_list_folder_invite',
    'delete_missing_waiting_list_folders_for_current_user',
    'delete_missing_waiting_list_items_for_current_user',
    'delete_waiting_list_item_for_current_user',
    'list_waiting_list_folder_access',
    'list_waiting_list_saved_collaborators',
    'prevent_waiting_list_comment_retarget',
    'remember_waiting_list_collaborator_pair',
    'remember_waiting_list_collaborator',
    'share_waiting_list_folder_with_user',
    'share_waiting_list_folder',
    'upsert_waiting_list_folder_for_current_user',
    'upsert_waiting_list_item_for_current_user',
    'waiting_list_comment_parent_matches_target'
  ];
  new_names text[] := array[
    'trove_data',
    'trove_sync_state',
    'trove_folders',
    'trove_items',
    'trove_folder_shares',
    'trove_folder_share_invites',
    'trove_collaborators',
    'trove_comments',
    'trove_comment_reactions',
    'trove_accept_folder_invite',
    'trove_delete_missing_folders_for_current_user',
    'trove_delete_missing_items_for_current_user',
    'trove_delete_item_for_current_user',
    'trove_list_folder_access',
    'trove_list_saved_collaborators',
    'trove_prevent_comment_retarget',
    'trove_remember_collaborator_pair',
    'trove_remember_collaborator',
    'trove_share_folder_with_user',
    'trove_share_folder',
    'trove_upsert_folder_for_current_user',
    'trove_upsert_item_for_current_user',
    'trove_comment_parent_matches_target'
  ];
  r record;
  definition text;
  fixed_count int := 0;
begin
  for r in
    select p.oid, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and pg_get_functiondef(p.oid) ilike '%waiting_list%'
  loop
    definition := pg_get_functiondef(r.oid);

    for i in 1 .. array_length(old_names, 1) loop
      definition := regexp_replace(definition, '\y' || old_names[i] || '\y', new_names[i], 'g');
    end loop;

    execute definition;
    fixed_count := fixed_count + 1;
  end loop;

  raise notice 'Rewrote % function bodies referencing old waiting_list_* names', fixed_count;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and pg_get_functiondef(p.oid) ilike '%waiting_list%'
  ) then
    raise exception 'Some function bodies still reference waiting_list_* after rewrite';
  end if;
end $$;

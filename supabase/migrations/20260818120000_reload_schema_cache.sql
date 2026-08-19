-- PostgREST's schema cache didn't pick up trove_item_tag_assignments /
-- trove_tag_options from the 20260803* migrations (PGRST205 "table not found
-- in schema cache" when queried via the REST API, even though the tables
-- exist and the migrations show as applied). Force a reload.
notify pgrst, 'reload schema';

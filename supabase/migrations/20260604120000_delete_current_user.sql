-- Deletes the signed-in user's account and Trove cloud data.
-- Run via Supabase CLI (`supabase db push`) or paste into SQL Editor in the dashboard.

create or replace function public.delete_current_user()
returns void
language plpgsql
security definer
set search_path = public, storage, auth
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  delete from storage.objects
  where bucket_id = 'media'
    and (storage.foldername(name))[1] = current_user_id::text;

  delete from public.waiting_list_data
  where user_id = current_user_id;

  delete from auth.users
  where id = current_user_id;
end;
$$;

revoke all on function public.delete_current_user() from public;
grant execute on function public.delete_current_user() to authenticated;

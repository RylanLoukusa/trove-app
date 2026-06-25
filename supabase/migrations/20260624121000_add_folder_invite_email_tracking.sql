alter table public.waiting_list_folder_share_invites
  add column if not exists email_sent_at timestamptz,
  add column if not exists email_last_error text,
  add column if not exists email_delivery_id text;

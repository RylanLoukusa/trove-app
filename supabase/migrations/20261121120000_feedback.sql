-- Feedback sent from Trove's Settings. Anyone signed in can send it; only
-- the project's own dashboard (service role) can read it.
create table if not exists public.trove_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null default auth.uid(),
  message text not null check (char_length(message) between 1 and 5000),
  kind text not null default 'general' check (kind in ('general', 'idea', 'problem')),
  app_version text,
  platform text,
  os_version text,
  created_at timestamptz not null default now()
);

alter table public.trove_feedback enable row level security;

drop policy if exists "Signed-in people can send feedback" on public.trove_feedback;
create policy "Signed-in people can send feedback"
  on public.trove_feedback
  for insert
  to authenticated
  with check (user_id = auth.uid());

revoke all on public.trove_feedback from anon;
grant insert on public.trove_feedback to authenticated;

-- Discussion threads for folders and items.

create extension if not exists pgcrypto;

create table if not exists public.waiting_list_comments (
  id uuid primary key default gen_random_uuid(),
  target_type text not null,
  target_id text not null,
  parent_comment_id uuid references public.waiting_list_comments (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint waiting_list_comments_target_type_check
    check (target_type in ('item', 'folder')),
  constraint waiting_list_comments_body_check
    check (deleted_at is not null or length(trim(body)) > 0)
);

create table if not exists public.waiting_list_comment_reactions (
  comment_id uuid not null references public.waiting_list_comments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  reaction text not null,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id, reaction),
  constraint waiting_list_comment_reactions_reaction_check
    check (reaction in ('like', 'love', 'seen', 'done'))
);

create index if not exists waiting_list_comments_target_idx
  on public.waiting_list_comments (target_type, target_id, created_at);

create index if not exists waiting_list_comments_parent_idx
  on public.waiting_list_comments (parent_comment_id, created_at);

create index if not exists waiting_list_comments_author_idx
  on public.waiting_list_comments (author_id, created_at desc);

create index if not exists waiting_list_comment_reactions_user_idx
  on public.waiting_list_comment_reactions (user_id, created_at desc);

create or replace function public.can_access_comment_target(
  target_type text,
  target_id text
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select case
    when target_type = 'folder' then public.can_access_folder(target_id)
    when target_type = 'item' then public.can_access_item(target_id)
    else false
  end;
$$;

create or replace function public.can_access_comment(
  target_comment_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    exists (
      select 1
      from public.waiting_list_comments comment
      where comment.id = target_comment_id
        and public.can_access_comment_target(comment.target_type, comment.target_id)
    ),
    false
  );
$$;

create or replace function public.waiting_list_comment_parent_matches_target(
  parent_id uuid,
  next_target_type text,
  next_target_id text
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select parent_id is null
    or exists (
      select 1
      from public.waiting_list_comments parent
      where parent.id = parent_id
        and parent.target_type = next_target_type
        and parent.target_id = next_target_id
        and parent.parent_comment_id is null
    );
$$;

create or replace function public.prevent_waiting_list_comment_retarget()
returns trigger
language plpgsql
as $$
begin
  if new.author_id <> old.author_id
    or new.target_type <> old.target_type
    or new.target_id <> old.target_id
    or new.parent_comment_id is distinct from old.parent_comment_id then
    raise exception 'Comment ownership and target cannot be changed.';
  end if;

  return new;
end;
$$;

drop trigger if exists waiting_list_comments_set_updated_at on public.waiting_list_comments;
create trigger waiting_list_comments_set_updated_at
  before update on public.waiting_list_comments
  for each row execute function public.set_updated_at();

drop trigger if exists waiting_list_comments_prevent_retarget on public.waiting_list_comments;
create trigger waiting_list_comments_prevent_retarget
  before update on public.waiting_list_comments
  for each row execute function public.prevent_waiting_list_comment_retarget();

alter table public.waiting_list_comments enable row level security;
alter table public.waiting_list_comment_reactions enable row level security;

drop policy if exists waiting_list_comments_select_accessible on public.waiting_list_comments;
create policy waiting_list_comments_select_accessible
  on public.waiting_list_comments for select
  using (public.can_access_comment_target(target_type, target_id));

drop policy if exists waiting_list_comments_insert_accessible on public.waiting_list_comments;
create policy waiting_list_comments_insert_accessible
  on public.waiting_list_comments for insert
  with check (
    author_id = auth.uid()
    and public.can_access_comment_target(target_type, target_id)
    and public.waiting_list_comment_parent_matches_target(parent_comment_id, target_type, target_id)
  );

drop policy if exists waiting_list_comments_update_own on public.waiting_list_comments;
create policy waiting_list_comments_update_own
  on public.waiting_list_comments for update
  using (
    author_id = auth.uid()
    and public.can_access_comment_target(target_type, target_id)
  )
  with check (
    author_id = auth.uid()
    and public.can_access_comment_target(target_type, target_id)
  );

drop policy if exists waiting_list_comments_delete_own on public.waiting_list_comments;
create policy waiting_list_comments_delete_own
  on public.waiting_list_comments for delete
  using (
    author_id = auth.uid()
    and public.can_access_comment_target(target_type, target_id)
  );

drop policy if exists waiting_list_comment_reactions_select_accessible on public.waiting_list_comment_reactions;
create policy waiting_list_comment_reactions_select_accessible
  on public.waiting_list_comment_reactions for select
  using (public.can_access_comment(comment_id));

drop policy if exists waiting_list_comment_reactions_insert_accessible on public.waiting_list_comment_reactions;
create policy waiting_list_comment_reactions_insert_accessible
  on public.waiting_list_comment_reactions for insert
  with check (
    user_id = auth.uid()
    and public.can_access_comment(comment_id)
  );

drop policy if exists waiting_list_comment_reactions_delete_own on public.waiting_list_comment_reactions;
create policy waiting_list_comment_reactions_delete_own
  on public.waiting_list_comment_reactions for delete
  using (
    user_id = auth.uid()
    and public.can_access_comment(comment_id)
  );

do $$
begin
  alter publication supabase_realtime add table public.waiting_list_comments;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.waiting_list_comment_reactions;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

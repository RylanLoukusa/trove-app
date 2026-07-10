-- Allow user-selected emoji reactions instead of a fixed reaction vocabulary.

alter table public.waiting_list_comment_reactions
  drop constraint if exists waiting_list_comment_reactions_reaction_check;

alter table public.waiting_list_comment_reactions
  add constraint waiting_list_comment_reactions_reaction_check
  check (
    length(trim(reaction)) between 1 and 16
  );

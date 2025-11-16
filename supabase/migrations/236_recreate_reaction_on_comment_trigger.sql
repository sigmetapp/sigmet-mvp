begin;

drop trigger if exists notify_reaction_on_comment_trigger on public.comment_reactions;

create trigger notify_reaction_on_comment_trigger
  after insert on public.comment_reactions
  for each row
  execute function public.notify_reaction_on_comment();

commit;

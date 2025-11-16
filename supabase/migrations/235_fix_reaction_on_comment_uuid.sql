begin;

-- Make notify_reaction_on_comment use uuid comparison directly
create or replace function public.notify_reaction_on_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  comment_author_id uuid;
  comment_post_id bigint;
  comment_id_uuid uuid;
  comment_id_text text;
begin
  if new.comment_id is null then
    return new;
  end if;

  -- comment_reactions.comment_id is uuid in production
  comment_id_uuid := new.comment_id::uuid;
  comment_id_text := comment_id_uuid::text;

  select user_id, post_id
    into comment_author_id, comment_post_id
  from public.comments
  where id = comment_id_uuid
  limit 1;

  if comment_author_id is null or comment_author_id = new.user_id then
    return new;
  end if;

  perform public.create_notification(
    p_user_id := comment_author_id,
    p_type := 'reaction_on_comment',
    p_actor_id := new.user_id,
    p_post_id := comment_post_id,
    p_comment_id := comment_id_text
  );

  return new;
exception
  when others then
    raise notice 'Error in notify_reaction_on_comment: %', SQLERRM;
    return new;
end;
$$;

commit;

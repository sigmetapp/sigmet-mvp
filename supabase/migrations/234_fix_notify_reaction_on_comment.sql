begin;

-- Ensure comment reaction notifications resolve the author even when comments use user_id instead of author_id
create or replace function public.notify_reaction_on_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  comment_author_id uuid;
  comment_post_id bigint;
  comment_id_text text;
  comment_record jsonb;
begin
  comment_id_text := coalesce(to_jsonb(new)->>'comment_id', '');

  if comment_id_text = '' then
    return new;
  end if;

  select to_jsonb(c), c.post_id
    into comment_record, comment_post_id
  from public.comments c
  where c.id::text = comment_id_text
  limit 1;

  if comment_record is null then
    return new;
  end if;

  comment_author_id := coalesce(
    nullif(comment_record->>'author_id', '')::uuid,
    nullif(comment_record->>'user_id', '')::uuid
  );

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

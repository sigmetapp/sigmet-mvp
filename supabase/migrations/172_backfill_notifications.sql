-- Backfill notifications from past events
-- This migration creates notifications for existing comments, reactions, follows, and trust flow entries
begin;

-- Backfill notifications for existing comments on posts
-- Note: comment_id type depends on actual comments.id type in database
-- Also need to check if comments table uses author_id or user_id
do $$
declare
  comments_author_col text;
  comments_id_type text;
begin
  -- Determine which column is used for comment author
  -- Check all columns in comments table to find the author column
  select column_name into comments_author_col
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'comments'
    and column_name in ('author_id', 'user_id')
  order by case when column_name = 'author_id' then 0 else 1 end
  limit 1;

  -- If still not found, try to find any uuid column that references auth.users
  if comments_author_col is null then
    select column_name into comments_author_col
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'comments'
      and data_type = 'uuid'
      and column_name != 'id'
      and column_name != 'parent_id'
    limit 1;
  end if;

  -- Determine comments.id type
  select data_type into comments_id_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'comments'
    and column_name = 'id';

  if comments_author_col is null then
    raise notice 'Could not find author column in comments table. Skipping comment notifications backfill.';
    return;
  end if;

  raise notice 'Using column % for comment author', comments_author_col;

  if comments_id_type = 'uuid' then
    -- comments.id is uuid
    execute format('
      insert into public.notifications (user_id, type, actor_id, post_id, comment_id, created_at)
      select distinct
        p.author_id as user_id,
        ''comment_on_post''::text as type,
        c.%I as actor_id,
        c.post_id,
        c.id as comment_id,
        c.created_at
      from public.comments c
      inner join public.posts p on p.id = c.post_id
      where c.parent_id is null
        and c.%I != p.author_id
        and not exists (
          select 1 from public.notifications n
          where n.user_id = p.author_id
            and n.type = ''comment_on_post''
            and n.comment_id = c.id
        )
      on conflict do nothing
    ', comments_author_col, comments_author_col);
  else
    -- comments.id is bigint, need to cast to text
    execute format('
      insert into public.notifications (user_id, type, actor_id, post_id, comment_id, created_at)
      select distinct
        p.author_id as user_id,
        ''comment_on_post''::text as type,
        c.%I as actor_id,
        c.post_id,
        c.id::text as comment_id,
        c.created_at
      from public.comments c
      inner join public.posts p on p.id = c.post_id
      where c.parent_id is null
        and c.%I != p.author_id
        and not exists (
          select 1 from public.notifications n
          where n.user_id = p.author_id
            and n.type = ''comment_on_post''
            and n.comment_id = c.id::text
        )
      on conflict do nothing
    ', comments_author_col, comments_author_col);
  end if;
end $$;

-- Backfill notifications for existing replies to comments
do $$
declare
  comments_author_col text;
  comments_id_type text;
begin
  -- Determine which column is used for comment author
  -- Check all columns in comments table to find the author column
  select column_name into comments_author_col
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'comments'
    and column_name in ('author_id', 'user_id')
  order by case when column_name = 'author_id' then 0 else 1 end
  limit 1;

  -- If still not found, try to find any uuid column that references auth.users
  if comments_author_col is null then
    select column_name into comments_author_col
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'comments'
      and data_type = 'uuid'
      and column_name != 'id'
      and column_name != 'parent_id'
    limit 1;
  end if;

  -- Determine comments.id type
  select data_type into comments_id_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'comments'
    and column_name = 'id';

  if comments_author_col is null then
    raise notice 'Could not find author column in comments table. Skipping comment reply notifications backfill.';
    return;
  end if;

  if comments_id_type = 'uuid' then
    execute format('
      insert into public.notifications (user_id, type, actor_id, post_id, comment_id, created_at)
      select distinct
        pc.%I as user_id,
        ''comment_on_comment''::text as type,
        c.%I as actor_id,
        c.post_id,
        c.id as comment_id,
        c.created_at
      from public.comments c
      inner join public.comments pc on pc.id = c.parent_id
      where c.parent_id is not null
        and c.%I != pc.%I
        and not exists (
          select 1 from public.notifications n
          where n.user_id = pc.%I
            and n.type = ''comment_on_comment''
            and n.comment_id = c.id
        )
      on conflict do nothing
    ', comments_author_col, comments_author_col, comments_author_col, comments_author_col, comments_author_col);
  else
    execute format('
      insert into public.notifications (user_id, type, actor_id, post_id, comment_id, created_at)
      select distinct
        pc.%I as user_id,
        ''comment_on_comment''::text as type,
        c.%I as actor_id,
        c.post_id,
        c.id::text as comment_id,
        c.created_at
      from public.comments c
      inner join public.comments pc on pc.id = c.parent_id
      where c.parent_id is not null
        and c.%I != pc.%I
        and not exists (
          select 1 from public.notifications n
          where n.user_id = pc.%I
            and n.type = ''comment_on_comment''
            and n.comment_id = c.id::text
        )
      on conflict do nothing
    ', comments_author_col, comments_author_col, comments_author_col, comments_author_col, comments_author_col);
  end if;
end $$;

-- Backfill notifications for existing reactions on posts
insert into public.notifications (user_id, type, actor_id, post_id, created_at)
select distinct
  p.author_id as user_id,
  'reaction_on_post'::text as type,
  pr.user_id as actor_id,
  pr.post_id,
  pr.created_at
from public.post_reactions pr
inner join public.posts p on p.id = pr.post_id
where pr.user_id != p.author_id
  and not exists (
    select 1 from public.notifications n
    where n.user_id = p.author_id
      and n.type = 'reaction_on_post'
      and n.post_id = pr.post_id
      and n.actor_id = pr.user_id
      and abs(extract(epoch from (n.created_at - pr.created_at))) < 60
  )
on conflict do nothing;

-- Backfill notifications for existing follows/subscriptions (if follows table exists)
do $$
begin
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'follows'
  ) then
    insert into public.notifications (user_id, type, actor_id, created_at)
    select distinct
      f.followee_id as user_id,
      'subscription'::text as type,
      f.follower_id as actor_id,
      f.created_at
    from public.follows f
    where f.follower_id != f.followee_id
      and not exists (
        select 1 from public.notifications n
        where n.user_id = f.followee_id
          and n.type = 'subscription'
          and n.actor_id = f.follower_id
          and abs(extract(epoch from (n.created_at - f.created_at))) < 60
      )
    on conflict do nothing;
  end if;
end $$;

-- Backfill notifications for existing Trust Flow entries
insert into public.notifications (user_id, type, actor_id, trust_feedback_id, created_at)
select distinct
  tf.target_user_id as user_id,
  'trust_flow_entry'::text as type,
  tf.author_id as actor_id,
  tf.id as trust_feedback_id,
  tf.created_at
from public.trust_feedback tf
where tf.author_id is not null
  and tf.author_id != tf.target_user_id
  and not exists (
    select 1 from public.notifications n
    where n.user_id = tf.target_user_id
      and n.type = 'trust_flow_entry'
      and n.trust_feedback_id = tf.id
  )
on conflict do nothing;

-- Backfill notifications for mentions in existing posts
-- This is more complex as we need to parse post text for @mentions
do $$
declare
  post_record record;
  mentioned_user_id uuid;
  mentioned_username text;
  word_record text;
  username_match text;
begin
  for post_record in
    select id, author_id, text, created_at
    from public.posts
    where text is not null and text != ''
  loop
    -- Find all @username mentions in the post
    for word_record in
      select unnest(regexp_split_to_array(post_record.text, '\s+'))
    loop
      -- Check if word starts with @
      if word_record ~ '^@[a-zA-Z0-9_]+' then
        -- Extract username (remove @ and any trailing punctuation)
        username_match := substring(word_record from 2);
        username_match := regexp_replace(username_match, '[^a-zA-Z0-9_].*$', '');
        
        -- Find user by username
        select user_id into mentioned_user_id
        from public.profiles
        where lower(username) = lower(username_match)
        limit 1;

        -- Create notification if user found and not mentioning yourself
        if mentioned_user_id is not null 
           and mentioned_user_id != post_record.author_id
           and not exists (
             select 1 from public.notifications n
             where n.user_id = mentioned_user_id
               and n.type = 'mention_in_post'
               and n.post_id = post_record.id
               and n.actor_id = post_record.author_id
           ) then
          insert into public.notifications (
            user_id, type, actor_id, post_id, created_at
          ) values (
            mentioned_user_id,
            'mention_in_post',
            post_record.author_id,
            post_record.id,
            post_record.created_at
          ) on conflict do nothing;
        end if;
      end if;
    end loop;
  end loop;
end $$;

commit;

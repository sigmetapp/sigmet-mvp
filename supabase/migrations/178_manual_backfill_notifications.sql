-- Manual backfill of notifications for existing comments and reactions
-- This migration creates notifications for all existing comments and reactions that don't have notifications yet
begin;

-- Backfill notifications for existing comments on posts (dynamic column detection)
do $$
declare
  comments_author_col text;
  has_author_id boolean;
  has_user_id boolean;
  notifications_comment_id_type text;
  comments_id_type text;
begin
  -- Check which columns exist
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'comments'
      and column_name = 'author_id'
  ) into has_author_id;
  
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'comments'
      and column_name = 'user_id'
  ) into has_user_id;
  
  -- Determine which column to use
  if has_author_id then
    comments_author_col := 'author_id';
  elsif has_user_id then
    comments_author_col := 'user_id';
  else
    -- Try to find any uuid column that references auth.users
    select column_name into comments_author_col
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'comments'
      and data_type = 'uuid'
      and column_name != 'id'
      and column_name != 'parent_id'
    limit 1;
  end if;

  if comments_author_col is null then
    raise notice 'Could not find author column in comments table. Skipping comment notifications backfill.';
  else
    raise notice 'Using column % for comment author', comments_author_col;
    
    -- Check comment_id type in notifications table first
    select data_type into notifications_comment_id_type
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'notifications'
      and column_name = 'comment_id';
    
    -- Check comments.id type
    select data_type into comments_id_type
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'comments'
      and column_name = 'id';
    
    -- Backfill notifications for existing comments on posts
    if notifications_comment_id_type = 'bigint' and comments_id_type = 'bigint' then
        -- Both are bigint, can insert directly
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
          where COALESCE(c.parent_id::text, '''') = ''''
            and c.%I != p.author_id
            and not exists (
              select 1 from public.notifications n
              where n.user_id = p.author_id
                and n.type = ''comment_on_post''
                and n.post_id = c.post_id
                and n.actor_id = c.%I
                and abs(extract(epoch from (n.created_at - c.created_at))) < 60
            )
            and not exists (
              select 1 from public.dms_blocks b
              where b.blocker = p.author_id
                and b.blocked = c.%I
            )
          on conflict do nothing
        ', comments_author_col, comments_author_col, comments_author_col, comments_author_col);
      elsif notifications_comment_id_type = 'bigint' and comments_id_type = 'uuid' then
        -- notifications.comment_id is bigint, but comments.id is uuid, need to convert
        execute format('
          insert into public.notifications (user_id, type, actor_id, post_id, comment_id, created_at)
          select distinct
            p.author_id as user_id,
            ''comment_on_post''::text as type,
            c.%I as actor_id,
            c.post_id,
            null as comment_id,
            c.created_at
          from public.comments c
          inner join public.posts p on p.id = c.post_id
          where COALESCE(c.parent_id::text, '''') = ''''
            and c.%I != p.author_id
            and not exists (
              select 1 from public.notifications n
              where n.user_id = p.author_id
                and n.type = ''comment_on_post''
                and n.post_id = c.post_id
                and n.actor_id = c.%I
                and abs(extract(epoch from (n.created_at - c.created_at))) < 60
            )
            and not exists (
              select 1 from public.dms_blocks b
              where b.blocker = p.author_id
                and b.blocked = c.%I
            )
          on conflict do nothing
        ', comments_author_col, comments_author_col, comments_author_col, comments_author_col);
      else
        -- comment_id is uuid or doesn't exist, insert without comment_id
        raise notice 'comment_id type is % or doesn''t exist, inserting without comment_id', notifications_comment_id_type;
        execute format('
          insert into public.notifications (user_id, type, actor_id, post_id, created_at)
          select distinct
            p.author_id as user_id,
            ''comment_on_post''::text as type,
            c.%I as actor_id,
            c.post_id,
            c.created_at
          from public.comments c
          inner join public.posts p on p.id = c.post_id
          where COALESCE(c.parent_id::text, '''') = ''''
            and c.%I != p.author_id
            and not exists (
              select 1 from public.notifications n
              where n.user_id = p.author_id
                and n.type = ''comment_on_post''
                and n.post_id = c.post_id
                and n.actor_id = c.%I
                and abs(extract(epoch from (n.created_at - c.created_at))) < 60
            )
            and not exists (
              select 1 from public.dms_blocks b
              where b.blocker = p.author_id
                and b.blocked = c.%I
            )
          on conflict do nothing
        ', comments_author_col, comments_author_col, comments_author_col);
    end if;
    
    -- Backfill notifications for existing replies to comments
    -- Use text comparison for parent_id join to handle type mismatch
    if notifications_comment_id_type = 'bigint' and comments_id_type = 'bigint' then
      -- Both are bigint, can insert directly
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
        inner join public.comments pc on pc.id::text = c.parent_id::text
        where c.parent_id is not null
          and COALESCE(c.parent_id::text, '''') != ''''
          and c.%I != pc.%I
          and not exists (
            select 1 from public.notifications n
            where n.user_id = pc.%I
              and n.type = ''comment_on_comment''
              and n.post_id = c.post_id
              and n.actor_id = c.%I
              and abs(extract(epoch from (n.created_at - c.created_at))) < 60
          )
          and not exists (
            select 1 from public.dms_blocks b
            where b.blocker = pc.%I
              and b.blocked = c.%I
          )
        on conflict do nothing
      ', comments_author_col, comments_author_col, comments_author_col, comments_author_col, comments_author_col, comments_author_col, comments_author_col);
    else
      -- comment_id is uuid or doesn't exist, or comments.id is uuid, insert without comment_id
      execute format('
        insert into public.notifications (user_id, type, actor_id, post_id, created_at)
        select distinct
          pc.%I as user_id,
          ''comment_on_comment''::text as type,
          c.%I as actor_id,
          c.post_id,
          c.created_at
        from public.comments c
        inner join public.comments pc on pc.id::text = c.parent_id::text
        where c.parent_id is not null
          and COALESCE(c.parent_id::text, '''') != ''''
          and c.%I != pc.%I
          and not exists (
            select 1 from public.notifications n
            where n.user_id = pc.%I
              and n.type = ''comment_on_comment''
              and n.post_id = c.post_id
              and n.actor_id = c.%I
              and abs(extract(epoch from (n.created_at - c.created_at))) < 60
          )
          and not exists (
            select 1 from public.dms_blocks b
            where b.blocker = pc.%I
              and b.blocked = c.%I
          )
        on conflict do nothing
      ', comments_author_col, comments_author_col, comments_author_col, comments_author_col, comments_author_col, comments_author_col, comments_author_col);
    end if;
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
  and not exists (
    select 1 from public.dms_blocks b
    where b.blocker = p.author_id
      and b.blocked = pr.user_id
  )
on conflict do nothing;

commit;

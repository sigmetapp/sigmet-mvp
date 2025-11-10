-- Backfill notifications for past comments and reactions that don't have notifications yet
-- This migration creates notifications for existing comments and reactions, but skips blocked users
-- NOTE: This migration should run AFTER migration 177 which fixes the comment_id type
begin;

-- Backfill notifications for existing comments on posts (with block check)
do $$
declare
  comments_author_col text;
  comments_id_type text;
  notifications_comment_id_type text;
begin
  -- Determine which column is used for comment author
  select column_name into comments_author_col
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'comments'
    and column_name in ('author_id', 'user_id')
  order by case when column_name = 'author_id' then 0 else 1 end
  limit 1;

  -- If not found, try to find any uuid column that references auth.users
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

  -- Determine notifications.comment_id type
  select data_type into notifications_comment_id_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'notifications'
    and column_name = 'comment_id';

  if comments_author_col is null then
    raise notice 'Could not find author column in comments table. Skipping comment notifications backfill.';
    return;
  end if;

  raise notice 'Using column % for comment author', comments_author_col;
  raise notice 'comments.id type: %, notifications.comment_id type: %', comments_id_type, notifications_comment_id_type;

  -- Check if types match
  if comments_id_type = 'bigint' and notifications_comment_id_type = 'bigint' then
    -- Both are bigint, can insert directly
    if comments_author_col is not null then
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
          and not exists (
            select 1 from public.dms_blocks b
            where b.blocker = p.author_id
              and b.blocked = c.%I
          )
        on conflict do nothing
      ', comments_author_col, comments_author_col, comments_author_col);
    end if;
  elsif comments_id_type = 'uuid' and notifications_comment_id_type = 'uuid' then
    -- Both are uuid, can insert directly
    if comments_author_col is not null then
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
          and not exists (
            select 1 from public.dms_blocks b
            where b.blocker = p.author_id
              and b.blocked = c.%I
          )
        on conflict do nothing
      ', comments_author_col, comments_author_col, comments_author_col);
    end if;
  else
    -- Types don't match, skip comment_id for now (insert null)
    raise notice 'Types mismatch, inserting notifications without comment_id';
    if comments_author_col is not null then
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
        where c.parent_id is null
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
    end if;
  end if;
end $$;

-- Backfill notifications for existing reactions on posts (with block check)
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

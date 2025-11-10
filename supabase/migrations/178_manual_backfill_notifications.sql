-- Manual backfill of notifications for existing comments and reactions
-- This migration creates notifications for all existing comments and reactions that don't have notifications yet
begin;

-- Backfill notifications for existing comments on posts (dynamic column detection)
do $$
declare
  comments_author_col text;
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

  if comments_author_col is null then
    raise notice 'Could not find author column in comments table. Skipping comment notifications backfill.';
  else
    raise notice 'Using column % for comment author', comments_author_col;
    
    -- Backfill notifications for existing comments on posts
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
    
    -- Backfill notifications for existing replies to comments
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
        and not exists (
          select 1 from public.dms_blocks b
          where b.blocker = pc.%I
            and b.blocked = c.%I
        )
      on conflict do nothing
    ', comments_author_col, comments_author_col, comments_author_col, comments_author_col, comments_author_col, comments_author_col);
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

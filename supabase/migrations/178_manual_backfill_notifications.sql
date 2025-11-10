-- Manual backfill of notifications for existing comments and reactions
-- This migration creates notifications for all existing comments and reactions that don't have notifications yet
begin;

-- Backfill notifications for existing comments on posts
insert into public.notifications (user_id, type, actor_id, post_id, comment_id, created_at)
select distinct
  p.author_id as user_id,
  'comment_on_post'::text as type,
  c.author_id as actor_id,
  c.post_id,
  c.id as comment_id,
  c.created_at
from public.comments c
inner join public.posts p on p.id = c.post_id
where c.parent_id is null
  and c.author_id != p.author_id
  and not exists (
    select 1 from public.notifications n
    where n.user_id = p.author_id
      and n.type = 'comment_on_post'
      and n.comment_id = c.id
  )
  and not exists (
    select 1 from public.dms_blocks b
    where b.blocker = p.author_id
      and b.blocked = c.author_id
  )
on conflict do nothing;

-- Backfill notifications for existing replies to comments
insert into public.notifications (user_id, type, actor_id, post_id, comment_id, created_at)
select distinct
  pc.author_id as user_id,
  'comment_on_comment'::text as type,
  c.author_id as actor_id,
  c.post_id,
  c.id as comment_id,
  c.created_at
from public.comments c
inner join public.comments pc on pc.id = c.parent_id
where c.parent_id is not null
  and c.author_id != pc.author_id
  and not exists (
    select 1 from public.notifications n
    where n.user_id = pc.author_id
      and n.type = 'comment_on_comment'
      and n.comment_id = c.id
  )
  and not exists (
    select 1 from public.dms_blocks b
    where b.blocker = pc.author_id
      and b.blocked = c.author_id
  )
on conflict do nothing;

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

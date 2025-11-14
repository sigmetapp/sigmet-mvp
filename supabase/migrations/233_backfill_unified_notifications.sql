-- Backfill unified notifications from historical activity
begin;

-- Comments on posts
with comment_data as (
  select
    c.id::text as comment_id_text,
    c.post_id,
    c.created_at,
    public.resolve_post_author_id(c.post_id) as post_author_id,
    coalesce(
      nullif((to_jsonb(c)->>'author_id'), '')::uuid,
      nullif((to_jsonb(c)->>'user_id'), '')::uuid
    ) as comment_author_id
  from public.comments c
  where c.parent_id is null or c.parent_id::text = ''
)
insert into public.notifications (
  user_id,
  type,
  actor_id,
  post_id,
  comment_id,
  goal_id,
  goal_reaction_kind,
  trust_push_id,
  sw_level,
  read_at,
  hidden,
  created_at
)
select
  cd.post_author_id,
  'comment_on_post',
  cd.comment_author_id,
  cd.post_id,
  cd.comment_id_text,
  null,
  null,
  null,
  null,
  null,
  false,
  cd.created_at
from comment_data cd
where cd.post_author_id is not null
  and cd.comment_author_id is not null
  and cd.post_author_id <> cd.comment_author_id
  and not exists (
    select 1
    from public.notifications n
    where n.type = 'comment_on_post'
      and n.comment_id = cd.comment_id_text
  );

-- Replies to comments
with reply_data as (
  select
    c.id::text as reply_comment_id,
    c.post_id,
    c.created_at,
    coalesce(
      nullif((to_jsonb(c)->>'author_id'), '')::uuid,
      nullif((to_jsonb(c)->>'user_id'), '')::uuid
    ) as reply_author_id,
    coalesce(
      nullif((to_jsonb(parent)->>'author_id'), '')::uuid,
      nullif((to_jsonb(parent)->>'user_id'), '')::uuid
    ) as parent_author_id
  from public.comments c
  join public.comments parent
    on parent.id::text = c.parent_id::text
  where c.parent_id is not null
    and c.parent_id::text <> ''
)
insert into public.notifications (
  user_id,
  type,
  actor_id,
  post_id,
  comment_id,
  goal_id,
  goal_reaction_kind,
  trust_push_id,
  sw_level,
  read_at,
  hidden,
  created_at
)
select
  rd.parent_author_id,
  'comment_on_comment',
  rd.reply_author_id,
  rd.post_id,
  rd.reply_comment_id,
  null,
  null,
  null,
  null,
  null,
  false,
  rd.created_at
from reply_data rd
where rd.parent_author_id is not null
  and rd.reply_author_id is not null
  and rd.parent_author_id <> rd.reply_author_id
  and not exists (
    select 1
    from public.notifications n
    where n.type = 'comment_on_comment'
      and n.comment_id = rd.reply_comment_id
  );

-- Reactions on posts
with post_reaction_data as (
  select
    pr.post_id,
    pr.user_id as reactor_id,
    pr.created_at,
    public.resolve_post_author_id(pr.post_id) as post_author_id
  from public.post_reactions pr
)
insert into public.notifications (
  user_id,
  type,
  actor_id,
  post_id,
  comment_id,
  goal_id,
  goal_reaction_kind,
  trust_push_id,
  sw_level,
  read_at,
  hidden,
  created_at
)
select
  prd.post_author_id,
  'reaction_on_post',
  prd.reactor_id,
  prd.post_id,
  null,
  null,
  null,
  null,
  null,
  null,
  false,
  prd.created_at
from post_reaction_data prd
where prd.post_author_id is not null
  and prd.reactor_id is not null
  and prd.post_author_id <> prd.reactor_id
  and not exists (
    select 1
    from public.notifications n
    where n.type = 'reaction_on_post'
      and n.post_id = prd.post_id
      and n.actor_id = prd.reactor_id
  );

-- Reactions on comments
with comment_reaction_data as (
  select
    cr.user_id as reactor_id,
    cr.created_at,
    coalesce(
      nullif((to_jsonb(c)->>'author_id'), '')::uuid,
      nullif((to_jsonb(c)->>'user_id'), '')::uuid
    ) as comment_author_id,
    c.post_id,
    c.id::text as comment_id_text
  from public.comment_reactions cr
  join public.comments c
    on c.id::text = cr.comment_id::text
)
insert into public.notifications (
  user_id,
  type,
  actor_id,
  post_id,
  comment_id,
  goal_id,
  goal_reaction_kind,
  trust_push_id,
  sw_level,
  read_at,
  hidden,
  created_at
)
select
  crd.comment_author_id,
  'reaction_on_comment',
  crd.reactor_id,
  crd.post_id,
  crd.comment_id_text,
  null,
  null,
  null,
  null,
  null,
  false,
  crd.created_at
from comment_reaction_data crd
where crd.comment_author_id is not null
  and crd.reactor_id is not null
  and crd.comment_author_id <> crd.reactor_id
  and not exists (
    select 1
    from public.notifications n
    where n.type = 'reaction_on_comment'
      and n.comment_id = crd.comment_id_text
      and n.actor_id = crd.reactor_id
  );

-- Goal reactions
insert into public.notifications (
  user_id,
  type,
  actor_id,
  post_id,
  comment_id,
  goal_id,
  goal_reaction_kind,
  trust_push_id,
  sw_level,
  read_at,
  hidden,
  created_at
)
select
  gr.goal_user_id,
  'goal_reaction',
  gr.user_id,
  null,
  null,
  gr.goal_id,
  gr.kind,
  null,
  null,
  null,
  false,
  gr.created_at
from public.goal_reactions gr
where gr.goal_user_id is not null
  and gr.user_id is not null
  and gr.goal_user_id <> gr.user_id
  and not exists (
    select 1
    from public.notifications n
    where n.type = 'goal_reaction'
      and n.goal_id = gr.goal_id
      and n.goal_reaction_kind = gr.kind
      and n.actor_id = gr.user_id
      and n.user_id = gr.goal_user_id
  );

-- Trust push notifications
insert into public.notifications (
  user_id,
  type,
  actor_id,
  post_id,
  comment_id,
  goal_id,
  goal_reaction_kind,
  trust_push_id,
  sw_level,
  read_at,
  hidden,
  created_at
)
select
  tp.to_user_id,
  'trust_flow_entry',
  tp.from_user_id,
  null,
  null,
  null,
  null,
  tp.id,
  null,
  null,
  false,
  tp.created_at
from public.trust_pushes tp
where tp.to_user_id is not null
  and tp.from_user_id is not null
  and tp.to_user_id <> tp.from_user_id
  and not exists (
    select 1
    from public.notifications n
    where n.type = 'trust_flow_entry'
      and n.trust_push_id = tp.id
  );

commit;

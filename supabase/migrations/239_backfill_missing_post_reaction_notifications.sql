begin;

with reaction_authors as (
  select
    pr.post_id,
    pr.user_id as actor_id,
    pr.created_at,
    public.resolve_post_author_id(pr.post_id) as post_author_id
  from public.post_reactions pr
),
missing as (
  select ra.*
  from reaction_authors ra
  left join public.notifications n
    on n.user_id = ra.post_author_id
   and n.type = 'reaction_on_post'
   and n.post_id = ra.post_id
   and n.actor_id = ra.actor_id
  where ra.post_author_id is not null
    and ra.actor_id is not null
    and ra.actor_id <> ra.post_author_id
    and n.id is null
)
insert into public.notifications (user_id, type, actor_id, post_id, created_at)
select
  post_author_id,
  'reaction_on_post',
  actor_id,
  post_id,
  created_at
from missing
on conflict do nothing;

commit;

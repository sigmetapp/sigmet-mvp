begin;

create or replace function public.get_user_authored_comments_dynamic(
  p_user_id uuid,
  p_limit integer default 20
)
returns table (
  comment_id text,
  post_id text,
  created_at timestamptz,
  preview text,
  owner_id uuid,
  owner_column text,
  source_table text
)
language sql
security definer
set search_path = public
as $$
with owner_keys as (
  select array[
    'author_id','user_id','profile_id','profileid','user_profile_id','profile_uuid',
    'owner_id','owner','created_by','created_by_id','created_by_uuid','commenter_id',
    'creator_id','creator_uuid','poster_id','member_id','account_id','user_uuid',
    'author_uuid','user_uid','author_uid','authorId','userId','profileId',
    'userProfileId','profileUuid','ownerId','createdBy','createdById','createdByUuid',
    'commenterId','creatorId','creatorUuid','posterId','memberId','accountId',
    'userUuid','authorUuid','userUid','authorUid'
  ]::text[] as keys
),
sample_size as (
  select greatest(200, coalesce(p_limit, 20) * 5) as size
),
comments_data as (
  select
    'comments'::text as source_table,
    to_jsonb(c) as data
  from public.comments c
  order by coalesce(
    nullif((to_jsonb(c)->>'created_at'), '')::timestamptz,
    nullif((to_jsonb(c)->>'inserted_at'), '')::timestamptz,
    nullif((to_jsonb(c)->>'createdAt'), '')::timestamptz,
    nullif((to_jsonb(c)->>'updated_at'), '')::timestamptz,
    now()
  ) desc nulls last
  limit (select size from sample_size)
),
blog_comments_data as (
  select
    'blog_comments'::text as source_table,
    to_jsonb(c) as data
  from public.blog_comments c
  order by coalesce(
    nullif((to_jsonb(c)->>'created_at'), '')::timestamptz,
    nullif((to_jsonb(c)->>'inserted_at'), '')::timestamptz,
    nullif((to_jsonb(c)->>'createdAt'), '')::timestamptz,
    nullif((to_jsonb(c)->>'updated_at'), '')::timestamptz,
    now()
  ) desc nulls last
  limit (select size from sample_size)
),
union_comments as (
  select * from comments_data
  union all
  select * from blog_comments_data
),
enriched as (
  select
    uc.source_table,
    uc.data,
    chosen.key as owner_key,
    chosen.value as owner_value
  from union_comments uc
  cross join owner_keys ok
  left join lateral (
    select key, value
    from jsonb_each_text(uc.data)
    where value = p_user_id::text
      and (
        key = any(ok.keys)
        or key ~* '(author|user|profile|owner|creator|member|account)'
      )
    order by coalesce(array_position(ok.keys, key), 999), key
    limit 1
  ) as chosen on true
)
select
  e.data->>'id' as comment_id,
  coalesce(
    e.data->>'post_id',
    e.data->>'postId',
    e.data->>'postID',
    e.data->>'post_uuid',
    e.data->>'postUuid'
  ) as post_id,
  coalesce(
    nullif(e.data->>'created_at', '')::timestamptz,
    nullif(e.data->>'inserted_at', '')::timestamptz,
    nullif(e.data->>'createdAt', '')::timestamptz,
    nullif(e.data->>'updated_at', '')::timestamptz
  ) as created_at,
  left(
    coalesce(
      nullif(e.data->>'text', ''),
      nullif(e.data->>'body', ''),
      nullif(e.data->>'content', ''),
      nullif(e.data->>'message', ''),
      nullif(e.data->>'comment', ''),
      nullif(e.data->>'description', '')
    ),
    240
  ) as preview,
  p_user_id as owner_id,
  e.owner_key as owner_column,
  e.source_table
from enriched e
where e.owner_value = p_user_id::text
order by created_at desc nulls last
limit greatest(1, coalesce(p_limit, 20));
$$;

grant execute on function public.get_user_authored_comments_dynamic(uuid, integer) to authenticated;

commit;

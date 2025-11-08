begin;

-- Fix unread count calculation to use message ID instead of created_at
-- This ensures accurate counting of unread messages

drop function if exists public.dms_list_partners(uuid, integer, integer);

create function public.dms_list_partners(
  p_user_id uuid,
  p_limit integer default 20,
  p_offset integer default 0
)
  returns table (
  thread_id text,
    partner_id uuid,
    partner_username text,
    partner_full_name text,
    partner_avatar_url text,
    last_message_id text,
    last_message_body text,
    last_message_kind text,
    last_message_sender_id uuid,
  last_message_attachments jsonb,
    last_message_at timestamptz,
    messages24h integer,
    unread_count integer,
    is_pinned boolean,
    pinned_at timestamptz,
    notifications_muted boolean,
    mute_until timestamptz,
  last_read_message_id text,
    last_read_at timestamptz,
    thread_created_at timestamptz
  )
language sql
security definer
set search_path = public
as $$
with ranked_threads as (
  select
    tp.thread_id,
    coalesce(tp.notifications_muted, false) as notifications_muted,
    tp.mute_until,
    coalesce(tp.is_pinned, false) as is_pinned,
    tp.pinned_at,
    tp.last_read_message_id::bigint as last_read_message_id,
    tp.last_read_at,
    t.created_at,
    t.last_message_id,
    t.last_message_at,
    row_number() over (
      order by
        coalesce(tp.is_pinned, false) desc,
        tp.pinned_at desc nulls last,
        t.last_message_at desc nulls last,
        t.created_at desc,
        tp.thread_id desc
    ) as rn
  from public.dms_thread_participants tp
  join public.dms_threads t on t.id = tp.thread_id
  where tp.user_id = p_user_id
    and t.is_group = false
),
limited_threads as (
  select *
  from ranked_threads
  where rn > coalesce(p_offset, 0)
    and rn <= coalesce(p_offset, 0) + coalesce(p_limit, 20)
),
partners as (
  select
    tp.thread_id,
    tp.user_id as partner_id
  from public.dms_thread_participants tp
  join limited_threads lt on lt.thread_id = tp.thread_id
  where tp.user_id <> p_user_id
),
  last_messages as (
    select
      lt.thread_id,
      lm.id,
      lm.body,
      lm.kind,
      lm.sender_id,
      lm.attachments,
      lm.created_at
    from limited_threads lt
    left join lateral (
      select
        m.id::text as id,
        m.body,
        m.kind,
        m.sender_id,
        m.attachments,
        m.created_at
      from public.dms_messages m
      where m.thread_id = lt.thread_id
      order by m.created_at desc, m.id desc
      limit 1
    ) lm on true
  ),
messages_24h as (
  select
    m.thread_id,
    count(*) filter (where m.deleted_at is null) as cnt
  from public.dms_messages m
  join limited_threads lt on lt.thread_id = m.thread_id
  where m.created_at >= now() - interval '24 hours'
  group by m.thread_id
),
unread as (
  select
    lt.thread_id,
    (
      select count(*)
      from public.dms_messages msg
      where msg.thread_id = lt.thread_id
        and msg.deleted_at is null
        and msg.sender_id <> p_user_id
        and (
          lt.last_read_message_id is null
          or lt.last_read_at is null
          or msg.created_at > lt.last_read_at
        )
    ) as unread_count
  from limited_threads lt
)
select
  lt.thread_id::text as thread_id,
  p.partner_id,
  prof.username,
  prof.full_name,
  prof.avatar_url,
    coalesce(lm.id, lt.last_message_id::text) as last_message_id,
    lm.body,
    lm.kind,
    lm.sender_id,
  coalesce(lm.attachments, '[]'::jsonb) as last_message_attachments,
    coalesce(lm.created_at, lt.last_message_at) as last_message_at,
  coalesce(m24.cnt, 0) as messages24h,
  coalesce(u.unread_count, 0) as unread_count,
  lt.is_pinned,
  lt.pinned_at,
  lt.notifications_muted,
  lt.mute_until,
  lt.last_read_message_id::text as last_read_message_id,
  lt.last_read_at,
  lt.created_at as thread_created_at
from limited_threads lt
join partners p on p.thread_id = lt.thread_id
left join public.profiles prof on prof.user_id = p.partner_id
left join last_messages lm on lm.thread_id = lt.thread_id
left join messages_24h m24 on m24.thread_id = lt.thread_id
left join unread u on u.thread_id = lt.thread_id
order by
  lt.is_pinned desc,
  lt.pinned_at desc nulls last,
  lt.last_message_at desc nulls last,
  lt.created_at desc,
  lt.thread_id desc;
$$;

grant execute on function public.dms_list_partners(uuid, integer, integer) to authenticated;

commit;

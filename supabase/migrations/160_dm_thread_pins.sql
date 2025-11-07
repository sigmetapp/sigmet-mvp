begin;

alter table public.dms_thread_participants
  add column if not exists is_pinned boolean not null default false;

alter table public.dms_thread_participants
  add column if not exists pinned_at timestamptz;

alter table public.dms_thread_participants
  add column if not exists mute_until timestamptz;

alter table public.dms_thread_participants
  add column if not exists last_read_message_id bigint;

alter table public.dms_thread_participants
  add column if not exists last_read_at timestamptz;

alter table public.dms_thread_participants
  add column if not exists notifications_muted boolean;

update public.dms_thread_participants
  set notifications_muted = coalesce(notifications_muted, false)
  where notifications_muted is null;

alter table public.dms_thread_participants
  alter column notifications_muted set default false;

create index if not exists dms_participants_pinned_idx
  on public.dms_thread_participants (user_id, is_pinned desc, pinned_at desc nulls last);

drop function if exists public.dms_list_partners(uuid, integer, integer);

create function public.dms_list_partners(
  p_user_id uuid,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  thread_id bigint,
  partner_id uuid,
  partner_username text,
  partner_full_name text,
  partner_avatar_url text,
  last_message_id bigint,
  last_message_body text,
  last_message_kind text,
  last_message_sender_id uuid,
  last_message_at timestamptz,
  messages24h integer,
  unread_count integer,
  is_pinned boolean,
  pinned_at timestamptz,
  notifications_muted boolean,
  mute_until timestamptz,
  last_read_message_id bigint,
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
    tp.last_read_message_id,
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
    m.id,
    m.thread_id,
    m.body,
    m.kind,
    m.sender_id,
    m.created_at
  from public.dms_messages m
  join limited_threads lt on lt.last_message_id = m.id
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
    m.thread_id,
    count(*) as unread_count
  from public.dms_messages m
  join limited_threads lt on lt.thread_id = m.thread_id
  where m.deleted_at is null
    and m.sender_id <> p_user_id
    and (lt.last_read_message_id is null or m.id > lt.last_read_message_id)
  group by m.thread_id
)
select
  lt.thread_id,
  p.partner_id,
  prof.username,
  prof.full_name,
  prof.avatar_url,
  lt.last_message_id,
  lm.body,
  lm.kind,
  lm.sender_id,
  coalesce(lm.created_at, lt.last_message_at) as last_message_at,
  coalesce(m24.cnt, 0) as messages24h,
  coalesce(u.unread_count, 0) as unread_count,
  lt.is_pinned,
  lt.pinned_at,
  lt.notifications_muted,
  lt.mute_until,
  lt.last_read_message_id,
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

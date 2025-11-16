begin;

-- Ensure unread counts fall back to last_read_at when receipts are missing
create or replace function public.dms_list_partners_optimized(
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
stable
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
    from dms_thread_participants tp
    join dms_threads t on t.id = tp.thread_id
    where tp.user_id = p_user_id
      and t.is_group = false
  ),
  limited_threads as (
    select *
    from ranked_threads
    where rn > coalesce(p_offset, 0)
      and rn <= coalesce(p_offset, 0) + coalesce(p_limit, 20)
  ),
  normalized_threads as (
    select
      lt.*,
      lt.last_read_message_id::text as last_read_message_id_text
    from limited_threads lt
  ),
  partners as (
    select
      tp.thread_id,
      tp.user_id as partner_id
    from dms_thread_participants tp
    join normalized_threads nt on nt.thread_id = tp.thread_id
    where tp.user_id <> p_user_id
  ),
  last_messages as (
    select
      nt.thread_id,
      lm.id,
      lm.body,
      lm.kind,
      lm.sender_id,
      lm.attachments,
      lm.created_at
    from normalized_threads nt
    left join lateral (
      select
        m.id::text as id,
        m.body,
        m.kind,
        m.sender_id,
        m.attachments,
        m.created_at
      from dms_messages m
      where m.thread_id = nt.thread_id
      order by m.created_at desc, m.id desc
      limit 1
    ) lm on true
  ),
  messages_24h as (
    select
      m.thread_id,
      count(*) filter (where m.deleted_at is null) as cnt
    from dms_messages m
    join normalized_threads nt on nt.thread_id = m.thread_id
    where m.created_at >= now() - interval '24 hours'
    group by m.thread_id
  ),
  unread_receipts as (
    select
      msg.thread_id,
      count(*) filter (where coalesce(r.status, 'sent') <> 'read') as unread_count
    from dms_message_receipts r
    join dms_messages msg on msg.id = r.message_id
    join normalized_threads nt on nt.thread_id = msg.thread_id
    where r.user_id = p_user_id
      and msg.deleted_at is null
      and msg.sender_id <> p_user_id
    group by msg.thread_id
  ),
  unread_fallback as (
    select
      nt.thread_id,
      count(*) filter (
        where msg.deleted_at is null
          and msg.sender_id <> p_user_id
          and (nt.last_read_at is null or msg.created_at > nt.last_read_at)
          and not exists (
            select 1
            from dms_message_receipts r
            where r.message_id = msg.id
              and r.user_id = p_user_id
              and r.status = 'read'
          )
      ) as unread_count
    from normalized_threads nt
    join dms_messages msg on msg.thread_id = nt.thread_id
    group by nt.thread_id
  )
  select
    nt.thread_id::text as thread_id,
    p.partner_id,
    prof.username,
    prof.full_name,
    prof.avatar_url,
    coalesce(lm.id, nt.last_message_id::text) as last_message_id,
    lm.body,
    lm.kind,
    lm.sender_id,
    coalesce(lm.attachments, '[]'::jsonb) as last_message_attachments,
    coalesce(lm.created_at, nt.last_message_at) as last_message_at,
    coalesce(m24.cnt, 0) as messages24h,
    coalesce(ur.unread_count, uf.unread_count, 0) as unread_count,
    nt.is_pinned,
    nt.pinned_at,
    nt.notifications_muted,
    nt.mute_until,
    nt.last_read_message_id_text as last_read_message_id,
    nt.last_read_at,
    nt.created_at as thread_created_at
  from normalized_threads nt
  join partners p on p.thread_id = nt.thread_id
  left join profiles prof on prof.user_id = p.partner_id
  left join last_messages lm on lm.thread_id = nt.thread_id
  left join messages_24h m24 on m24.thread_id = nt.thread_id
  left join unread_receipts ur on ur.thread_id = nt.thread_id
  left join unread_fallback uf on uf.thread_id = nt.thread_id
  order by
    nt.is_pinned desc,
    nt.pinned_at desc nulls last,
    nt.last_message_at desc nulls last,
    nt.created_at desc,
    nt.thread_id desc;
$$;

commit;

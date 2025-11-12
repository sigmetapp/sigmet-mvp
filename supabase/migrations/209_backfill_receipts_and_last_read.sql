begin;

-- Backfill receipts for existing messages that don't have receipts
-- This ensures that all messages have receipts for proper unread count calculation
insert into public.dms_message_receipts (message_id, user_id, status, created_at, updated_at)
select 
  m.id as message_id,
  tp.user_id,
  case 
    -- If last_read_message_id is set and message id <= last_read_message_id, mark as read
    when tp.last_read_message_id is not null and m.id <= tp.last_read_message_id then 'read'
    -- Otherwise mark as sent (will be updated to delivered/read later)
    else 'sent'
  end as status,
  m.created_at,
  m.created_at as updated_at
from public.dms_messages m
join public.dms_thread_participants tp on tp.thread_id = m.thread_id
where m.deleted_at is null
  and m.sender_id <> tp.user_id  -- Only create receipts for messages not sent by the user
  and not exists (
    select 1
    from public.dms_message_receipts r
    where r.message_id = m.id
      and r.user_id = tp.user_id
  )
on conflict (message_id, user_id) do nothing;

-- Update last_read_at for participants who have last_read_message_id but no last_read_at
update public.dms_thread_participants tp
set last_read_at = (
  select m.created_at
  from public.dms_messages m
  where m.id = tp.last_read_message_id
  limit 1
)
where tp.last_read_message_id is not null
  and tp.last_read_at is null;

commit;

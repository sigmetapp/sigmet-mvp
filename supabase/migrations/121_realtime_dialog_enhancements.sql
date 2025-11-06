begin;

-- Backfill sequence numbers where null before enforcing constraint
update public.dms_messages m
set sequence_number = sub.seq
from (
  select id,
         row_number() over (partition by thread_id order by created_at asc, id asc) as seq
  from public.dms_messages
  where sequence_number is null
) as sub
where m.id = sub.id;

-- Ensure sequence numbers are not null and unique per thread
alter table public.dms_messages
  alter column sequence_number set not null;

alter table public.dms_messages
  add constraint dms_messages_thread_sequence_unique
  unique (thread_id, sequence_number);

-- Expand allowed message kinds to support media and files
alter table public.dms_messages
  drop constraint if exists dms_messages_kind_check;

alter table public.dms_messages
  add constraint dms_messages_kind_check
  check (kind in ('text', 'system', 'media', 'file'));

do $$
begin
  if to_regclass('public.dms_messages_2') is not null then
    alter table public.dms_messages_2
      drop constraint if exists dms_messages_2_kind_check;

    alter table public.dms_messages_2
      add constraint dms_messages_2_kind_check
      check (kind in ('text', 'system', 'media', 'file'));
  end if;
end
$$;

-- Allow "sent" status for delivery tracking
alter table public.dms_message_receipts
  drop constraint if exists dms_message_receipts_status_check;

alter table public.dms_message_receipts
  add constraint dms_message_receipts_status_check
  check (status in ('sent', 'delivered', 'read'));

commit;

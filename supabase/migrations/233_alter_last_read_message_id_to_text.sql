begin;

-- Rebuild index because we're changing column type
drop index if exists dms_participants_last_read_idx;

alter table public.dms_thread_participants
  alter column last_read_message_id type text
  using last_read_message_id::text;

create index if not exists dms_participants_last_read_idx
  on public.dms_thread_participants(thread_id, last_read_message_id);

commit;

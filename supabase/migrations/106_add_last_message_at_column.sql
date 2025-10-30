-- Ensure last_message_at exists on dms_threads and backfill
begin;

alter table if exists public.dms_threads
  add column if not exists last_message_at timestamptz;

create index if not exists dms_threads_last_message_at_idx
  on public.dms_threads(last_message_at desc);

-- Backfill from existing messages
with latest as (
  select thread_id, max(created_at) as last_ts
  from public.dms_messages
  group by thread_id
)
update public.dms_threads t
set last_message_at = l.last_ts
from latest l
where t.id = l.thread_id
  and (t.last_message_at is null or t.last_message_at <> l.last_ts);

commit;

-- Add sequence numbers and deduplication fields for real-time dialog system
-- This enables per-conversation ordering and message deduplication

begin;

-- Add sequence_number to messages for per-thread ordering
alter table public.dms_messages
  add column if not exists sequence_number bigint;

-- Create index for efficient ordering
create index if not exists dms_messages_thread_sequence_idx 
  on public.dms_messages(thread_id, sequence_number asc nulls last);

-- Add client_msg_id for deduplication (temporary ID from client)
alter table public.dms_messages
  add column if not exists client_msg_id text;

-- Create unique index for client_msg_id per thread to prevent duplicates
create unique index if not exists dms_messages_thread_client_msg_id_idx
  on public.dms_messages(thread_id, client_msg_id)
  where client_msg_id is not null;

-- Function to generate sequence numbers per thread
create or replace function public.generate_message_sequence()
returns trigger as $$
declare
  next_seq bigint;
begin
  -- Get the next sequence number for this thread
  select coalesce(max(sequence_number), 0) + 1
  into next_seq
  from public.dms_messages
  where thread_id = new.thread_id;
  
  new.sequence_number := next_seq;
  return new;
end;
$$ language plpgsql;

-- Trigger to auto-generate sequence numbers
drop trigger if exists dms_messages_sequence_trigger on public.dms_messages;
create trigger dms_messages_sequence_trigger
  before insert on public.dms_messages
  for each row
  when (new.sequence_number is null)
  execute function public.generate_message_sequence();

-- Backfill sequence numbers for existing messages
do $$
declare
  thread_rec record;
  msg_rec record;
  seq_num bigint;
begin
  for thread_rec in select distinct thread_id from public.dms_messages where sequence_number is null
  loop
    seq_num := 1;
    for msg_rec in 
      select id from public.dms_messages 
      where thread_id = thread_rec.thread_id 
      and sequence_number is null
      order by created_at asc, id asc
    loop
      update public.dms_messages
      set sequence_number = seq_num
      where id = msg_rec.id;
      seq_num := seq_num + 1;
    end loop;
  end loop;
end $$;

commit;

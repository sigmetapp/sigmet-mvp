-- Idempotent, low-latency DM flow
-- Adds RPC functions for atomic idempotent send and batch read markers

begin;

-- Ensure client_msg_id can be UUID type (if not already text)
-- The column already exists from migration 118, but we ensure it's text for UUID strings
alter table public.dms_messages
  alter column client_msg_id type text;

-- Ensure unique constraint exists (from migration 118, but ensure it's there)
create unique index if not exists uq_messages_thread_client
  on public.dms_messages (thread_id, client_msg_id)
  where client_msg_id is not null;

-- Hot read path index (if not exists)
create index if not exists idx_messages_thread_created_desc
  on public.dms_messages (thread_id, created_at desc, id desc);

-- RPC for atomic idempotent send
-- Uses existing insert_dms_message function but wraps it with idempotency
create or replace function public.send_message(
  p_thread_id bigint,
  p_client_msg_id text,
  p_body text,
  p_kind text default 'text',
  p_attachments jsonb default '[]'::jsonb
)
returns public.dms_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.dms_messages;
  v_sender_id uuid;
  v_body text;
begin
  -- Get authenticated user
  v_sender_id := auth.uid();
  if v_sender_id is null then
    raise exception 'Unauthorized';
  end if;

  -- Handle null body when attachments exist (use zero-width space)
  v_body := p_body;
  if v_body is null and p_attachments is not null and jsonb_array_length(p_attachments) > 0 then
    v_body := chr(8203); -- Zero-width space (U+200B)
  end if;

  -- Use existing insert_dms_message function which handles idempotency
  -- It checks for duplicate client_msg_id and returns existing if found
  select * into rec
  from public.insert_dms_message(
    p_thread_id,
    v_sender_id,
    v_body,
    p_kind,
    p_attachments,
    p_client_msg_id
  );

  return rec;
end;
$$;

-- Grant execute permission
grant execute on function public.send_message(bigint, text, text, text, jsonb) to authenticated;
grant execute on function public.send_message(bigint, text, text, text, jsonb) to service_role;

-- RPC to set read markers in batch
create or replace function public.mark_read(
  p_thread_id bigint,
  p_before timestamptz
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.dms_messages
  set read_at = now()
  where thread_id = p_thread_id
    and read_at is null
    and created_at <= p_before
    and sender_id != auth.uid()
    and exists (
      select 1 from public.dms_thread_participants cm
      where cm.thread_id = public.dms_messages.thread_id 
        and cm.user_id = auth.uid()
    );
$$;

-- Grant execute permission
grant execute on function public.mark_read(bigint, timestamptz) to authenticated;

-- Note: read_at column may not exist, so we'll add it if needed
alter table public.dms_messages
  add column if not exists read_at timestamptz;

-- Add delivered_at column if needed (for delivery tracking)
alter table public.dms_messages
  add column if not exists delivered_at timestamptz;

commit;

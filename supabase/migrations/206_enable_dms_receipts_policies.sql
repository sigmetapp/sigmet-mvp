begin;

-- Ensure authenticated users can access the schema and table
grant usage on schema public to authenticated;
grant select, insert, update on public.dms_message_receipts to authenticated;

-- Enable row level security so that we can scope access to DM participants
alter table public.dms_message_receipts enable row level security;

-- Drop existing policies if they already exist (keeps migration idempotent)
drop policy if exists "DM receipts select for participants" on public.dms_message_receipts;
drop policy if exists "DM receipts insert own" on public.dms_message_receipts;
drop policy if exists "DM receipts update own" on public.dms_message_receipts;

-- Allow conversation participants to view delivery/read receipts
create policy "DM receipts select for participants"
  on public.dms_message_receipts
  for select
  using (
    exists (
      select 1
      from public.dms_messages m
      join public.dms_thread_participants tp
        on tp.thread_id = m.thread_id
      where m.id = dms_message_receipts.message_id
        and tp.user_id = auth.uid()
    )
  );

-- Allow users to insert (upsert) receipts for themselves when acknowledging messages
create policy "DM receipts insert own"
  on public.dms_message_receipts
  for insert
  with check (
    dms_message_receipts.user_id = auth.uid()
    and exists (
      select 1
      from public.dms_messages m
      join public.dms_thread_participants tp
        on tp.thread_id = m.thread_id
      where m.id = dms_message_receipts.message_id
        and tp.user_id = auth.uid()
    )
  );

-- Allow users to update their own receipts (e.g., mark messages as read)
create policy "DM receipts update own"
  on public.dms_message_receipts
  for update
  using (
    dms_message_receipts.user_id = auth.uid()
    and exists (
      select 1
      from public.dms_messages m
      join public.dms_thread_participants tp
        on tp.thread_id = m.thread_id
      where m.id = dms_message_receipts.message_id
        and tp.user_id = auth.uid()
    )
  )
  with check (
    dms_message_receipts.user_id = auth.uid()
    and exists (
      select 1
      from public.dms_messages m
      join public.dms_thread_participants tp
        on tp.thread_id = m.thread_id
      where m.id = dms_message_receipts.message_id
        and tp.user_id = auth.uid()
    )
  );

commit;

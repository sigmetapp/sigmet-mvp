-- Dual-channel messaging architecture: new messages table
-- This migration creates the new messages table for the dual-channel architecture
-- with WebSocket instant delivery + async DB persistence with deduplication

begin;

-- New messages table for dual-channel architecture
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  client_msg_id uuid not null,
  body text not null,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- Unique index for deduplication: (conversation_id, client_msg_id)
create unique index if not exists messages_conv_client_uidx
  on public.messages (conversation_id, client_msg_id);

-- Index for pagination by created_at
create index if not exists messages_conv_created_idx
  on public.messages (conversation_id, created_at);

-- Index for sender queries
create index if not exists messages_sender_idx
  on public.messages (sender_id, created_at desc);

-- Index for recipient queries
create index if not exists messages_recipient_idx
  on public.messages (recipient_id, created_at desc);

-- Enable RLS
alter table public.messages enable row level security;

-- Drop policies if they exist (for idempotency)
drop policy if exists "read_messages" on public.messages;
drop policy if exists "insert_messages" on public.messages;
drop policy if exists "update_messages" on public.messages;
drop policy if exists "delete_messages" on public.messages;

-- RLS Policy: Users can read messages where they are sender or recipient
create policy "read_messages"
  on public.messages
  for select
  using (
    auth.uid() = sender_id or auth.uid() = recipient_id
  );

-- RLS Policy: Users can insert messages where they are the sender
create policy "insert_messages"
  on public.messages
  for insert
  with check (
    auth.uid() = sender_id
  );

-- RLS Policy: Users can update their own messages (for meta updates, etc.)
create policy "update_messages"
  on public.messages
  for update
  using (
    auth.uid() = sender_id
  )
  with check (
    auth.uid() = sender_id
  );

-- RLS Policy: Users can delete their own messages
create policy "delete_messages"
  on public.messages
  for delete
  using (
    auth.uid() = sender_id
  );

-- Enable realtime replication for the new messages table
-- Note: This may fail if table is already in publication, which is fine
do $$
begin
  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' 
    and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

-- Set replica identity to full for better change tracking
alter table public.messages replica identity full;

commit;

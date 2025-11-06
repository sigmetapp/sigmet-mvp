-- Enable realtime replication for dms_messages table
-- This is required for Supabase Realtime to work properly
-- Without this, real-time subscriptions will not receive updates

begin;

-- Enable replication for dms_messages table
-- This allows Supabase Realtime to track changes
alter publication supabase_realtime add table public.dms_messages;

-- Also enable replication for dms_threads to track thread updates
alter publication supabase_realtime add table public.dms_threads;

-- Enable replication for dms_message_receipts to track delivery status
alter publication supabase_realtime add table public.dms_message_receipts;

-- Set replica identity to full for better change tracking
-- This ensures all column changes are tracked, not just primary key
alter table public.dms_messages replica identity full;
alter table public.dms_threads replica identity full;
alter table public.dms_message_receipts replica identity full;

commit;

begin;

-- Add updated_at column to dms_message_receipts if it doesn't exist
-- This column is needed for tracking when receipts were last updated
alter table public.dms_message_receipts
  add column if not exists updated_at timestamptz not null default now();

-- Create a trigger to automatically update updated_at on row updates
create or replace function public.update_dms_message_receipts_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists update_dms_message_receipts_updated_at on public.dms_message_receipts;

create trigger update_dms_message_receipts_updated_at
  before update on public.dms_message_receipts
  for each row
  execute function public.update_dms_message_receipts_updated_at();

-- Update the index to include updated_at if it doesn't already
-- The index should already exist from migration 101, but we ensure it's correct
drop index if exists public.dms_receipts_user_status_idx;
create index if not exists dms_receipts_user_status_idx 
  on public.dms_message_receipts(user_id, status, updated_at desc);

commit;

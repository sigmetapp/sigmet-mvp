begin;

alter table public.dms_message_receipts
  drop constraint if exists dms_message_receipts_status_check;

alter table public.dms_message_receipts
  add constraint dms_message_receipts_status_check
  check (status in ('sent', 'delivered', 'read'));

commit;

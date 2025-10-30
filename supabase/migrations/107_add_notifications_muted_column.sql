-- Ensure notifications_muted exists on dms_thread_participants
begin;

alter table if exists public.dms_thread_participants
  add column if not exists notifications_muted boolean not null default false;

commit;

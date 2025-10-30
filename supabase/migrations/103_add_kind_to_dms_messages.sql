-- Ensure dms_messages.kind exists (production safety)
begin;

alter table if exists public.dms_messages
  add column if not exists kind text;

-- Backfill nulls to 'text' to satisfy not-null
update public.dms_messages set kind = 'text' where kind is null;

-- Enforce not-null and default
alter table if exists public.dms_messages
  alter column kind set not null,
  alter column kind set default 'text';

-- Add a check constraint if it doesn't already exist
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'dms_messages_kind_check'
  ) then
    alter table public.dms_messages
      add constraint dms_messages_kind_check check (kind in ('text','system'));
  end if;
end$$;

commit;

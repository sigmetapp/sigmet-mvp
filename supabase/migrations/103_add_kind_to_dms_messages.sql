begin;

-- Add column to primary table if it exists (local/dev)
alter table if exists public.dms_messages
  add column if not exists kind text;

-- Also add column to potential underlying table if it exists (some prod setups)
alter table if exists public.dms_messages_2
  add column if not exists kind text;

-- Backfill nulls to 'text' to satisfy not-null
update public.dms_messages set kind = 'text' where kind is null;
do $$
begin
  if to_regclass('public.dms_messages_2') is not null then
    update public.dms_messages_2 set kind = 'text' where kind is null;
  end if;
end$$;

-- Enforce not-null and default
alter table if exists public.dms_messages
  alter column kind set not null,
  alter column kind set default 'text';

alter table if exists public.dms_messages_2
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

-- Add the same check on the underlying table if it exists
do $$
begin
  if to_regclass('public.dms_messages_2') is not null and not exists (
    select 1 from pg_constraint where conname = 'dms_messages_2_kind_check'
  ) then
    alter table public.dms_messages_2
      add constraint dms_messages_2_kind_check check (kind in ('text','system'));
  end if;
end$$;

commit;

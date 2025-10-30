-- Ensure dms_blocks has expected columns and constraints
begin;

-- Create table if missing (no-op if exists)
create table if not exists public.dms_blocks (
  blocker uuid references auth.users(id) on delete cascade,
  blocked uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked)
);

-- Rename common legacy column names to expected ones
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'dms_blocks' and column_name = 'blocker_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'dms_blocks' and column_name = 'blocker'
  ) then
    execute 'alter table public.dms_blocks rename column blocker_id to blocker';
  end if;
end $$;

do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'dms_blocks' and column_name = 'blocked_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'dms_blocks' and column_name = 'blocked'
  ) then
    execute 'alter table public.dms_blocks rename column blocked_id to blocked';
  end if;
end $$;

-- Another possible legacy naming variant: *_user_id
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'dms_blocks' and column_name = 'blocker_user_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'dms_blocks' and column_name = 'blocker'
  ) then
    execute 'alter table public.dms_blocks rename column blocker_user_id to blocker';
  end if;
end $$;

do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'dms_blocks' and column_name = 'blocked_user_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'dms_blocks' and column_name = 'blocked'
  ) then
    execute 'alter table public.dms_blocks rename column blocked_user_id to blocked';
  end if;
end $$;

-- Add columns if still missing
alter table if exists public.dms_blocks add column if not exists blocker uuid;
alter table if exists public.dms_blocks add column if not exists blocked uuid;

-- Ensure FKs exist (add if missing)
do $$ begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where c.conname = 'dms_blocks_blocker_fkey' and n.nspname = 'public' and t.relname = 'dms_blocks'
  ) then
    execute 'alter table public.dms_blocks add constraint dms_blocks_blocker_fkey foreign key (blocker) references auth.users(id) on delete cascade';
  end if;
end $$;

do $$ begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where c.conname = 'dms_blocks_blocked_fkey' and n.nspname = 'public' and t.relname = 'dms_blocks'
  ) then
    execute 'alter table public.dms_blocks add constraint dms_blocks_blocked_fkey foreign key (blocked) references auth.users(id) on delete cascade';
  end if;
end $$;

-- Ensure PK on (blocker, blocked)
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'dms_blocks_pkey' and conrelid = 'public.dms_blocks'::regclass
  ) then
    -- Drop any single-column primary keys if present to avoid conflict
    if exists (
      select 1 from pg_constraint
      where conrelid = 'public.dms_blocks'::regclass and contype = 'p'
    ) then
      execute (
        select 'alter table public.dms_blocks drop constraint ' || quote_ident(c.conname)
        from pg_constraint c
        where c.conrelid = 'public.dms_blocks'::regclass and c.contype = 'p'
        limit 1
      );
    end if;
    execute 'alter table public.dms_blocks add constraint dms_blocks_pkey primary key (blocker, blocked)';
  end if;
end $$;

-- Helpful index used by queries
create index if not exists dms_blocks_blocked_idx on public.dms_blocks(blocked);

commit;
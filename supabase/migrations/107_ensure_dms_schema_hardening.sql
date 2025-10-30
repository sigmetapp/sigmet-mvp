-- Ensure DMS schema is present across environments (idempotent)
-- This migration safely creates missing tables/columns/indexes without breaking existing data.

begin;

-- dms_threads
create table if not exists public.dms_threads (
  id bigserial primary key,
  created_by uuid not null references auth.users(id) on delete cascade,
  is_group boolean not null default false,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz
);

create index if not exists dms_threads_creator_idx on public.dms_threads(created_by);
create index if not exists dms_threads_last_message_at_idx on public.dms_threads(last_message_at desc);

-- Ensure last_message_id exists with the SAME TYPE as dms_messages.id (uuid or bigint)
do $$
declare
  msg_id_type regtype;
  thread_col_type regtype;
begin
  -- Determine the data type of public.dms_messages.id
  select a.atttypid::regtype into msg_id_type
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'dms_messages'
    and a.attname = 'id'
    and a.attnum > 0
    and not a.attisdropped;

  -- Default to bigint if table/column is missing (fresh env)
  if msg_id_type is null then
    msg_id_type := 'bigint'::regtype;
  end if;

  -- Add column with the matching type if it doesn't exist yet
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'dms_threads' and column_name = 'last_message_id'
  ) then
    execute format('alter table public.dms_threads add column last_message_id %s', msg_id_type::text);
  end if;

  -- Ensure index exists regardless of type
  execute 'create index if not exists dms_threads_last_message_id_idx on public.dms_threads(last_message_id)';

  -- Read the current type of last_message_id
  select a.atttypid::regtype into thread_col_type
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'dms_threads'
    and a.attname = 'last_message_id'
    and a.attnum > 0
    and not a.attisdropped;

  -- Only add the FK when the types are compatible
  if thread_col_type = msg_id_type and not exists (
    select 1 from pg_constraint where conname = 'dms_threads_last_message_fk'
  ) then
    execute 'alter table public.dms_threads add constraint dms_threads_last_message_fk foreign key (last_message_id) references public.dms_messages(id) on delete set null';
  end if;
end $$;

-- dms_thread_participants
create table if not exists public.dms_thread_participants (
  thread_id bigint not null references public.dms_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  last_read_message_id bigint,
  last_read_at timestamptz,
  notifications_muted boolean not null default false,
  is_archived boolean not null default false,
  primary key (thread_id, user_id)
);

-- Add any missing per-user state columns (for legacy DBs)
alter table if exists public.dms_thread_participants
  add column if not exists last_read_message_id bigint,
  add column if not exists last_read_at timestamptz,
  add column if not exists notifications_muted boolean not null default false,
  add column if not exists is_archived boolean not null default false,
  add column if not exists role text;

-- Ensure role has expected check and default
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'dms_thread_participants_role_check'
  ) then
    alter table public.dms_thread_participants
      add constraint dms_thread_participants_role_check check (role in ('owner','member'));
  end if;
end $$;

alter table if exists public.dms_thread_participants alter column role set default 'member';

create index if not exists dms_participants_user_idx on public.dms_thread_participants(user_id);
create index if not exists dms_participants_user_thread_idx on public.dms_thread_participants(user_id, thread_id);
create index if not exists dms_participants_last_read_idx on public.dms_thread_participants(thread_id, last_read_message_id);

-- dms_messages
create table if not exists public.dms_messages (
  id bigserial primary key,
  thread_id bigint not null references public.dms_threads(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'text',
  body text,
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);

create index if not exists dms_messages_thread_created_idx on public.dms_messages(thread_id, created_at desc);
create index if not exists dms_messages_sender_created_idx on public.dms_messages(sender_id, created_at desc);

-- Ensure kind has constraint
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'dms_messages_kind_check'
  ) then
    alter table public.dms_messages
      add constraint dms_messages_kind_check check (kind in ('text','system'));
  end if;
end $$;

-- Backfill null kinds then enforce not null/default
update public.dms_messages set kind = 'text' where kind is null;
alter table if exists public.dms_messages alter column kind set not null;
alter table if exists public.dms_messages alter column kind set default 'text';

-- dms_message_receipts
do $$
declare
  msg_id_type regtype;
  rec_col_type regtype;
begin
  -- Determine dms_messages.id type to mirror it for message_id
  select a.atttypid::regtype into msg_id_type
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'dms_messages'
    and a.attname = 'id'
    and a.attnum > 0
    and not a.attisdropped;
  if msg_id_type is null then
    msg_id_type := 'bigint'::regtype;
  end if;

  -- Create table if missing (use detected type)
  if to_regclass('public.dms_message_receipts') is null then
    execute format($fmt$create table public.dms_message_receipts (
      message_id %s not null,
      user_id uuid not null references auth.users(id) on delete cascade,
      status text not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key (message_id, user_id)
    )$fmt$, msg_id_type::text);
  end if;

  -- Ensure message_id column exists with correct type if absent
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='dms_message_receipts' and column_name='message_id'
  ) then
    execute format('alter table public.dms_message_receipts add column message_id %s', msg_id_type::text);
  end if;

  -- Ensure user_id column
  alter table if exists public.dms_message_receipts
    add column if not exists user_id uuid;

  -- Ensure status column (handle legacy variants)
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='dms_message_receipts' and column_name='status'
  ) then
    if exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='dms_message_receipts' and column_name='state'
    ) then
      execute 'alter table public.dms_message_receipts rename column state to status';
    elsif exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='dms_message_receipts' and column_name='is_read'
    ) then
      alter table public.dms_message_receipts add column status text;
      update public.dms_message_receipts set status = case when is_read then 'read' else 'delivered' end where status is null;
      alter table public.dms_message_receipts alter column status set not null;
      alter table public.dms_message_receipts alter column status set default 'delivered';
    else
      alter table public.dms_message_receipts add column status text not null default 'delivered';
    end if;
  end if;

  -- Add check constraint if missing
  if not exists (
    select 1 from pg_constraint where conname = 'dms_message_receipts_status_check'
  ) then
    alter table public.dms_message_receipts
      add constraint dms_message_receipts_status_check check (status in ('delivered','read'));
  end if;

  -- Ensure timestamps exist
  alter table if exists public.dms_message_receipts
    add column if not exists created_at timestamptz not null default now(),
    add column if not exists updated_at timestamptz not null default now();

  -- Ensure PK on (message_id, user_id)
  if not exists (
    select 1 from pg_constraint where conname = 'dms_message_receipts_pkey'
  ) then
    -- Drop any existing single-column PK to avoid conflict
    if exists (
      select 1 from pg_constraint where conrelid = 'public.dms_message_receipts'::regclass and contype='p'
    ) then
      execute (
        select 'alter table public.dms_message_receipts drop constraint ' || quote_ident(c.conname)
        from pg_constraint c
        where c.conrelid = 'public.dms_message_receipts'::regclass and c.contype='p'
        limit 1
      );
    end if;
    alter table public.dms_message_receipts add primary key (message_id, user_id);
  end if;

  -- Helpful indexes
  execute 'create index if not exists dms_receipts_user_status_idx on public.dms_message_receipts(user_id, status, updated_at desc)';
  execute 'create index if not exists dms_receipts_message_idx on public.dms_message_receipts(message_id)';
end $$;

-- dms_blocks
create table if not exists public.dms_blocks (
  blocker uuid references auth.users(id) on delete cascade,
  blocked uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked)
);

-- Ensure columns exist if legacy names were used
alter table if exists public.dms_blocks add column if not exists blocker uuid;
alter table if exists public.dms_blocks add column if not exists blocked uuid;

-- Ensure FKs exist for blocks
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'dms_blocks_blocker_fkey'
  ) then
    alter table public.dms_blocks
      add constraint dms_blocks_blocker_fkey foreign key (blocker) references auth.users(id) on delete cascade;
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'dms_blocks_blocked_fkey'
  ) then
    alter table public.dms_blocks
      add constraint dms_blocks_blocked_fkey foreign key (blocked) references auth.users(id) on delete cascade;
  end if;
end $$;

create index if not exists dms_blocks_blocked_idx on public.dms_blocks(blocked);

-- user_settings
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  dms_privacy text not null default 'everyone' check (dms_privacy in ('everyone','followers_only','none')),
  push_enabled boolean not null default true,
  email_enabled boolean not null default false,
  mute_unknown boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Extend with notification-related fields
alter table if exists public.user_settings
  add column if not exists global_mute boolean not null default false,
  add column if not exists dnd_start time,
  add column if not exists dnd_end time,
  add column if not exists timezone text,
  add column if not exists sound_enabled boolean not null default true;

commit;

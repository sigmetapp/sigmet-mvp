-- Direct Messaging (DMS) schema
-- This migration creates: dms_threads, dms_thread_participants, dms_messages,
-- dms_message_receipts, dms_blocks, user_settings, and common indexes.

-- Note: All tables live in the public schema and reference auth.users(id).

begin;

-- Threads table: represents a conversation (1:1 or group)
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

-- Thread participants: membership and per-user state inside a thread
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

create index if not exists dms_participants_user_idx on public.dms_thread_participants(user_id);
create index if not exists dms_participants_user_thread_idx on public.dms_thread_participants(user_id, thread_id);
create index if not exists dms_participants_last_read_idx on public.dms_thread_participants(thread_id, last_read_message_id);

-- Messages: content sent within a thread
create table if not exists public.dms_messages (
  id bigserial primary key,
  thread_id bigint not null references public.dms_threads(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'text' check (kind in ('text','system')),
  body text,
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);

create index if not exists dms_messages_thread_created_idx on public.dms_messages(thread_id, created_at desc);
create index if not exists dms_messages_sender_created_idx on public.dms_messages(sender_id, created_at desc);

-- After messages exist, add optional back-reference of the last message to threads
alter table public.dms_threads
  add column if not exists last_message_id bigint;

alter table public.dms_threads
  add constraint dms_threads_last_message_fk
  foreign key (last_message_id) references public.dms_messages(id) on delete set null;

create index if not exists dms_threads_last_message_id_idx on public.dms_threads(last_message_id);

-- Message receipts: per-recipient delivery/read status
create table if not exists public.dms_message_receipts (
  message_id bigint not null references public.dms_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('delivered','read')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create index if not exists dms_receipts_user_status_idx on public.dms_message_receipts(user_id, status, updated_at desc);
create index if not exists dms_receipts_message_idx on public.dms_message_receipts(message_id);

-- Blocks: prevents unwanted DMs
create table if not exists public.dms_blocks (
  blocker uuid not null references auth.users(id) on delete cascade,
  blocked uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked)
);

create index if not exists dms_blocks_blocked_idx on public.dms_blocks(blocked);

-- Per-user DM settings
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  dms_privacy text not null default 'everyone' check (dms_privacy in ('everyone','followers_only','none')),
  push_enabled boolean not null default true,
  email_enabled boolean not null default false,
  mute_unknown boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

commit;

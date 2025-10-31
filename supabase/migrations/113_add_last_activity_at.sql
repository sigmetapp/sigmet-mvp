-- Add last_activity_at column to profiles table for online status tracking
begin;

alter table if exists public.profiles
  add column if not exists last_activity_at timestamptz default now();

comment on column public.profiles.last_activity_at is 'Timestamp of last user activity. Used to determine online status based on activity within last 5 minutes and authentication status.';

-- Create index for efficient queries
create index if not exists profiles_last_activity_at_idx on public.profiles(last_activity_at desc);

commit;

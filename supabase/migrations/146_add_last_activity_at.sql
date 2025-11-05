-- Add last_activity_at column to profiles table for 5-minute online status tracking
begin;

alter table if exists public.profiles
  add column if not exists last_activity_at timestamptz default now();

comment on column public.profiles.last_activity_at is 'Timestamp of the last user activity. Used to show online status for 5 minutes after any activity.';

-- Create index for efficient queries
create index if not exists profiles_last_activity_at_idx on public.profiles(last_activity_at desc);

-- Function to update last_activity_at for a user
create or replace function public.update_user_activity(p_user_id uuid)
returns void as $$
begin
  update public.profiles
  set last_activity_at = now()
  where user_id = p_user_id;
end;
$$ language plpgsql security definer;

comment on function public.update_user_activity(uuid) is 'Updates the last_activity_at timestamp for a user. Call this whenever user performs any activity (login, page view, click, etc.)';

commit;

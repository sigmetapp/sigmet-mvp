-- Badges system: user badges and display preferences
begin;

-- Badge types table
create table if not exists public.badge_types (
  id text primary key,
  name text not null,
  emoji text not null,
  description text not null,
  requirement_description text not null,
  sort_order int not null default 0
);

-- Insert the 5 badge types
insert into public.badge_types (id, name, emoji, description, requirement_description, sort_order) values
  ('first_step', 'First Step', '🕊️', 'Earned for registration and profile completion.', 'Register and complete your profile fully.', 1),
  ('active_spark', 'Active Spark', '🔥', 'Earned for first week of activity (post, comment, or interaction).', 'Be active for your first week: post, comment, or interact.', 2),
  ('connector', 'Connector', '💬', 'Earned for first 3 invited friends or first mutual follows.', 'Invite 3 friends or establish mutual follows.', 3),
  ('growth_seeker', 'Growth Seeker', '🌱', 'Earned for selecting 3 growth directions in profile.', 'Choose 3 growth directions from the 12 SW-directions.', 4),
  ('consistency', 'Consistency', '🧭', 'Earned for 7 consecutive days of activity.', 'Be active for 7 days in a row (any action: post, progress mark, comment).', 5)
on conflict (id) do update set
  name = excluded.name,
  emoji = excluded.emoji,
  description = excluded.description,
  requirement_description = excluded.requirement_description,
  sort_order = excluded.sort_order;

-- User badges: tracks which badges a user has earned
create table if not exists public.user_badges (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  badge_id text not null references public.badge_types(id) on delete cascade,
  earned_at timestamptz default now(),
  unique (user_id, badge_id)
);

create index if not exists user_badges_user_id_idx on public.user_badges(user_id);
create index if not exists user_badges_badge_id_idx on public.user_badges(badge_id);

-- Badge display preferences: which badges to show on profile
create table if not exists public.badge_display_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  displayed_badges text[] default '{}'::text[],
  updated_at timestamptz default now()
);

-- RLS policies
alter table public.badge_types enable row level security;
alter table public.user_badges enable row level security;
alter table public.badge_display_preferences enable row level security;

-- Anyone can read badge types
create policy if not exists "read badge_types" on public.badge_types for select using (true);

-- Users can read their own badges and badges of others
create policy if not exists "read user_badges" on public.user_badges for select using (true);

-- Users can only insert their own badges (awarded by system)
create policy if not exists "insert own badges" on public.user_badges for insert 
  with check (auth.uid() = user_id);

-- Users can read display preferences
create policy if not exists "read badge_display_preferences" on public.badge_display_preferences for select using (true);

-- Users can update their own display preferences
create policy if not exists "update own badge_display_preferences" on public.badge_display_preferences 
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Users can insert their own display preferences
create policy if not exists "insert own badge_display_preferences" on public.badge_display_preferences 
  for insert with check (auth.uid() = user_id);

commit;

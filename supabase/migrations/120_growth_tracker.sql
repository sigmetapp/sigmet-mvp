-- Growth Tracker: 12 areas of growth with habits and goals
begin;

-- Directions catalog
create table if not exists public.growth_directions (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  emoji text not null,
  sort_index int not null default 0,
  created_at timestamptz not null default now()
);

-- Task catalog linked to direction
-- task_type: 'habit' or 'goal'
-- period: 'daily' | 'weekly' | 'monthly' (nullable for goals)
create type public.task_type as enum ('habit','goal');
create type public.habit_period as enum ('daily','weekly','monthly');

create table if not exists public.growth_tasks (
  id uuid primary key default gen_random_uuid(),
  direction_id uuid not null references public.growth_directions(id) on delete cascade,
  task_type public.task_type not null,
  period public.habit_period null,
  title text not null,
  description text not null,
  base_points int not null default 5, -- per check for habit, one-time for goal
  sort_index int not null default 0,
  created_at timestamptz not null default now()
);

-- User picks main directions
create table if not exists public.user_selected_directions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null, -- references auth.users(id)
  direction_id uuid not null references public.growth_directions(id) on delete cascade,
  is_primary boolean not null default true,
  created_at timestamptz not null default now(),
  unique(user_id, direction_id)
);

-- User activates tasks from catalog
-- status: 'active' | 'completed' | 'archived'
create type public.task_status as enum ('active','completed','archived');

create table if not exists public.user_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  task_id uuid not null references public.growth_tasks(id) on delete cascade,
  status public.task_status not null default 'active',
  started_at timestamptz not null default now(),
  completed_at timestamptz null,
  -- streak and counters for habits
  current_streak int not null default 0,
  longest_streak int not null default 0,
  total_checkins int not null default 0,
  unique(user_id, task_id)
);

-- Check-ins for habits
create table if not exists public.habit_checkins (
  id uuid primary key default gen_random_uuid(),
  user_task_id uuid not null references public.user_tasks(id) on delete cascade,
  user_id uuid not null,
  checked_at timestamptz not null default now(),
  points_awarded int not null default 0
);

-- Achievements for one-time goals
create table if not exists public.user_achievements (
  id uuid primary key default gen_random_uuid(),
  user_task_id uuid not null references public.user_tasks(id) on delete cascade,
  user_id uuid not null,
  completed_at timestamptz not null default now(),
  points_awarded int not null default 0,
  proof_url text null, -- optional evidence link
  note text null
);

-- SW points ledger for transparency
-- reason: 'habit_checkin' | 'streak_bonus' | 'goal_complete' | 'admin_adjust'
create type public.sw_reason as enum ('habit_checkin','streak_bonus','goal_complete','admin_adjust');

create table if not exists public.sw_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  direction_id uuid not null references public.growth_directions(id),
  user_task_id uuid null references public.user_tasks(id) on delete set null,
  reason public.sw_reason not null,
  points int not null,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- Indexes for performance
create index if not exists growth_tasks_direction_id_idx on public.growth_tasks(direction_id);
create index if not exists user_selected_directions_user_id_idx on public.user_selected_directions(user_id);
create index if not exists user_selected_directions_direction_id_idx on public.user_selected_directions(direction_id);
create index if not exists user_tasks_user_id_idx on public.user_tasks(user_id);
create index if not exists user_tasks_task_id_idx on public.user_tasks(task_id);
create index if not exists habit_checkins_user_task_id_idx on public.habit_checkins(user_task_id);
create index if not exists habit_checkins_user_id_idx on public.habit_checkins(user_id);
create index if not exists habit_checkins_checked_at_idx on public.habit_checkins(checked_at);
create index if not exists user_achievements_user_task_id_idx on public.user_achievements(user_task_id);
create index if not exists user_achievements_user_id_idx on public.user_achievements(user_id);
create index if not exists sw_ledger_user_id_idx on public.sw_ledger(user_id);
create index if not exists sw_ledger_direction_id_idx on public.sw_ledger(direction_id);
create index if not exists sw_ledger_created_at_idx on public.sw_ledger(created_at desc);

-- RLS policies
alter table public.user_selected_directions enable row level security;
alter table public.user_tasks enable row level security;
alter table public.habit_checkins enable row level security;
alter table public.user_achievements enable row level security;
alter table public.sw_ledger enable row level security;

-- Policies assume auth.uid()
create policy "select own directions" on public.user_selected_directions for select using (user_id = auth.uid());
create policy "insert own directions" on public.user_selected_directions for insert with check (user_id = auth.uid());
create policy "delete own directions" on public.user_selected_directions for delete using (user_id = auth.uid());

create policy "select own tasks" on public.user_tasks for select using (user_id = auth.uid());
create policy "insert own tasks" on public.user_tasks for insert with check (user_id = auth.uid());
create policy "update own tasks" on public.user_tasks for update using (user_id = auth.uid());
create policy "delete own tasks" on public.user_tasks for delete using (user_id = auth.uid());

create policy "select own checkins" on public.habit_checkins for select using (user_id = auth.uid());
create policy "insert own checkins" on public.habit_checkins for insert with check (user_id = auth.uid());

create policy "select own achievements" on public.user_achievements for select using (user_id = auth.uid());
create policy "insert own achievements" on public.user_achievements for insert with check (user_id = auth.uid());

create policy "select own ledger" on public.sw_ledger for select using (user_id = auth.uid());
create policy "insert own ledger" on public.sw_ledger for insert with check (user_id = auth.uid());

commit;

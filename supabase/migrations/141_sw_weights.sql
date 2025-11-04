-- SW Weights: Configuration table for Social Weight calculation formula
begin;

-- Table to store weights for SW calculation
create table if not exists public.sw_weights (
  id int primary key default 1,
  registration_points int not null default 50,
  profile_complete_points int not null default 20,
  growth_total_points_multiplier int not null default 1, -- Multiplier for growth total points
  follower_points int not null default 5,
  connection_first_points int not null default 100,
  connection_repeat_points int not null default 40,
  post_points int not null default 20,
  comment_points int not null default 10,
  reaction_points int not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  constraint sw_weights_singleton check (id = 1)
);

-- Insert default weights if not exists
insert into public.sw_weights (
  id,
  registration_points,
  profile_complete_points,
  growth_total_points_multiplier,
  follower_points,
  connection_first_points,
  connection_repeat_points,
  post_points,
  comment_points,
  reaction_points
) values (
  1,
  50,   -- registration
  20,   -- profile complete
  1,    -- growth total points multiplier
  5,    -- follower
  100,  -- connection first
  40,   -- connection repeat
  20,   -- post
  10,   -- comment
  1     -- reaction
) on conflict (id) do nothing;

-- Enable RLS
alter table public.sw_weights enable row level security;

-- Anyone can read weights
create policy "read sw_weights" on public.sw_weights
  for select using (true);

-- Only service role can update (via API)
create policy "service role only writes" on public.sw_weights
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

commit;

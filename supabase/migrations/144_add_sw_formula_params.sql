begin;

-- Add inflation parameters to sw_weights
alter table public.sw_weights
  add column if not exists daily_inflation_rate numeric default 0.001; -- 0.1% per day

alter table public.sw_weights
  add column if not exists user_growth_inflation_rate numeric default 0.0001; -- 0.01% per 100 users

alter table public.sw_weights
  add column if not exists min_inflation_rate numeric default 0.5; -- Minimum 50% value

-- Add invite points
alter table public.sw_weights
  add column if not exists invite_points int default 50; -- Points per invite

-- Add growth bonus percentage
alter table public.sw_weights
  add column if not exists growth_bonus_percentage numeric default 0.05; -- 5% bonus

-- Add cache duration in minutes
alter table public.sw_weights
  add column if not exists cache_duration_minutes int default 5; -- Cache duration in minutes

-- Add SW levels configuration (JSONB)
alter table public.sw_weights
  add column if not exists sw_levels jsonb default '[
    {"name": "Beginner", "minSW": 0, "maxSW": 100},
    {"name": "Active", "minSW": 100, "maxSW": 500},
    {"name": "Influencer", "minSW": 500, "maxSW": 2000},
    {"name": "Expert", "minSW": 2000, "maxSW": 10000},
    {"name": "Legend", "minSW": 10000}
  ]'::jsonb;

-- Update existing row with default values if columns are null
update public.sw_weights
set 
  daily_inflation_rate = 0.001,
  user_growth_inflation_rate = 0.0001,
  min_inflation_rate = 0.5,
  invite_points = 50,
  growth_bonus_percentage = 0.05,
  cache_duration_minutes = 5,
  sw_levels = '[
    {"name": "Beginner", "minSW": 0, "maxSW": 100},
    {"name": "Active", "minSW": 100, "maxSW": 500},
    {"name": "Influencer", "minSW": 500, "maxSW": 2000},
    {"name": "Expert", "minSW": 2000, "maxSW": 10000},
    {"name": "Legend", "minSW": 10000}
  ]'::jsonb
where id = 1
  and (
    daily_inflation_rate is null or
    user_growth_inflation_rate is null or
    min_inflation_rate is null or
    invite_points is null or
    growth_bonus_percentage is null or
    cache_duration_minutes is null or
    sw_levels is null
  );

commit;

begin;

-- Ensure sw_scores table exists with all required columns
create table if not exists public.sw_scores (
  user_id uuid primary key references auth.users(id) on delete cascade,
  total int not null default 0,
  last_updated timestamptz default now()
);

-- Add breakdown column to sw_scores for caching
alter table public.sw_scores
  add column if not exists breakdown jsonb default null;

-- Add inflation_rate column for tracking inflation
alter table public.sw_scores
  add column if not exists inflation_rate numeric default 1.0;

-- Add inflation_last_updated for tracking inflation calculation
alter table public.sw_scores
  add column if not exists inflation_last_updated timestamptz default null;

-- Ensure last_updated column exists (in case table was created without it)
alter table public.sw_scores
  add column if not exists last_updated timestamptz default now();

-- Create index for faster cache lookups (only if column exists)
create index if not exists sw_scores_last_updated_idx on public.sw_scores(last_updated);

commit;

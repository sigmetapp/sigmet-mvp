begin;

-- Add breakdown column to sw_scores for caching
alter table public.sw_scores
  add column if not exists breakdown jsonb default null;

-- Add inflation_rate column for tracking inflation
alter table public.sw_scores
  add column if not exists inflation_rate numeric default 1.0;

-- Add inflation_last_updated for tracking inflation calculation
alter table public.sw_scores
  add column if not exists inflation_last_updated timestamptz default null;

-- Create index for faster cache lookups
create index if not exists sw_scores_last_updated_idx on public.sw_scores(last_updated);

commit;

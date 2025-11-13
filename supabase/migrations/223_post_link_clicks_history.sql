begin;

-- Create table to track post link clicks by day
create table if not exists public.post_link_clicks_history (
  id bigserial primary key,
  post_id bigint not null references public.posts(id) on delete cascade,
  click_date date not null default current_date,
  click_count int not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (post_id, click_date)
);

-- Create index for efficient queries
create index if not exists post_link_clicks_history_post_date_idx on public.post_link_clicks_history(post_id, click_date desc);

-- Enable RLS
alter table public.post_link_clicks_history enable row level security;

-- Anyone can read link click history (public data)
create policy "read post_link_clicks_history" on public.post_link_clicks_history for select using (true);

-- Function to increment link click count for a specific post and date
create or replace function public.increment_post_link_click_history(p_post_id bigint, p_date date default current_date)
returns void as $$
begin
  insert into public.post_link_clicks_history (post_id, click_date, click_count)
  values (p_post_id, p_date, 1)
  on conflict (post_id, click_date)
  do update set
    click_count = post_link_clicks_history.click_count + 1,
    updated_at = now();
end;
$$ language plpgsql security definer;

-- Function to get link clicks for last 7 days
create or replace function public.get_post_link_clicks_last_7_days(p_post_id bigint)
returns table (
  click_date date,
  click_count int
) as $$
begin
  return query
  with date_range as (
    select generate_series(
      current_date - interval '6 days',
      current_date,
      interval '1 day'
    )::date as date
  )
  select
    dr.date as click_date,
    coalesce(plch.click_count, 0)::int as click_count
  from date_range dr
  left join public.post_link_clicks_history plch
    on plch.post_id = p_post_id
    and plch.click_date = dr.date
  order by dr.date asc;
end;
$$ language plpgsql security definer;

-- Add link_clicks column to posts table for quick access
alter table public.posts add column if not exists link_clicks int not null default 0;

-- Create index for link_clicks
create index if not exists posts_link_clicks_idx on public.posts(link_clicks desc);

-- Function to increment link_clicks counter in posts table
create or replace function public.increment_post_link_clicks(p_post_id bigint)
returns void as $$
begin
  update public.posts
  set link_clicks = coalesce(link_clicks, 0) + 1
  where id = p_post_id;
end;
$$ language plpgsql security definer;

commit;

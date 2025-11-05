begin;

-- Create table to track post views by day
create table if not exists public.post_views_history (
  id bigserial primary key,
  post_id bigint not null references public.posts(id) on delete cascade,
  view_date date not null default current_date,
  view_count int not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (post_id, view_date)
);

-- Create index for efficient queries
create index if not exists post_views_history_post_date_idx on public.post_views_history(post_id, view_date desc);

-- Enable RLS
alter table public.post_views_history enable row level security;

-- Anyone can read view history (public data)
create policy "read post_views_history" on public.post_views_history for select using (true);

-- Function to increment view count for a specific post and date
create or replace function public.increment_post_view_history(p_post_id bigint, p_date date default current_date)
returns void as $$
begin
  insert into public.post_views_history (post_id, view_date, view_count)
  values (p_post_id, p_date, 1)
  on conflict (post_id, view_date)
  do update set
    view_count = post_views_history.view_count + 1,
    updated_at = now();
end;
$$ language plpgsql security definer;

-- Function to get views for last 7 days
create or replace function public.get_post_views_last_7_days(p_post_id bigint)
returns table (
  view_date date,
  view_count int
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
    dr.date as view_date,
    coalesce(pvh.view_count, 0)::int as view_count
  from date_range dr
  left join public.post_views_history pvh
    on pvh.post_id = p_post_id
    and pvh.view_date = dr.date
  order by dr.date asc;
end;
$$ language plpgsql security definer;

commit;

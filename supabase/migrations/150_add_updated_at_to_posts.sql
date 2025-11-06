-- Add updated_at column to posts table if it doesn't exist
begin;

alter table if exists public.posts
  add column if not exists updated_at timestamptz default now();

-- Create trigger to automatically update updated_at on post updates
create or replace function update_posts_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists posts_updated_at_trigger on public.posts;
create trigger posts_updated_at_trigger
  before update on public.posts
  for each row
  execute function update_posts_updated_at();

commit;

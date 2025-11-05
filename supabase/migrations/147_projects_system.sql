-- Projects system: admin project management
begin;

-- Projects table
create table if not exists public.projects (
  id bigserial primary key,
  title text not null,
  description text not null,
  author_id uuid references auth.users(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'inactive', 'pending')),
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index if not exists projects_author_idx on public.projects(author_id);
create index if not exists projects_status_idx on public.projects(status);
create index if not exists projects_created_idx on public.projects(created_at desc);

-- RLS policies
alter table public.projects enable row level security;

-- Only admins can view projects
create policy "Admins can view all projects"
  on public.projects
  for select
  to authenticated
  using (public.is_admin());

-- Only admins can insert projects
create policy "Admins can insert projects"
  on public.projects
  for insert
  to authenticated
  with check (public.is_admin());

-- Only admins can update projects
create policy "Admins can update all projects"
  on public.projects
  for update
  to authenticated
  using (public.is_admin());

-- Only admins can delete projects
create policy "Admins can delete all projects"
  on public.projects
  for delete
  to authenticated
  using (public.is_admin());

-- Function to update updated_at timestamp
create or replace function update_projects_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger projects_updated_at
  before update on public.projects
  for each row
  execute function update_projects_updated_at();

commit;
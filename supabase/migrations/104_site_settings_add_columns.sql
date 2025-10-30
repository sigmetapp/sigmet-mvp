begin;

-- Ensure site_settings table exists with singleton row pattern
create table if not exists public.site_settings (
  id int primary key default 1,
  site_name text,
  logo_url text,
  invites_only boolean not null default false,
  allowed_continents text[] not null default '{}'::text[],
  updated_by uuid references auth.users(id),
  updated_at timestamptz default now(),
  constraint site_settings_singleton check (id = 1)
);

-- Add any missing columns in existing deployments
alter table if exists public.site_settings
  add column if not exists site_name text,
  add column if not exists logo_url text,
  add column if not exists invites_only boolean not null default false,
  add column if not exists allowed_continents text[] not null default '{}'::text[],
  add column if not exists updated_by uuid references auth.users(id),
  add column if not exists updated_at timestamptz default now();

-- RLS and policies
alter table if exists public.site_settings enable row level security;
create policy if not exists "read site_settings" on public.site_settings for select using (true);
create policy if not exists "update site_settings_via_service" on public.site_settings for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- Ensure a singleton row exists
insert into public.site_settings(id) values (1)
on conflict (id) do nothing;

commit;

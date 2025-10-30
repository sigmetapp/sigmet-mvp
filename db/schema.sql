-- Supabase SQL schema v1 for Sigmet MVP

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- username is optional at creation; enforce uniqueness only when set
  username text,
  full_name text,
  bio text,
  country text,
  avatar_url text,
  website_url text,
  directions_selected text[] default '{}'::text[],
  created_at timestamptz default now()
);

-- Ensure legacy deployments relax strict constraints that break signup
-- Drop NOT NULL and table-level UNIQUE (if previously created)
alter table if exists public.profiles alter column username drop not null;
alter table if exists public.profiles drop constraint if exists profiles_username_key;

-- Enforce uniqueness only for non-empty usernames
create unique index if not exists profiles_username_unique_nonempty
  on public.profiles (username)
  where username is not null and username <> '';

create table if not exists public.directions (
  id text primary key,
  title text not null,
  sort int not null
);

insert into public.directions(id, title, sort) values
('health','Health',1),('career','Career',2),('learning','Learning',3),
('finance','Finance',4),('family','Family',5),('community','Community',6),
('mindfulness','Mindfulness',7),('creativity','Creativity',8),
('sport','Sport',9),('travel','Travel',10),('ethics','Ethics',11),
('digital','Digital Hygiene',12)
on conflict (id) do nothing;

create table if not exists public.posts (
  id bigserial primary key,
  author_id uuid not null references auth.users(id) on delete cascade,
  text text,
  media_urls text[] default '{}'::text[],
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists posts_author_created_idx on public.posts(author_id, created_at desc);

create table if not exists public.post_reactions (
  post_id bigint references public.posts(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  kind text check (kind in ('like')),
  created_at timestamptz default now(),
  primary key (post_id, user_id)
);

create table if not exists public.comments (
  id bigserial primary key,
  post_id bigint not null references public.posts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  created_at timestamptz default now()
);

create table if not exists public.dm_threads (
  id bigserial primary key,
  a uuid not null references auth.users(id) on delete cascade,
  b uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  unique (a, b)
);

create table if not exists public.dm_messages (
  id bigserial primary key,
  thread_id bigint not null references public.dm_threads(id) on delete cascade,
  sender uuid not null references auth.users(id) on delete cascade,
  text text,
  media_urls text[] default '{}'::text[],
  created_at timestamptz default now()
);

create table if not exists public.invites (
  code text primary key,
  creator uuid not null references auth.users(id) on delete cascade,
  max_uses int not null default 5,
  uses int not null default 0,
  created_at timestamptz default now()
);

create table if not exists public.sw_events (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  value int not null default 1,
  meta jsonb,
  created_at timestamptz default now()
);

create table if not exists public.sw_scores (
  user_id uuid primary key references auth.users(id) on delete cascade,
  total int not null default 0,
  last_updated timestamptz default now()
);

alter table public.profiles enable row level security;
create policy if not exists "read profiles" on public.profiles for select using (true);
create policy if not exists "own profile" on public.profiles for update using (auth.uid() = user_id);
create policy if not exists "insert own profile" on public.profiles for insert with check (auth.uid() = user_id);

-- Site-wide settings (single-row table)
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

alter table public.site_settings enable row level security;
-- Anyone can read settings
create policy if not exists "read site_settings" on public.site_settings for select using (true);
-- Updates typically happen via service role in server API; allow authenticated users noop by default
create policy if not exists "update site_settings_via_service" on public.site_settings for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

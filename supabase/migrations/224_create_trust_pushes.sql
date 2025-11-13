-- Trust Flow pushes table
-- This table stores positive and negative trust pushes from users to other users
create table if not exists public.trust_pushes (
  id bigserial primary key,
  from_user_id uuid not null references auth.users(id) on delete cascade,
  to_user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('positive', 'negative')),
  reason text,
  context_type text check (context_type in ('post', 'comment', 'profile')),
  context_id text,
  device_hash text,
  session_id text,
  ip_hash text,
  user_agent text,
  created_at timestamptz default now(),
  constraint trust_pushes_no_self_push check (from_user_id != to_user_id)
);

-- Indexes for efficient queries
create index if not exists trust_pushes_to_user_created_idx on public.trust_pushes(to_user_id, created_at desc);
create index if not exists trust_pushes_from_user_idx on public.trust_pushes(from_user_id);
create index if not exists trust_pushes_from_to_idx on public.trust_pushes(from_user_id, to_user_id, created_at desc);
create index if not exists trust_pushes_type_idx on public.trust_pushes(type);

-- RLS policies
alter table public.trust_pushes enable row level security;

-- Anyone can read trust pushes (for calculation)
drop policy if exists "read trust_pushes" on public.trust_pushes;
create policy "read trust_pushes" on public.trust_pushes for select using (true);

-- Users can insert their own pushes (but not to themselves - enforced by constraint)
drop policy if exists "insert trust_pushes" on public.trust_pushes;
create policy "insert trust_pushes" on public.trust_pushes for insert 
  with check (auth.uid() is not null and auth.uid() = from_user_id and auth.uid() != to_user_id);

-- Function to get repeat count (how many times from_user_id has pushed to_user_id)
create or replace function public.get_trust_push_repeat_count(
  p_from_user_id uuid,
  p_to_user_id uuid
) returns bigint as $$
  select count(*)::bigint
  from public.trust_pushes
  where from_user_id = p_from_user_id
    and to_user_id = p_to_user_id;
$$ language sql stable;

-- Function to count pushes in the last month from one user to another
create or replace function public.get_trust_pushes_count_last_month(
  p_from_user_id uuid,
  p_to_user_id uuid
) returns bigint as $$
  select count(*)::bigint
  from public.trust_pushes
  where from_user_id = p_from_user_id
    and to_user_id = p_to_user_id
    and created_at >= now() - interval '1 month';
$$ language sql stable;

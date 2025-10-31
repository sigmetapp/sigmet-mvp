-- Trust Flow tables and policies
create table if not exists public.trust_feedback (
  id bigserial primary key,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  value int not null check (value in (-1, 1)),
  comment text,
  created_at timestamptz default now()
);

create index if not exists trust_feedback_target_created_idx on public.trust_feedback(target_user_id, created_at desc);

alter table public.trust_feedback enable row level security;
drop policy if exists "read trust_feedback" on public.trust_feedback;
create policy "read trust_feedback" on public.trust_feedback for select using (true);
drop policy if exists "insert trust_feedback" on public.trust_feedback;
-- Prevent users from giving feedback to themselves
create policy "insert trust_feedback" on public.trust_feedback for insert 
  with check (auth.uid() is not null and auth.uid() != target_user_id);

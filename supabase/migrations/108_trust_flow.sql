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
create policy if not exists "read trust_feedback" on public.trust_feedback for select using (true);
create policy if not exists "insert trust_feedback" on public.trust_feedback for insert with check (auth.uid() is not null);

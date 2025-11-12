-- Create goal_reactions table for user goals
-- Goals are stored in profiles.goals as JSONB array, so we'll use a composite key
-- We'll store goal_id (from the JSONB array) and user_id (profile owner)
create table if not exists public.goal_reactions (
  goal_user_id uuid not null references auth.users(id) on delete cascade,
  goal_id text not null,
  user_id uuid references auth.users(id) on delete cascade,
  kind text not null default 'inspire',
  created_at timestamptz default now(),
  primary key (goal_user_id, goal_id, user_id, kind)
);

-- Add check constraint for reaction types (same as post_reactions, but only inspire for now)
do $$
begin
  if not exists (
    select 1 from pg_constraint 
    where conname = 'goal_reactions_kind_check'
  ) then
    alter table public.goal_reactions
      add constraint goal_reactions_kind_check
      check (kind in (
        'inspire',
        'respect',
        'relate',
        'support',
        'celebrate'
      ));
  end if;
end $$;

-- Create indexes for better query performance
create index if not exists goal_reactions_goal_user_id_idx on public.goal_reactions(goal_user_id);
create index if not exists goal_reactions_goal_id_idx on public.goal_reactions(goal_id);
create index if not exists goal_reactions_user_id_idx on public.goal_reactions(user_id);

-- Enable RLS
alter table public.goal_reactions enable row level security;

-- RLS policies
drop policy if exists "read goal_reactions" on public.goal_reactions;
create policy "read goal_reactions" on public.goal_reactions for select using (true);

drop policy if exists "insert own goal_reactions" on public.goal_reactions;
create policy "insert own goal_reactions" on public.goal_reactions for insert with check (auth.uid() = user_id);

drop policy if exists "delete own goal_reactions" on public.goal_reactions;
create policy "delete own goal_reactions" on public.goal_reactions for delete using (auth.uid() = user_id);

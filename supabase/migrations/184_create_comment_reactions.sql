-- Create comment_reactions table if it doesn't exist
-- Note: comments.id is uuid type (as per migration 131)
create table if not exists public.comment_reactions (
  comment_id uuid references public.comments(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  kind text not null,
  created_at timestamptz default now(),
  primary key (comment_id, user_id, kind)
);

-- Add check constraint for reaction types (same as post_reactions)
do $$
begin
  if not exists (
    select 1 from pg_constraint 
    where conname = 'comment_reactions_kind_check'
  ) then
    alter table public.comment_reactions
      add constraint comment_reactions_kind_check
      check (kind in (
        'like',
        'growth',
        'value',
        'with_you',
        'proud',
        'grateful',
        'drained',
        'inspire',
        'respect',
        'relate',
        'support',
        'celebrate'
      ));
  end if;
end $$;

-- Create indexes for better query performance
create index if not exists comment_reactions_comment_id_idx on public.comment_reactions(comment_id);
create index if not exists comment_reactions_user_id_idx on public.comment_reactions(user_id);

-- Enable RLS
alter table public.comment_reactions enable row level security;

-- RLS policies
drop policy if exists "read comment_reactions" on public.comment_reactions;
create policy "read comment_reactions" on public.comment_reactions for select using (true);

drop policy if exists "insert own comment_reactions" on public.comment_reactions;
create policy "insert own comment_reactions" on public.comment_reactions for insert with check (auth.uid() = user_id);

drop policy if exists "delete own comment_reactions" on public.comment_reactions;
create policy "delete own comment_reactions" on public.comment_reactions for delete using (auth.uid() = user_id);

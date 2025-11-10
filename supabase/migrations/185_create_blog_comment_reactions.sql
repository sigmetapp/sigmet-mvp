-- Create blog_comment_reactions table if it doesn't exist
create table if not exists public.blog_comment_reactions (
  comment_id bigint references public.blog_comments(id) on delete cascade,
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
    where conname = 'blog_comment_reactions_kind_check'
  ) then
    alter table public.blog_comment_reactions
      add constraint blog_comment_reactions_kind_check
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
create index if not exists blog_comment_reactions_comment_id_idx on public.blog_comment_reactions(comment_id);
create index if not exists blog_comment_reactions_user_id_idx on public.blog_comment_reactions(user_id);

-- Enable RLS
alter table public.blog_comment_reactions enable row level security;

-- RLS policies
drop policy if exists "read blog_comment_reactions" on public.blog_comment_reactions;
create policy "read blog_comment_reactions" on public.blog_comment_reactions for select using (true);

drop policy if exists "insert own blog_comment_reactions" on public.blog_comment_reactions;
create policy "insert own blog_comment_reactions" on public.blog_comment_reactions for insert with check (auth.uid() = user_id);

drop policy if exists "delete own blog_comment_reactions" on public.blog_comment_reactions;
create policy "delete own blog_comment_reactions" on public.blog_comment_reactions for delete using (auth.uid() = user_id);

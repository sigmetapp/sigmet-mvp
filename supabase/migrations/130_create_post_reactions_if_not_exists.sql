-- Create post_reactions table if it doesn't exist
create table if not exists public.post_reactions (
  post_id bigint references public.posts(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  kind text not null,
  created_at timestamptz default now(),
  primary key (post_id, user_id, kind)
);

-- Add check constraint for reaction types
do $$
begin
  if not exists (
    select 1 from pg_constraint 
    where conname = 'post_reactions_kind_check'
  ) then
    alter table public.post_reactions
      add constraint post_reactions_kind_check
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

-- Create index for better query performance
create index if not exists post_reactions_post_id_idx on public.post_reactions(post_id);
create index if not exists post_reactions_user_id_idx on public.post_reactions(user_id);

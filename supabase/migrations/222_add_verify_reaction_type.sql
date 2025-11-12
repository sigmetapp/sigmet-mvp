-- Add 'verify' reaction type to post_reactions, comment_reactions, and blog_post_reactions

-- Update post_reactions
alter table if exists public.post_reactions
  drop constraint if exists post_reactions_kind_check;

alter table if exists public.post_reactions
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
    'celebrate',
    'verify'
  ));

-- Update comment_reactions
alter table if exists public.comment_reactions
  drop constraint if exists comment_reactions_kind_check;

alter table if exists public.comment_reactions
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
    'celebrate',
    'verify'
  ));

-- Update blog_post_reactions if it exists
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'blog_post_reactions') then
    alter table if exists public.blog_post_reactions
      drop constraint if exists blog_post_reactions_kind_check;

    alter table if exists public.blog_post_reactions
      add constraint blog_post_reactions_kind_check
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
        'celebrate',
        'verify'
      ));
  end if;
end $$;

-- Update blog_comment_reactions if it exists
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'blog_comment_reactions') then
    alter table if exists public.blog_comment_reactions
      drop constraint if exists blog_comment_reactions_kind_check;

    alter table if exists public.blog_comment_reactions
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
        'celebrate',
        'verify'
      ));
  end if;
end $$;

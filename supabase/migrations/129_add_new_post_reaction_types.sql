-- Add new reaction types for posts
-- Update post_reactions to support new reaction types: inspire, respect, relate, support, celebrate

alter table if exists public.post_reactions
  drop constraint if exists post_reactions_kind_check;

-- Add new check constraint that includes all reaction types (old + new)
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
    'celebrate'
  ));
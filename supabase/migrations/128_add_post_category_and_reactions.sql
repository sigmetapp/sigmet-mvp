-- Add category column to posts table
alter table if exists public.posts
  add column if not exists category text;

-- Update post_reactions to support new reaction types
-- First, drop the existing check constraint if it exists
alter table if exists public.post_reactions
  drop constraint if exists post_reactions_kind_check;

-- Drop existing primary key if it doesn't include kind
alter table if exists public.post_reactions
  drop constraint if exists post_reactions_pkey;

-- Add new check constraint that includes all reaction types
alter table if exists public.post_reactions
  add constraint post_reactions_kind_check
  check (kind in ('like', 'growth', 'value', 'with_you', 'proud', 'grateful', 'drained'));

-- Add new primary key that includes kind to allow multiple reactions per user per post
alter table if exists public.post_reactions
  add constraint post_reactions_pkey
  primary key (post_id, user_id, kind);

-- Add index on category for better query performance
create index if not exists posts_category_idx on public.posts(category);

-- Add media_url and parent_id columns to comments table
-- This migration adds support for media attachments and threaded comments

-- Add media_url column for storing media attachments (images/videos)
alter table if exists public.comments
  add column if not exists media_url text;

-- Add parent_id column for threaded/reply comments
alter table if exists public.comments
  add column if not exists parent_id bigint references public.comments(id) on delete cascade;

-- Create index on parent_id for faster querying of comment threads
create index if not exists comments_parent_id_idx on public.comments(parent_id);

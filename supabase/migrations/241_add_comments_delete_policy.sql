-- Add RLS policies for comments table
-- This allows users to read, update, and delete their own comments

-- First, enable RLS if not already enabled
alter table if exists public.comments enable row level security;

-- Drop existing policies if they exist
drop policy if exists "Anyone can view comments" on public.comments;
drop policy if exists "Users can update own comments" on public.comments;
drop policy if exists "Users can delete own comments" on public.comments;

-- Create policy for viewing comments (anyone can view)
create policy "Anyone can view comments"
  on public.comments
  for select
  using (true);

-- Create policy for users to update their own comments
-- This checks both author_id and user_id for backward compatibility
create policy "Users can update own comments"
  on public.comments
  for update
  to authenticated
  using (
    auth.uid() = author_id 
    or auth.uid() = user_id
  )
  with check (
    auth.uid() = author_id 
    or auth.uid() = user_id
  );

-- Create policy for users to delete their own comments
-- This checks both author_id and user_id for backward compatibility
create policy "Users can delete own comments"
  on public.comments
  for delete
  to authenticated
  using (
    auth.uid() = author_id 
    or auth.uid() = user_id
  );

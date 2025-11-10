-- Add parent_id column to blog_comments for threaded replies
begin;

-- Add parent_id column if it doesn't exist
alter table public.blog_comments
  add column if not exists parent_id bigint references public.blog_comments(id) on delete cascade;

-- Create index for parent_id to improve query performance
create index if not exists blog_comments_parent_id_idx on public.blog_comments(parent_id);

commit;

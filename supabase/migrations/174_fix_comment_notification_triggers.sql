-- Fix notification triggers to handle both author_id and user_id in comments table
-- This migration makes the trigger functions dynamic to work with either column name
begin;

-- Drop existing triggers first
drop trigger if exists notify_comment_on_post_trigger on public.comments;
drop trigger if exists notify_comment_on_comment_trigger on public.comments;

-- Drop existing functions
drop function if exists public.notify_comment_on_post();
drop function if exists public.notify_comment_on_comment();

-- Trigger for comments on posts (dynamic version)
create or replace function public.notify_comment_on_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  post_author_id uuid;
  comment_author_id uuid;
  comments_author_col text;
begin
  -- Determine which column is used for comment author
  select column_name into comments_author_col
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'comments'
    and column_name in ('author_id', 'user_id')
  order by case when column_name = 'author_id' then 0 else 1 end
  limit 1;

  -- If not found, try to find any uuid column that references auth.users
  if comments_author_col is null then
    select column_name into comments_author_col
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'comments'
      and data_type = 'uuid'
      and column_name != 'id'
      and column_name != 'parent_id'
    limit 1;
  end if;

  -- Get comment author ID dynamically using jsonb to safely access the field
  if comments_author_col is not null then
    comment_author_id := (to_jsonb(new)->>comments_author_col)::uuid;
  end if;

  -- Get post author
  select author_id into post_author_id
  from public.posts
  where id = new.post_id;

  -- Don't notify if commenting on own post
  if post_author_id is not null and comment_author_id is not null and post_author_id != comment_author_id then
    perform public.create_notification(
      p_user_id := post_author_id,
      p_type := 'comment_on_post',
      p_actor_id := comment_author_id,
      p_post_id := new.post_id,
      p_comment_id := new.id::uuid
    );
  end if;

  return new;
end;
$$;

-- Trigger for replies to comments (dynamic version)
create or replace function public.notify_comment_on_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_comment_author_id uuid;
  comment_author_id uuid;
  comments_author_col text;
begin
  -- Only process if this is a reply (has parent_id)
  if new.parent_id is null then
    return new;
  end if;

  -- Determine which column is used for comment author
  select column_name into comments_author_col
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'comments'
    and column_name in ('author_id', 'user_id')
  order by case when column_name = 'author_id' then 0 else 1 end
  limit 1;

  -- If not found, try to find any uuid column that references auth.users
  if comments_author_col is null then
    select column_name into comments_author_col
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'comments'
      and data_type = 'uuid'
      and column_name != 'id'
      and column_name != 'parent_id'
    limit 1;
  end if;

  -- Get comment author ID dynamically using jsonb to safely access the field
  if comments_author_col is not null then
    comment_author_id := (to_jsonb(new)->>comments_author_col)::uuid;
  end if;

  -- Get parent comment author using dynamic column name
  if comments_author_col is not null then
    execute format('
      select %I into parent_comment_author_id
      from public.comments
      where id = $1
    ', comments_author_col) using new.parent_id;
  end if;

  -- Don't notify if replying to own comment
  if parent_comment_author_id is not null and comment_author_id is not null and parent_comment_author_id != comment_author_id then
    perform public.create_notification(
      p_user_id := parent_comment_author_id,
      p_type := 'comment_on_comment',
      p_actor_id := comment_author_id,
      p_post_id := new.post_id,
      p_comment_id := new.id::uuid
    );
  end if;

  return new;
end;
$$;

-- Recreate triggers
create trigger notify_comment_on_post_trigger
  after insert on public.comments
  for each row
  when (new.parent_id is null)
  execute function public.notify_comment_on_post();

create trigger notify_comment_on_comment_trigger
  after insert on public.comments
  for each row
  when (new.parent_id is not null)
  execute function public.notify_comment_on_comment();

commit;

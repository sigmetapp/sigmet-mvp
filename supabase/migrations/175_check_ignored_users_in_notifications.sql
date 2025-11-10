-- Add checks for ignored/blocked users in notification triggers
-- This prevents notifications from being created when the post author has blocked the actor
begin;

-- Update trigger for comments on posts to check if post author has blocked the commenter
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
  is_blocked boolean;
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

  -- Check if post author has blocked the commenter
  -- Default to false (not blocked) if we can't check
  is_blocked := false;
  if post_author_id is not null and comment_author_id is not null then
    -- Check if dms_blocks table exists and if user is blocked
    if exists (
      select 1 from information_schema.tables 
      where table_schema = 'public' 
      and table_name = 'dms_blocks'
    ) then
      select exists(
        select 1
        from public.dms_blocks
        where blocker = post_author_id
          and blocked = comment_author_id
      ) into is_blocked;
    end if;
  end if;

  -- Don't notify if commenting on own post or if blocked
  if post_author_id is not null 
     and comment_author_id is not null 
     and post_author_id != comment_author_id 
     and not is_blocked then
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

-- Recreate trigger for comments on posts
drop trigger if exists notify_comment_on_post_trigger on public.comments;
create trigger notify_comment_on_post_trigger
  after insert on public.comments
  for each row
  when (new.parent_id is null)
  execute function public.notify_comment_on_post();

-- Update trigger for replies to comments to check if parent comment author has blocked the replier
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
  is_blocked boolean;
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

  -- Check if parent comment author has blocked the replier
  -- Default to false (not blocked) if we can't check
  is_blocked := false;
  if parent_comment_author_id is not null and comment_author_id is not null then
    -- Check if dms_blocks table exists and if user is blocked
    if exists (
      select 1 from information_schema.tables 
      where table_schema = 'public' 
      and table_name = 'dms_blocks'
    ) then
      select exists(
        select 1
        from public.dms_blocks
        where blocker = parent_comment_author_id
          and blocked = comment_author_id
      ) into is_blocked;
    end if;
  end if;

  -- Don't notify if replying to own comment or if blocked
  if parent_comment_author_id is not null 
     and comment_author_id is not null 
     and parent_comment_author_id != comment_author_id 
     and not is_blocked then
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

-- Recreate trigger for replies to comments
drop trigger if exists notify_comment_on_comment_trigger on public.comments;
create trigger notify_comment_on_comment_trigger
  after insert on public.comments
  for each row
  when (new.parent_id is not null)
  execute function public.notify_comment_on_comment();

-- Update trigger for reactions on posts to check if post author has blocked the reactor
create or replace function public.notify_reaction_on_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  post_author_id uuid;
  is_blocked boolean;
begin
  -- Get post author
  select author_id into post_author_id
  from public.posts
  where id = new.post_id;

  -- Check if post author has blocked the reactor
  -- Default to false (not blocked) if we can't check
  is_blocked := false;
  if post_author_id is not null and new.user_id is not null then
    -- Check if dms_blocks table exists and if user is blocked
    if exists (
      select 1 from information_schema.tables 
      where table_schema = 'public' 
      and table_name = 'dms_blocks'
    ) then
      select exists(
        select 1
        from public.dms_blocks
        where blocker = post_author_id
          and blocked = new.user_id
      ) into is_blocked;
    end if;
  end if;

  -- Don't notify if reacting to own post or if blocked
  if post_author_id is not null 
     and new.user_id is not null 
     and post_author_id != new.user_id 
     and not is_blocked then
    perform public.create_notification(
      p_user_id := post_author_id,
      p_type := 'reaction_on_post',
      p_actor_id := new.user_id,
      p_post_id := new.post_id
    );
  end if;

  return new;
end;
$$;

-- Recreate trigger for reactions on posts
drop trigger if exists notify_reaction_on_post_trigger on public.post_reactions;
create trigger notify_reaction_on_post_trigger
  after insert on public.post_reactions
  for each row
  execute function public.notify_reaction_on_post();

commit;

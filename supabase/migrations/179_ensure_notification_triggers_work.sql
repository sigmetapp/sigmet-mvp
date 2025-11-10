-- Ensure notification triggers are working correctly
-- This migration recreates all notification triggers to ensure they work
begin;

-- Ensure create_notification function exists and works
create or replace function public.create_notification(
  p_user_id uuid,
  p_type text,
  p_actor_id uuid default null,
  p_post_id bigint default null,
  p_comment_id bigint default null,
  p_trust_feedback_id bigint default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Security definer functions automatically bypass RLS
  insert into public.notifications (
    user_id,
    type,
    actor_id,
    post_id,
    comment_id,
    trust_feedback_id
  ) values (
    p_user_id,
    p_type,
    p_actor_id,
    p_post_id,
    p_comment_id,
    p_trust_feedback_id
  );
end;
$$;

-- Determine which column is used for comment author and create functions accordingly
do $$
declare
  comments_author_col text;
  has_author_id boolean;
  has_user_id boolean;
begin
  -- Check which columns exist
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'comments'
      and column_name = 'author_id'
  ) into has_author_id;
  
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'comments'
      and column_name = 'user_id'
  ) into has_user_id;
  
  -- Determine which column to use
  if has_author_id then
    comments_author_col := 'author_id';
  elsif has_user_id then
    comments_author_col := 'user_id';
  else
    -- Try to find any uuid column that references auth.users
    select column_name into comments_author_col
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'comments'
      and data_type = 'uuid'
      and column_name != 'id'
      and column_name != 'parent_id'
    limit 1;
  end if;

  if comments_author_col is null then
    raise notice 'Could not find author column in comments table. Skipping trigger creation.';
  else
    raise notice 'Using column % for comment author', comments_author_col;
  end if;
end $$;

-- Create notify_comment_on_post function (try author_id first, then user_id)
create or replace function public.notify_comment_on_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  post_author_id uuid;
  comment_author_id uuid;
  is_blocked boolean;
begin
  -- Get comment author ID (try author_id first, then user_id)
  comment_author_id := coalesce(
    (to_jsonb(new)->>'author_id')::uuid,
    (to_jsonb(new)->>'user_id')::uuid
  );
  
  -- Get post author
  select author_id into post_author_id
  from public.posts
  where id = new.post_id;
  
  -- Check if post author has blocked the commenter
  is_blocked := false;
  if post_author_id is not null and comment_author_id is not null then
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
      p_comment_id := new.id
    );
  end if;
  
  return new;
end;
$$;

-- Create notify_comment_on_comment function
create or replace function public.notify_comment_on_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_comment_author_id uuid;
  comment_author_id uuid;
  is_blocked boolean;
begin
  -- Only process if this is a reply (has parent_id)
  if new.parent_id is null then
    return new;
  end if;
  
  -- Get comment author ID (try author_id first, then user_id)
  comment_author_id := coalesce(
    (to_jsonb(new)->>'author_id')::uuid,
    (to_jsonb(new)->>'user_id')::uuid
  );
  
  -- Get parent comment author (try author_id first, then user_id)
  select coalesce(
    (to_jsonb(c)->>'author_id')::uuid,
    (to_jsonb(c)->>'user_id')::uuid
  ) into parent_comment_author_id
  from public.comments c
  where c.id::text = new.parent_id::text
  limit 1;
  
  -- Check if parent comment author has blocked the replier
  is_blocked := false;
  if parent_comment_author_id is not null and comment_author_id is not null then
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
      p_comment_id := new.id
    );
  end if;
  
  return new;
end;
$$;

-- Create notify_reaction_on_post function
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
  is_blocked := false;
  if post_author_id is not null and new.user_id is not null then
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

-- Recreate all triggers
drop trigger if exists notify_comment_on_post_trigger on public.comments;
create trigger notify_comment_on_post_trigger
  after insert on public.comments
  for each row
  when (new.parent_id is null)
  execute function public.notify_comment_on_post();

drop trigger if exists notify_comment_on_comment_trigger on public.comments;
create trigger notify_comment_on_comment_trigger
  after insert on public.comments
  for each row
  when (new.parent_id is not null)
  execute function public.notify_comment_on_comment();

drop trigger if exists notify_reaction_on_post_trigger on public.post_reactions;
create trigger notify_reaction_on_post_trigger
  after insert on public.post_reactions
  for each row
  execute function public.notify_reaction_on_post();

commit;

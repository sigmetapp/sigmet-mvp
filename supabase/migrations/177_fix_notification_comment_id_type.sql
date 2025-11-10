-- Fix comment_id type mismatch: comments.id is bigint, but notifications.comment_id was uuid
-- This migration fixes the type mismatch and updates the triggers accordingly
begin;

-- First, drop the foreign key constraint if it exists (must be done before type change)
alter table public.notifications
  drop constraint if exists notifications_comment_id_fkey;

-- Change comment_id from uuid to bigint to match comments.id type
-- Handle existing data safely
do $$
declare
  current_type text;
begin
  -- Get current type of comment_id column
  select data_type into current_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'notifications'
    and column_name = 'comment_id';
  
  if current_type is null then
    raise notice 'comment_id column does not exist, skipping';
    return;
  end if;
  
  raise notice 'Current comment_id type: %', current_type;
  
  if current_type = 'uuid' then
    -- Column is uuid, need to convert to bigint
    -- First, clear ALL comment_id values since UUID cannot be converted to bigint
    -- (UUIDs and bigints are completely different types)
    raise notice 'Clearing all comment_id values before type conversion';
    update public.notifications
    set comment_id = null
    where comment_id is not null;
    
    -- Now convert the type (all values are null, so conversion is safe)
    raise notice 'Converting comment_id from uuid to bigint';
    alter table public.notifications 
      alter column comment_id type bigint using null::bigint;
    
    raise notice 'Type conversion completed';
  elsif current_type = 'bigint' then
    -- Already correct type
    raise notice 'comment_id is already bigint, skipping conversion';
  else
    raise notice 'comment_id has unexpected type: %, skipping conversion', current_type;
  end if;
end $$;

-- Recreate the foreign key constraint with correct type (only if types match)
do $$
declare
  comment_id_type text;
  comments_id_type text;
begin
  -- Check types before creating constraint
  select data_type into comment_id_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'notifications'
    and column_name = 'comment_id';
  
  select data_type into comments_id_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'comments'
    and column_name = 'id';
  
  if comment_id_type = 'bigint' and comments_id_type = 'bigint' then
    -- Types match, create constraint
    raise notice 'Creating foreign key constraint (both types are bigint)';
    alter table public.notifications
      add constraint notifications_comment_id_fkey
      foreign key (comment_id) references public.comments(id) on delete cascade;
  else
    raise notice 'Types do not match: notifications.comment_id = %, comments.id = %, skipping constraint creation', 
      comment_id_type, comments_id_type;
  end if;
end $$;

-- Update create_notification function to accept bigint for comment_id
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

-- Update notify_comment_on_post function to use bigint
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
      p_comment_id := new.id
    );
  end if;

  return new;
end;
$$;

-- Update notify_comment_on_comment function to use bigint
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
      p_comment_id := new.id
    );
  end if;

  return new;
end;
$$;

-- Recreate triggers to ensure they use the updated functions
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

commit;

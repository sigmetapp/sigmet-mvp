-- Create triggers to automatically create notifications for various events
begin;

-- Function to create notification (using security definer to bypass RLS)
create or replace function public.create_notification(
  p_user_id uuid,
  p_type text,
  p_actor_id uuid default null,
  p_post_id bigint default null,
  p_comment_id uuid default null,
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

-- Trigger for comments on posts
create or replace function public.notify_comment_on_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  post_author_id uuid;
begin
  -- Get post author
  select author_id into post_author_id
  from public.posts
  where id = new.post_id;

  -- Don't notify if commenting on own post
  if post_author_id is not null and post_author_id != new.author_id then
    perform public.create_notification(
      p_user_id := post_author_id,
      p_type := 'comment_on_post',
      p_actor_id := new.author_id,
      p_post_id := new.post_id,
      p_comment_id := new.id::uuid
    );
  end if;

  return new;
end;
$$;

drop trigger if exists notify_comment_on_post_trigger on public.comments;
create trigger notify_comment_on_post_trigger
  after insert on public.comments
  for each row
  when (new.parent_id is null)
  execute function public.notify_comment_on_post();

-- Trigger for replies to comments
create or replace function public.notify_comment_on_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_comment_author_id uuid;
begin
  -- Only process if this is a reply (has parent_id)
  if new.parent_id is null then
    return new;
  end if;

  -- Get parent comment author
  select author_id into parent_comment_author_id
  from public.comments
  where id = new.parent_id;

  -- Don't notify if replying to own comment
  if parent_comment_author_id is not null and parent_comment_author_id != new.author_id then
    perform public.create_notification(
      p_user_id := parent_comment_author_id,
      p_type := 'comment_on_comment',
      p_actor_id := new.author_id,
      p_post_id := new.post_id,
      p_comment_id := new.id::uuid
    );
  end if;

  return new;
end;
$$;

drop trigger if exists notify_comment_on_comment_trigger on public.comments;
create trigger notify_comment_on_comment_trigger
  after insert on public.comments
  for each row
  when (new.parent_id is not null)
  execute function public.notify_comment_on_comment();

-- Trigger for reactions on posts
create or replace function public.notify_reaction_on_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  post_author_id uuid;
begin
  -- Get post author
  select author_id into post_author_id
  from public.posts
  where id = new.post_id;

  -- Don't notify if reacting to own post
  if post_author_id is not null and post_author_id != new.user_id then
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

drop trigger if exists notify_reaction_on_post_trigger on public.post_reactions;
create trigger notify_reaction_on_post_trigger
  after insert on public.post_reactions
  for each row
  execute function public.notify_reaction_on_post();

-- Trigger for follows/subscriptions
-- Create trigger function for follows (will only be used if follows table exists)
create or replace function public.notify_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Don't notify if following yourself
  if new.follower_id != new.followee_id then
    perform public.create_notification(
      p_user_id := new.followee_id,
      p_type := 'subscription',
      p_actor_id := new.follower_id
    );
  end if;

  return new;
end;
$$;

-- Create trigger only if follows table exists
do $$
begin
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'follows'
  ) then
    drop trigger if exists notify_subscription_trigger on public.follows;
    execute 'create trigger notify_subscription_trigger
      after insert on public.follows
      for each row
      execute function public.notify_subscription()';
  end if;
end $$;

-- Trigger for Trust Flow entries
create or replace function public.notify_trust_flow_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Don't notify if giving feedback to yourself
  if new.author_id is not null and new.author_id != new.target_user_id then
    perform public.create_notification(
      p_user_id := new.target_user_id,
      p_type := 'trust_flow_entry',
      p_actor_id := new.author_id,
      p_trust_feedback_id := new.id
    );
  end if;

  return new;
end;
$$;

drop trigger if exists notify_trust_flow_entry_trigger on public.trust_feedback;
create trigger notify_trust_flow_entry_trigger
  after insert on public.trust_feedback
  for each row
  execute function public.notify_trust_flow_entry();

-- Function to handle mentions in posts
-- This will be called when a post is created or updated
create or replace function public.notify_mentions_in_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  mentioned_user_id uuid;
  mentioned_username text;
  post_text text;
  word_record text;
  username_match text;
begin
  post_text := coalesce(new.text, '');
  
  -- Only process if post has text
  if post_text = '' then
    return new;
  end if;

  -- Find all @username mentions in the post
  -- Pattern: @username followed by space, newline, or end of string
  for word_record in
    select unnest(regexp_split_to_array(post_text, '\s+'))
  loop
    -- Check if word starts with @ and extract username
    if word_record ~ '^@[a-zA-Z0-9_]+' then
      -- Extract username (remove @ and any trailing punctuation)
      username_match := substring(word_record from 2);
      -- Remove any trailing punctuation
      username_match := regexp_replace(username_match, '[^a-zA-Z0-9_].*$', '');
      
      -- Find user by username
      select user_id into mentioned_user_id
      from public.profiles
      where lower(username) = lower(username_match)
      limit 1;

      -- Create notification if user found and not mentioning yourself
      if mentioned_user_id is not null and mentioned_user_id != new.author_id then
        perform public.create_notification(
          p_user_id := mentioned_user_id,
          p_type := 'mention_in_post',
          p_actor_id := new.author_id,
          p_post_id := new.id
        );
      end if;
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists notify_mentions_in_post_trigger on public.posts;
create trigger notify_mentions_in_post_trigger
  after insert on public.posts
  for each row
  execute function public.notify_mentions_in_post();

commit;

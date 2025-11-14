-- Verify and fix all notification triggers
-- This migration ensures all notification triggers are properly created and active
begin;

-- First, ensure create_notification function exists with latest signature
create or replace function public.create_notification(
  p_user_id uuid,
  p_type text,
  p_actor_id uuid default null,
  p_post_id bigint default null,
  p_comment_id bigint default null,
  p_trust_feedback_id bigint default null,
  p_connection_id bigint default null,
  p_sw_level text default null,
  p_event_id bigint default null
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
    trust_feedback_id,
    connection_id,
    sw_level,
    event_id
  ) values (
    p_user_id,
    p_type,
    p_actor_id,
    p_post_id,
    p_comment_id,
    p_trust_feedback_id,
    p_connection_id,
    p_sw_level,
    p_event_id
  );
exception
  when others then
    -- Log error but don't fail the trigger
    raise notice 'Error creating notification: %', SQLERRM;
end;
$$;

-- Ensure resolve_post_author_id function exists
create or replace function public.resolve_post_author_id(p_post_id bigint)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  post_record jsonb;
  resolved uuid;
begin
  select to_jsonb(p)
    into post_record
  from public.posts p
  where p.id = p_post_id
  limit 1;

  if post_record is null then
    return null;
  end if;

  resolved := coalesce(
    nullif(post_record->>'author_id', '')::uuid,
    nullif(post_record->>'user_id', '')::uuid,
    nullif(post_record->>'owner_id', '')::uuid
  );

  return resolved;
exception
  when others then
    raise notice 'Error resolving post author: %', SQLERRM;
    return null;
end;
$$;

-- Recreate notify_comment_on_post function (latest version from migration 182)
create or replace function public.notify_comment_on_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  post_author_id uuid;
  comment_author_id uuid;
  has_blocks_table boolean;
  comment_id_text text;
  comment_id_bigint bigint := null;
begin
  comment_author_id := coalesce(
    nullif((to_jsonb(new)->>'author_id'), '')::uuid,
    nullif((to_jsonb(new)->>'user_id'), '')::uuid
  );

  post_author_id := public.resolve_post_author_id(new.post_id);

  comment_id_text := to_jsonb(new)->>'id';
  if comment_id_text ~ '^[0-9]+$' then
    comment_id_bigint := comment_id_text::bigint;
  end if;

  if post_author_id is null or comment_author_id is null then
    return new;
  end if;

  if post_author_id = comment_author_id then
    return new;
  end if;

  select exists(
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'dms_blocks'
  ) into has_blocks_table;

  if has_blocks_table then
    if exists (
      select 1
      from public.dms_blocks b
      where b.blocker = post_author_id
        and b.blocked = comment_author_id
    ) then
      return new;
    end if;
  end if;

  perform public.create_notification(
    p_user_id := post_author_id,
    p_type := 'comment_on_post',
    p_actor_id := comment_author_id,
    p_post_id := new.post_id,
    p_comment_id := comment_id_bigint
  );

  return new;
exception
  when others then
    raise notice 'Error in notify_comment_on_post: %', SQLERRM;
    return new;
end;
$$;

-- Recreate notify_comment_on_comment function
create or replace function public.notify_comment_on_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_comment_author_id uuid;
  comment_author_id uuid;
  has_blocks_table boolean;
  comment_id_text text;
  comment_id_bigint bigint := null;
begin
  if new.parent_id is null then
    return new;
  end if;

  comment_author_id := coalesce(
    nullif((to_jsonb(new)->>'author_id'), '')::uuid,
    nullif((to_jsonb(new)->>'user_id'), '')::uuid
  );

  select coalesce(
      nullif((to_jsonb(c)->>'author_id'), '')::uuid,
      nullif((to_jsonb(c)->>'user_id'), '')::uuid
    )
    into parent_comment_author_id
  from public.comments c
  where c.id::text = new.parent_id::text
  limit 1;

  comment_id_text := to_jsonb(new)->>'id';
  if comment_id_text ~ '^[0-9]+$' then
    comment_id_bigint := comment_id_text::bigint;
  end if;

  if parent_comment_author_id is null or comment_author_id is null then
    return new;
  end if;

  if parent_comment_author_id = comment_author_id then
    return new;
  end if;

  select exists(
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'dms_blocks'
  ) into has_blocks_table;

  if has_blocks_table then
    if exists (
      select 1
      from public.dms_blocks b
      where b.blocker = parent_comment_author_id
        and b.blocked = comment_author_id
    ) then
      return new;
    end if;
  end if;

  perform public.create_notification(
    p_user_id := parent_comment_author_id,
    p_type := 'comment_on_comment',
    p_actor_id := comment_author_id,
    p_post_id := new.post_id,
    p_comment_id := comment_id_bigint
  );

  return new;
exception
  when others then
    raise notice 'Error in notify_comment_on_comment: %', SQLERRM;
    return new;
end;
$$;

-- Recreate notify_reaction_on_post function
create or replace function public.notify_reaction_on_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  post_author_id uuid;
  has_blocks_table boolean;
begin
  post_author_id := public.resolve_post_author_id(new.post_id);

  if post_author_id is null or new.user_id is null then
    return new;
  end if;

  if post_author_id = new.user_id then
    return new;
  end if;

  select exists(
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'dms_blocks'
  ) into has_blocks_table;

  if has_blocks_table then
    if exists (
      select 1
      from public.dms_blocks b
      where b.blocker = post_author_id
        and b.blocked = new.user_id
    ) then
      return new;
    end if;
  end if;

  perform public.create_notification(
    p_user_id := post_author_id,
    p_type := 'reaction_on_post',
    p_actor_id := new.user_id,
    p_post_id := new.post_id
  );

  return new;
exception
  when others then
    raise notice 'Error in notify_reaction_on_post: %', SQLERRM;
    return new;
end;
$$;

-- Ensure notify_reaction_on_comment function exists (from migration 227)
create or replace function public.notify_reaction_on_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  comment_author_id uuid;
  comment_post_id bigint;
  comment_id_bigint bigint;
  comment_id_type text;
begin
  -- Determine comment_id type in comment_reactions table
  select data_type into comment_id_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'comment_reactions'
    and column_name = 'comment_id';

  -- Get comment author and post_id based on comment_id type
  if comment_id_type = 'uuid' then
    select author_id, post_id, id into comment_author_id, comment_post_id, comment_id_bigint
    from public.comments
    where id::uuid = new.comment_id
    limit 1;
  else
    select author_id, post_id, id into comment_author_id, comment_post_id, comment_id_bigint
    from public.comments
    where id = new.comment_id::bigint
    limit 1;
  end if;

  -- Don't notify if reacting to own comment
  if comment_author_id is not null and comment_author_id != new.user_id then
    perform public.create_notification(
      p_user_id := comment_author_id,
      p_type := 'reaction_on_comment',
      p_actor_id := new.user_id,
      p_post_id := comment_post_id,
      p_comment_id := comment_id_bigint
    );
  end if;

  return new;
exception
  when others then
    raise notice 'Error in notify_reaction_on_comment: %', SQLERRM;
    return new;
end;
$$;

-- Ensure notify_connection function exists (from migration 227)
create or replace function public.notify_connection()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only notify for 'they_mentioned_me' type connections (when someone mentions you)
  -- Don't notify if connecting to yourself
  if new.connection_type = 'they_mentioned_me' and new.user_id != new.connected_user_id then
    perform public.create_notification(
      p_user_id := new.user_id,
      p_type := 'connection',
      p_actor_id := new.connected_user_id,
      p_post_id := new.post_id,
      p_connection_id := new.id
    );
  end if;

  return new;
exception
  when others then
    raise notice 'Error in notify_connection: %', SQLERRM;
    return new;
end;
$$;

-- Ensure notify_on_event function exists (from migration 228)
create or replace function public.notify_on_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Create notification for the user when an event is created
  perform public.create_notification(
    p_user_id := new.user_id,
    p_type := 'event',
    p_actor_id := null,
    p_event_id := new.id
  );

  return new;
exception
  when others then
    raise notice 'Error in notify_on_event: %', SQLERRM;
    return new;
end;
$$;

-- Now drop and recreate all triggers to ensure they're active
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

drop trigger if exists notify_reaction_on_comment_trigger on public.comment_reactions;
create trigger notify_reaction_on_comment_trigger
  after insert on public.comment_reactions
  for each row
  execute function public.notify_reaction_on_comment();

drop trigger if exists notify_connection_trigger on public.user_connections;
create trigger notify_connection_trigger
  after insert on public.user_connections
  for each row
  when (new.connection_type = 'they_mentioned_me')
  execute function public.notify_connection();

-- Only create event trigger if sw_events table exists
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'sw_events'
  ) then
    drop trigger if exists notify_on_event_trigger on public.sw_events;
    create trigger notify_on_event_trigger
      after insert on public.sw_events
      for each row
      execute function public.notify_on_event();
  end if;
end;
$$;

commit;

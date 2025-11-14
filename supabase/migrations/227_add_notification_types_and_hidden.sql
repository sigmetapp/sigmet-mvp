-- Add new notification types and hidden field
begin;

-- Add new notification types: reaction_on_comment, connection, sw_level_update
alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check check (type in (
    'mention_in_post',
    'comment_on_post',
    'reaction_on_post',
    'reaction_on_comment',
    'comment_on_comment',
    'subscription',
    'connection',
    'trust_flow_entry',
    'sw_level_update'
  ));

-- Add hidden field to allow users to hide notifications permanently
alter table public.notifications
  add column if not exists hidden boolean not null default false;

-- Add index for hidden field
create index if not exists notifications_user_hidden_idx 
  on public.notifications(user_id, hidden) 
  where hidden = false;

-- Add connection_id field for connection notifications
alter table public.notifications
  add column if not exists connection_id bigint references public.user_connections(id) on delete cascade;

-- Add sw_level field for SW level update notifications
alter table public.notifications
  add column if not exists sw_level text;

-- Update the create_notification function to support new fields
-- Note: comment_id is bigint, not uuid (see migration 177)
create or replace function public.create_notification(
  p_user_id uuid,
  p_type text,
  p_actor_id uuid default null,
  p_post_id bigint default null,
  p_comment_id bigint default null,
  p_trust_feedback_id bigint default null,
  p_connection_id bigint default null,
  p_sw_level text default null
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
    sw_level
  ) values (
    p_user_id,
    p_type,
    p_actor_id,
    p_post_id,
    p_comment_id,
    p_trust_feedback_id,
    p_connection_id,
    p_sw_level
  );
end;
$$;

-- Create trigger for reactions on comments
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
    -- comment_reactions.comment_id is uuid
    select author_id, post_id, id into comment_author_id, comment_post_id, comment_id_bigint
    from public.comments
    where id::uuid = new.comment_id
    limit 1;
  else
    -- comment_reactions.comment_id is bigint
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
end;
$$;

drop trigger if exists notify_reaction_on_comment_trigger on public.comment_reactions;
create trigger notify_reaction_on_comment_trigger
  after insert on public.comment_reactions
  for each row
  execute function public.notify_reaction_on_comment();

-- Create trigger for new connections (when user_connections is created)
-- Note: This will trigger when a new connection is established via mentions
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
end;
$$;

drop trigger if exists notify_connection_trigger on public.user_connections;
create trigger notify_connection_trigger
  after insert on public.user_connections
  for each row
  when (new.connection_type = 'they_mentioned_me')
  execute function public.notify_connection();

-- Note: SW level update notifications should be created manually via API
-- when SW level changes are detected, as this requires checking the current level
-- and comparing it to the new level

commit;

-- Add event notifications support
begin;

-- Add 'event' to notification types
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
    'sw_level_update',
    'event'
  ));

-- Add event_id field to reference sw_events
alter table public.notifications
  add column if not exists event_id bigint references public.sw_events(id) on delete cascade;

-- Add index for event_id
create index if not exists notifications_event_id_idx 
  on public.notifications(event_id) 
  where event_id is not null;

-- Update create_notification function to support event_id
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
end;
$$;

-- Create trigger function to notify on sw_events
-- This will create notifications for important events
create or replace function public.notify_on_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Create notification for the user when an event is created
  -- Events don't have an actor, so actor_id is null
  -- You can filter by event type if needed (e.g., only notify for specific event types)
  -- For example: if new.type in ('important_event', 'milestone') then ...
  perform public.create_notification(
    p_user_id := new.user_id,
    p_type := 'event',
    p_actor_id := null,
    p_event_id := new.id
  );

  return new;
end;
$$;

-- Create trigger on sw_events table
drop trigger if exists notify_on_event_trigger on public.sw_events;
create trigger notify_on_event_trigger
  after insert on public.sw_events
  for each row
  execute function public.notify_on_event();

commit;

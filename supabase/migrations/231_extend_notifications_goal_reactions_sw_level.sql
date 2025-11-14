-- Extend notifications to support goal reactions, trust pushes, and SW level tracking
begin;

-- Add new columns for trust pushes and goal reactions
alter table public.notifications
  add column if not exists trust_push_id bigint references public.trust_pushes(id) on delete cascade;

alter table public.notifications
  add column if not exists goal_id text;

alter table public.notifications
  add column if not exists goal_reaction_kind text;

-- Index for faster trust push lookups
create index if not exists notifications_trust_push_id_idx
  on public.notifications(trust_push_id)
  where trust_push_id is not null;

-- Update type check to include goal reactions
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
    'event',
    'goal_reaction'
  ));

-- Update create_notification function with new optional columns
create or replace function public.create_notification(
  p_user_id uuid,
  p_type text,
  p_actor_id uuid default null,
  p_post_id bigint default null,
  p_comment_id bigint default null,
  p_trust_feedback_id bigint default null,
  p_connection_id bigint default null,
  p_sw_level text default null,
  p_event_id bigint default null,
  p_trust_push_id bigint default null,
  p_goal_id text default null,
  p_goal_reaction_kind text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (
    user_id,
    type,
    actor_id,
    post_id,
    comment_id,
    trust_feedback_id,
    connection_id,
    sw_level,
    event_id,
    trust_push_id,
    goal_id,
    goal_reaction_kind
  ) values (
    p_user_id,
    p_type,
    p_actor_id,
    p_post_id,
    p_comment_id,
    p_trust_feedback_id,
    p_connection_id,
    p_sw_level,
    p_event_id,
    p_trust_push_id,
    p_goal_id,
    p_goal_reaction_kind
  );
exception
  when others then
    raise notice 'Error creating notification: %', SQLERRM;
end;
$$;

-- Notify goal owner when someone reacts to their goal
create or replace function public.notify_goal_reaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.goal_user_id is null or new.user_id is null then
    return new;
  end if;

  -- Do not notify when reacting to own goal
  if new.goal_user_id = new.user_id then
    return new;
  end if;

  perform public.create_notification(
    p_user_id := new.goal_user_id,
    p_type := 'goal_reaction',
    p_actor_id := new.user_id,
    p_goal_id := new.goal_id,
    p_goal_reaction_kind := new.kind
  );

  return new;
exception
  when others then
    raise notice 'Error in notify_goal_reaction: %', SQLERRM;
    return new;
end;
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'goal_reactions'
  ) then
    drop trigger if exists notify_goal_reaction_trigger on public.goal_reactions;
    create trigger notify_goal_reaction_trigger
      after insert on public.goal_reactions
      for each row
      execute function public.notify_goal_reaction();
  end if;
end;
$$;

-- Notify target user whenever a trust push is created
create or replace function public.notify_trust_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.to_user_id is null or new.from_user_id is null then
    return new;
  end if;

  if new.to_user_id = new.from_user_id then
    return new;
  end if;

  perform public.create_notification(
    p_user_id := new.to_user_id,
    p_type := 'trust_flow_entry',
    p_actor_id := new.from_user_id,
    p_trust_push_id := new.id
  );

  return new;
exception
  when others then
    raise notice 'Error in notify_trust_push: %', SQLERRM;
    return new;
end;
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'trust_pushes'
  ) then
    drop trigger if exists notify_trust_push_trigger on public.trust_pushes;
    create trigger notify_trust_push_trigger
      after insert on public.trust_pushes
      for each row
      execute function public.notify_trust_push();
  end if;
end;
$$;

-- Track current SW level in sw_scores
alter table public.sw_scores
  add column if not exists current_level text;

alter table public.sw_scores
  add column if not exists last_level_change timestamptz;

commit;

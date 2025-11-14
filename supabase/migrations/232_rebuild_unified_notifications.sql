-- Rebuild notifications into a single unified alert system
begin;

-- Drop legacy triggers (safe even if they don't exist)
drop trigger if exists notify_comment_on_post_trigger on public.comments;
drop trigger if exists notify_comment_on_comment_trigger on public.comments;
drop trigger if exists notify_reaction_on_post_trigger on public.post_reactions;
drop trigger if exists notify_reaction_on_comment_trigger on public.comment_reactions;
drop trigger if exists notify_subscription_trigger on public.follows;
drop trigger if exists notify_connection_trigger on public.user_connections;
drop trigger if exists notify_trust_flow_entry_trigger on public.trust_feedback;
drop trigger if exists notify_mentions_in_post_trigger on public.posts;
drop trigger if exists notify_on_event_trigger on public.sw_events;
drop trigger if exists notify_goal_reaction_trigger on public.goal_reactions;
drop trigger if exists notify_trust_push_trigger on public.trust_pushes;
drop trigger if exists notify_sw_level_change_trigger on public.sw_scores;

-- Drop legacy functions that referenced the old notification formats
drop function if exists public.notify_comment_on_post();
drop function if exists public.notify_comment_on_comment();
drop function if exists public.notify_reaction_on_post();
drop function if exists public.notify_reaction_on_comment();
drop function if exists public.notify_subscription();
drop function if exists public.notify_connection();
drop function if exists public.notify_trust_flow_entry();
drop function if exists public.notify_mentions_in_post();
drop function if exists public.notify_on_event();
drop function if exists public.notify_goal_reaction();
drop function if exists public.notify_trust_push();
drop function if exists public.notify_sw_level_change();
drop function if exists public.resolve_post_author_id(bigint);
drop function if exists public.check_notification_triggers();
drop function if exists public.create_notification(
  uuid,
  text,
  uuid,
  bigint,
  bigint,
  bigint,
  bigint,
  text,
  bigint,
  bigint,
  text,
  text
);

-- Drop and recreate notifications table with the new schema
drop table if exists public.notifications cascade;

create table public.notifications (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in (
    'comment_on_post',
    'comment_on_comment',
    'reaction_on_post',
    'reaction_on_comment',
    'goal_reaction',
    'trust_flow_entry',
    'sw_level_update'
  )),
  actor_id uuid references auth.users(id) on delete set null,
  post_id bigint references public.posts(id) on delete cascade,
  comment_id bigint references public.comments(id) on delete cascade,
  goal_id text,
  goal_reaction_kind text,
  trust_push_id bigint references public.trust_pushes(id) on delete cascade,
  sw_level text,
  read_at timestamptz,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);

create index notifications_user_created_idx on public.notifications(user_id, created_at desc);
create index notifications_user_read_idx on public.notifications(user_id, read_at);
create index notifications_user_hidden_idx on public.notifications(user_id) where hidden = false;
create index notifications_post_idx on public.notifications(post_id) where post_id is not null;
create index notifications_comment_idx on public.notifications(comment_id) where comment_id is not null;
create index notifications_trust_push_id_idx on public.notifications(trust_push_id) where trust_push_id is not null;

alter table public.notifications enable row level security;

create policy "read own notifications" on public.notifications
  for select using (auth.uid() = user_id);

create policy "insert notifications via service" on public.notifications
  for insert with check (true);

create policy "update own notifications" on public.notifications
  for update using (auth.uid() = user_id);

-- Helper to resolve post author ids consistently
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

-- Canonical insert entry point
create or replace function public.create_notification(
  p_user_id uuid,
  p_type text,
  p_actor_id uuid default null,
  p_post_id bigint default null,
  p_comment_id bigint default null,
  p_goal_id text default null,
  p_goal_reaction_kind text default null,
  p_trust_push_id bigint default null,
  p_sw_level text default null
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
    goal_id,
    goal_reaction_kind,
    trust_push_id,
    sw_level
  ) values (
    p_user_id,
    p_type,
    p_actor_id,
    p_post_id,
    p_comment_id,
    p_goal_id,
    p_goal_reaction_kind,
    p_trust_push_id,
    p_sw_level
  );
exception
  when others then
    raise notice 'Error creating notification: %', SQLERRM;
end;
$$;

-- Notify when a top-level comment is left on a post
create or replace function public.notify_comment_on_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  post_author_id uuid;
  comment_author_id uuid;
  has_blocks boolean;
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
  ) into has_blocks;

  if has_blocks then
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

-- Notify when someone replies to a comment
create or replace function public.notify_comment_on_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_comment_author uuid;
  reply_author uuid;
  has_blocks boolean;
  comment_id_text text;
  comment_id_bigint bigint := null;
begin
  if new.parent_id is null then
    return new;
  end if;

  reply_author := coalesce(
    nullif((to_jsonb(new)->>'author_id'), '')::uuid,
    nullif((to_jsonb(new)->>'user_id'), '')::uuid
  );

  select coalesce(
      nullif((to_jsonb(c)->>'author_id'), '')::uuid,
      nullif((to_jsonb(c)->>'user_id'), '')::uuid
    )
    into parent_comment_author
  from public.comments c
  where c.id::text = new.parent_id::text
  limit 1;

  comment_id_text := to_jsonb(new)->>'id';
  if comment_id_text ~ '^[0-9]+$' then
    comment_id_bigint := comment_id_text::bigint;
  end if;

  if parent_comment_author is null or reply_author is null then
    return new;
  end if;

  if parent_comment_author = reply_author then
    return new;
  end if;

  select exists(
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'dms_blocks'
  ) into has_blocks;

  if has_blocks then
    if exists (
      select 1
      from public.dms_blocks b
      where b.blocker = parent_comment_author
        and b.blocked = reply_author
    ) then
      return new;
    end if;
  end if;

  perform public.create_notification(
    p_user_id := parent_comment_author,
    p_type := 'comment_on_comment',
    p_actor_id := reply_author,
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

-- Notify post authors when someone reacts to their post
create or replace function public.notify_reaction_on_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  post_author_id uuid;
  has_blocks boolean;
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
  ) into has_blocks;

  if has_blocks then
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

-- Notify comment authors when someone reacts to their comment
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
  select data_type into comment_id_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'comment_reactions'
    and column_name = 'comment_id';

  if comment_id_type = 'uuid' then
    select author_id, post_id, id
      into comment_author_id, comment_post_id, comment_id_bigint
    from public.comments
    where id::uuid = new.comment_id
    limit 1;
  else
    select author_id, post_id, id
      into comment_author_id, comment_post_id, comment_id_bigint
    from public.comments
    where id = new.comment_id::bigint
    limit 1;
  end if;

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

-- Goal reactions
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

-- Trust push notifications
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

-- SW level changes
create or replace function public.notify_sw_level_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if new.current_level is null then
    return new;
  end if;

  if old.current_level is not distinct from new.current_level then
    return new;
  end if;

  perform public.create_notification(
    p_user_id := new.user_id,
    p_type := 'sw_level_update',
    p_sw_level := new.current_level
  );

  return new;
exception
  when others then
    raise notice 'Error in notify_sw_level_change: %', SQLERRM;
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

create trigger notify_reaction_on_post_trigger
  after insert on public.post_reactions
  for each row
  execute function public.notify_reaction_on_post();

create trigger notify_reaction_on_comment_trigger
  after insert on public.comment_reactions
  for each row
  execute function public.notify_reaction_on_comment();

drop trigger if exists notify_goal_reaction_trigger on public.goal_reactions;
create trigger notify_goal_reaction_trigger
  after insert on public.goal_reactions
  for each row
  execute function public.notify_goal_reaction();

drop trigger if exists notify_trust_push_trigger on public.trust_pushes;
create trigger notify_trust_push_trigger
  after insert on public.trust_pushes
  for each row
  execute function public.notify_trust_push();

drop trigger if exists notify_sw_level_change_trigger on public.sw_scores;
create trigger notify_sw_level_change_trigger
  after update on public.sw_scores
  for each row
  execute function public.notify_sw_level_change();

-- Utility to introspect trigger state for the alert debug panel
create or replace function public.check_notification_triggers()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb := '[]'::jsonb;
  trigger_record record;
begin
  for trigger_record in
    select 
      trigger_name,
      event_object_table,
      action_timing,
      event_manipulation
    from information_schema.triggers
    where trigger_schema = 'public'
      and trigger_name in (
        'notify_comment_on_post_trigger',
        'notify_comment_on_comment_trigger',
        'notify_reaction_on_post_trigger',
        'notify_reaction_on_comment_trigger',
        'notify_goal_reaction_trigger',
        'notify_trust_push_trigger',
        'notify_sw_level_change_trigger'
      )
    order by trigger_name
  loop
    result := result || jsonb_build_object(
      'name', trigger_record.trigger_name,
      'table', trigger_record.event_object_table,
      'timing', trigger_record.action_timing,
      'event', trigger_record.event_manipulation
    );
  end loop;

  return result;
end;
$$;

grant execute on function public.check_notification_triggers() to authenticated;

commit;

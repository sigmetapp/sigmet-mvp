-- Rebuild notification functions and triggers to ensure alerts fire for every event
begin;

-- Always use the latest create_notification signature so all notification sources work
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
    raise notice 'Error creating notification (%): %', p_type, SQLERRM;
end;
$$;

-- Helper to resolve the real post owner regardless of legacy columns
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

-- Normalize comment_id to bigint when possible (comments can be bigint or uuid)
create or replace function public.normalize_comment_id(p_comment jsonb)
returns bigint
language plpgsql
as $$
declare
  comment_id_text text;
begin
  comment_id_text := coalesce(p_comment->>'id', '');
  if comment_id_text ~ '^[0-9]+$' then
    return comment_id_text::bigint;
  end if;
  return null;
end;
$$;

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
  comment_id_bigint bigint := null;
  comment_row jsonb;
begin
  -- Guard against replies or blank parent ids
  if coalesce(new.parent_id::text, '') <> '' then
    return new;
  end if;

  comment_row := to_jsonb(new);
  comment_author_id := coalesce(
    nullif(comment_row->>'author_id', '')::uuid,
    nullif(comment_row->>'user_id', '')::uuid
  );

  post_author_id := public.resolve_post_author_id(new.post_id);
  comment_id_bigint := public.normalize_comment_id(comment_row);

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
  comment_row jsonb;
  parent_id_text text;
  comment_id_bigint bigint := null;
begin
  parent_id_text := coalesce(new.parent_id::text, '');
  if parent_id_text = '' then
    return new;
  end if;

  comment_row := to_jsonb(new);
  comment_author_id := coalesce(
    nullif(comment_row->>'author_id', '')::uuid,
    nullif(comment_row->>'user_id', '')::uuid
  );

  select coalesce(
      nullif((to_jsonb(c)->>'author_id'), '')::uuid,
      nullif((to_jsonb(c)->>'user_id'), '')::uuid
    )
    into parent_comment_author_id
  from public.comments c
  where c.id::text = parent_id_text
  limit 1;

  comment_id_bigint := public.normalize_comment_id(comment_row);

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

create or replace function public.notify_reaction_on_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  comment_author_id uuid;
  comment_record jsonb;
  comment_post_id bigint;
  comment_id_bigint bigint;
  comment_id_text text;
begin
  comment_id_text := coalesce(new.comment_id::text, '');
  if comment_id_text = '' then
    return new;
  end if;

  select to_jsonb(c), c.post_id, c.id
    into comment_record, comment_post_id, comment_id_bigint
  from public.comments c
  where c.id::text = comment_id_text
  limit 1;

  if comment_record is not null then
    comment_author_id := coalesce(
      nullif(comment_record->>'author_id', '')::uuid,
      nullif(comment_record->>'user_id', '')::uuid
    );
  end if;

  if comment_author_id is null or comment_author_id = new.user_id then
    return new;
  end if;

  perform public.create_notification(
    p_user_id := comment_author_id,
    p_type := 'reaction_on_comment',
    p_actor_id := new.user_id,
    p_post_id := comment_post_id,
    p_comment_id := comment_id_bigint
  );

  return new;
exception
  when others then
    raise notice 'Error in notify_reaction_on_comment: %', SQLERRM;
    return new;
end;
$$;

create or replace function public.notify_connection()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.connection_type = 'they_mentioned_me'
     and new.user_id is not null
     and new.connected_user_id is not null
     and new.user_id != new.connected_user_id then
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

create or replace function public.notify_on_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is null then
    return new;
  end if;

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

-- Recreate triggers with resilient parent_id checks
drop trigger if exists notify_comment_on_post_trigger on public.comments;
create trigger notify_comment_on_post_trigger
  after insert on public.comments
  for each row
  when (coalesce(new.parent_id::text, '') = '')
  execute function public.notify_comment_on_post();

drop trigger if exists notify_comment_on_comment_trigger on public.comments;
create trigger notify_comment_on_comment_trigger
  after insert on public.comments
  for each row
  when (coalesce(new.parent_id::text, '') <> '')
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

commit;

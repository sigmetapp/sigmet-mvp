-- Ensure notification triggers handle posts.user_id schema and backfill missing records
begin;

-- Helper to resolve the author/owner column on posts dynamically
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

-- Recreate notify_comment_on_post with dynamic post author resolution
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

-- Recreate notify_comment_on_comment with dynamic parent/author resolution
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

-- Recreate notify_reaction_on_post with dynamic post author resolution
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

-- Recreate triggers to ensure they call the updated functions
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

-- Backfill missing notifications using dynamic column detection
do $$
declare
  posts_author_col text;
  comments_author_col text;
  has_blocks_table boolean;
  comment_blocks_clause text := '';
  reply_blocks_clause text := '';
  reaction_blocks_clause text := '';
  comment_backfill_sql text;
  reply_backfill_sql text;
  reaction_backfill_sql text;
begin
  select public.resolve_user_reference_column('posts')
    into posts_author_col;

  if posts_author_col is null then
    raise notice 'Could not resolve posts author column; skipping notifications backfill.';
    return;
  end if;

  select public.resolve_user_reference_column('comments')
    into comments_author_col;

  select exists(
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'dms_blocks'
  ) into has_blocks_table;

  if has_blocks_table then
    if comments_author_col is not null then
      comment_blocks_clause := format(
        E'\n      and not exists (\n        select 1 from public.dms_blocks b\n        where b.blocker = p.%1$I\n          and b.blocked = c.%2$I\n      )',
        posts_author_col,
        comments_author_col
      );

      reply_blocks_clause := format(
        E'\n      and not exists (\n        select 1 from public.dms_blocks b\n        where b.blocker = pc.%1$I\n          and b.blocked = c.%1$I\n      )',
        comments_author_col
      );
    end if;

    reaction_blocks_clause := format(
      E'\n      and not exists (\n        select 1 from public.dms_blocks b\n        where b.blocker = p.%1$I\n          and b.blocked = pr.user_id\n      )',
      posts_author_col
    );
  end if;

  if comments_author_col is not null then
    comment_backfill_sql := format(
      $sql$
      insert into public.notifications (user_id, type, actor_id, post_id, comment_id, created_at)
      select distinct
        p.%1$I as user_id,
        'comment_on_post'::text as type,
        c.%2$I as actor_id,
        c.post_id,
        case
          when (to_jsonb(c)->>'id') ~ '^[0-9]+$' then (to_jsonb(c)->>'id')::bigint
          else null
        end as comment_id,
        c.created_at
      from public.comments c
      join public.posts p on p.id = c.post_id
      where c.%2$I is not null
        and p.%1$I is not null
        and (c.parent_id is null or c.parent_id::text = '')
        and c.%2$I != p.%1$I%3$s
        and not exists (
          select 1
          from public.notifications n
          where n.user_id = p.%1$I
            and n.type = 'comment_on_post'
            and n.post_id = c.post_id
            and n.actor_id = c.%2$I
            and (
              coalesce(n.comment_id::text, '') = coalesce((to_jsonb(c)->>'id'), '')
              or (
                n.comment_id is null
                and abs(extract(epoch from (n.created_at - c.created_at))) < 60
              )
            )
        );
      $sql$,
      posts_author_col,
      comments_author_col,
      comment_blocks_clause
    );

    execute comment_backfill_sql;

    reply_backfill_sql := format(
      $sql$
      insert into public.notifications (user_id, type, actor_id, post_id, comment_id, created_at)
      select distinct
        pc.%1$I as user_id,
        'comment_on_comment'::text as type,
        c.%1$I as actor_id,
        c.post_id,
        case
          when (to_jsonb(c)->>'id') ~ '^[0-9]+$' then (to_jsonb(c)->>'id')::bigint
          else null
        end as comment_id,
        c.created_at
      from public.comments c
      join public.comments pc on pc.id::text = c.parent_id::text
      where c.%1$I is not null
        and pc.%1$I is not null
        and c.parent_id is not null
        and c.parent_id::text <> ''
        and c.%1$I != pc.%1$I%2$s
        and not exists (
          select 1
          from public.notifications n
          where n.user_id = pc.%1$I
            and n.type = 'comment_on_comment'
            and n.post_id = c.post_id
            and n.actor_id = c.%1$I
            and (
              coalesce(n.comment_id::text, '') = coalesce((to_jsonb(c)->>'id'), '')
              or (
                n.comment_id is null
                and abs(extract(epoch from (n.created_at - c.created_at))) < 60
              )
            )
        );
      $sql$,
      comments_author_col,
      reply_blocks_clause
    );

    execute reply_backfill_sql;
  else
    raise notice 'Could not resolve comments author column; skipping comment notification backfill.';
  end if;

  reaction_backfill_sql := format(
    $sql$
    insert into public.notifications (user_id, type, actor_id, post_id, created_at)
    select distinct
      p.%1$I as user_id,
      'reaction_on_post'::text as type,
      pr.user_id as actor_id,
      pr.post_id,
      pr.created_at
    from public.post_reactions pr
    join public.posts p on p.id = pr.post_id
    where pr.user_id is not null
      and p.%1$I is not null
      and pr.user_id != p.%1$I%2$s
      and not exists (
        select 1
        from public.notifications n
        where n.user_id = p.%1$I
          and n.type = 'reaction_on_post'
          and n.post_id = pr.post_id
          and n.actor_id = pr.user_id
      );
    $sql$,
    posts_author_col,
    reaction_blocks_clause
  );

  execute reaction_backfill_sql;
end;
$$;

commit;

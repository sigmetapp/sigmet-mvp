-- Track username history so SW connections remain stable across nickname changes
-- and update mention extraction to honor historical usernames.
begin;

-- Create table to store username history snapshots
create table if not exists public.profile_username_history (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  username text not null,
  normalized_username text not null,
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  changed_by uuid references auth.users(id),
  change_source text,
  created_at timestamptz not null default now()
);

create index if not exists profile_username_history_user_id_idx
  on public.profile_username_history(user_id);

create index if not exists profile_username_history_normalized_idx
  on public.profile_username_history(normalized_username, valid_from desc);

create unique index if not exists profile_username_history_active_unique
  on public.profile_username_history(user_id, normalized_username)
  where valid_to is null;

alter table public.profile_username_history enable row level security;

drop policy if exists "profile_username_history_read" on public.profile_username_history;
create policy "profile_username_history_read"
  on public.profile_username_history
  for select
  using (true);

-- Function to log username changes into history table
drop trigger if exists profiles_username_history_au on public.profiles;
drop function if exists public.log_profile_username_history() cascade;
create or replace function public.log_profile_username_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  change_time timestamptz := now();
  old_username text;
  new_username text;
  normalized_old text;
  normalized_new text;
  source text;
begin
  if tg_op = 'INSERT' then
    new_username := nullif(trim(coalesce(new.username, '')), '');

    if new_username is not null then
      normalized_new := lower(new_username);
      source := 'insert';

      insert into public.profile_username_history (
        user_id,
        username,
        normalized_username,
        valid_from,
        changed_by,
        change_source,
        created_at
      )
      values (
        new.user_id,
        new_username,
        normalized_new,
        coalesce(new.created_at, change_time),
        actor_id,
        source,
        change_time
      )
      on conflict (user_id, normalized_username, valid_from) do nothing;
    end if;

    return new;
  end if;

  if tg_op = 'UPDATE' then
    old_username := nullif(trim(coalesce(old.username, '')), '');
    new_username := nullif(trim(coalesce(new.username, '')), '');

    if (old_username is distinct from new_username) then
      if old_username is not null then
        normalized_old := lower(old_username);

        update public.profile_username_history
        set valid_to = change_time
        where user_id = new.user_id
          and normalized_username = normalized_old
          and valid_to is null;
      end if;

      if new_username is not null then
        normalized_new := lower(new_username);
        source := case
          when old_username is null then 'username_set'
          when actor_id is null then 'username_update_system'
          when actor_id = new.user_id then 'username_update_self'
          else 'username_update'
        end;

        insert into public.profile_username_history (
          user_id,
          username,
          normalized_username,
          valid_from,
          changed_by,
          change_source,
          created_at
        )
        values (
          new.user_id,
          new_username,
          normalized_new,
          change_time,
          actor_id,
          source,
          change_time
        )
        on conflict (user_id, normalized_username, valid_from) do nothing;
      end if;
    end if;

    return new;
  end if;

  return new;
end;
$$;

-- Trigger to capture username history on insert/update
drop trigger if exists profiles_username_history_au on public.profiles;
create trigger profiles_username_history_au
  after insert or update on public.profiles
  for each row
  execute function public.log_profile_username_history();

-- Backfill existing usernames into history
insert into public.profile_username_history (
  user_id,
  username,
  normalized_username,
  valid_from,
  changed_by,
  change_source,
  created_at
)
select
  p.user_id,
  p.username,
  lower(trim(p.username)),
  coalesce(p.created_at, now()),
  null,
  'backfill',
  now()
from public.profiles p
where p.username is not null
  and trim(p.username) <> ''
  and not exists (
    select 1
    from public.profile_username_history h
    where h.user_id = p.user_id
      and h.normalized_username = lower(trim(p.username))
      and h.valid_to is null
  );

-- Refresh mention extraction to leverage username history
drop function if exists public.extract_mentions_from_post(text, uuid, bigint);
create or replace function public.extract_mentions_from_post(
  post_text text,
  post_author_id uuid,
  target_post_id bigint,
  target_post_created_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  username_match text;
  normalized_username_match text;
  user_id_found uuid;
  current_user_id uuid := post_author_id;
  text_lower text;
  matches text[];
  match_record text;
  processed_usernames text[] := array[]::text[];
  effective_post_time timestamptz := coalesce(target_post_created_at, now());
begin
  if post_text is null or trim(post_text) = '' then
    return;
  end if;

  if post_author_id is null then
    return;
  end if;

  text_lower := lower(post_text);

  -- Handle @username mentions
  select array_agg(match[1]) into matches
  from regexp_matches(text_lower, '@([a-z0-9_.-]+)', 'g') as match;

  if matches is not null then
    foreach match_record in array matches loop
      normalized_username_match := lower(trim(match_record));

      if normalized_username_match is null or normalized_username_match = '' then
        continue;
      end if;

      if processed_usernames is not null and normalized_username_match = any(processed_usernames) then
        continue;
      end if;

      processed_usernames := array_append(processed_usernames, normalized_username_match);

      select user_id into user_id_found
      from public.profiles
      where lower(trim(username)) = normalized_username_match
      limit 1;

      if user_id_found is null then
        select user_id into user_id_found
        from public.profile_username_history
        where normalized_username = normalized_username_match
          and valid_from <= effective_post_time
          and (valid_to is null or valid_to >= effective_post_time)
        order by valid_from desc
        limit 1;
      end if;

      if user_id_found is not null and user_id_found <> current_user_id then
        insert into public.user_connections (user_id, connected_user_id, post_id, connection_type)
        values (user_id_found, current_user_id, target_post_id, 'they_mentioned_me')
        on conflict on constraint user_connections_user_id_connected_user_id_post_id_connecti_key do nothing;

        insert into public.user_connections (user_id, connected_user_id, post_id, connection_type)
        values (current_user_id, user_id_found, target_post_id, 'i_mentioned_them')
        on conflict on constraint user_connections_user_id_connected_user_id_post_id_connecti_key do nothing;
      end if;
    end loop;
  end if;

  -- Handle /u/username mentions
  select array_agg(match[1]) into matches
  from regexp_matches(text_lower, '/u/([a-z0-9_.-]+)(\s|$|\n|/)', 'g') as match;

  if matches is not null then
    foreach match_record in array matches loop
      normalized_username_match := lower(trim(match_record));

      if normalized_username_match is null or normalized_username_match = '' then
        continue;
      end if;

      if processed_usernames is not null and normalized_username_match = any(processed_usernames) then
        continue;
      end if;

      processed_usernames := array_append(processed_usernames, normalized_username_match);

      select user_id into user_id_found
      from public.profiles
      where lower(trim(username)) = normalized_username_match
      limit 1;

      if user_id_found is null then
        select user_id into user_id_found
        from public.profile_username_history
        where normalized_username = normalized_username_match
          and valid_from <= effective_post_time
          and (valid_to is null or valid_to >= effective_post_time)
        order by valid_from desc
        limit 1;
      end if;

      if user_id_found is not null and user_id_found <> current_user_id then
        insert into public.user_connections (user_id, connected_user_id, post_id, connection_type)
        values (user_id_found, current_user_id, target_post_id, 'they_mentioned_me')
        on conflict on constraint user_connections_user_id_connected_user_id_post_id_connecti_key do nothing;

        insert into public.user_connections (user_id, connected_user_id, post_id, connection_type)
        values (current_user_id, user_id_found, target_post_id, 'i_mentioned_them')
        on conflict on constraint user_connections_user_id_connected_user_id_post_id_connecti_key do nothing;
      end if;
    end loop;
  end if;

  -- Handle /u/{uuid} mentions
  select array_agg(match[1]) into matches
  from regexp_matches(text_lower, '/u/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(\s|$|\n|/)', 'gi') as match;

  if matches is not null then
    foreach match_record in array matches loop
      begin
        user_id_found := match_record::uuid;

        if user_id_found is not null
           and user_id_found <> current_user_id
           and exists (select 1 from auth.users where id = user_id_found) then
          insert into public.user_connections (user_id, connected_user_id, post_id, connection_type)
          values (user_id_found, current_user_id, target_post_id, 'they_mentioned_me')
          on conflict on constraint user_connections_user_id_connected_user_id_post_id_connecti_key do nothing;

          insert into public.user_connections (user_id, connected_user_id, post_id, connection_type)
          values (current_user_id, user_id_found, target_post_id, 'i_mentioned_them')
          on conflict on constraint user_connections_user_id_connected_user_id_post_id_connecti_key do nothing;
        end if;
      exception
        when others then
          null;
      end;
    end loop;
  end if;
end;
$$;

-- Update trigger helper to pass post created time into mention extraction
do $$
declare
  author_col text;
  has_created_at boolean;
  created_at_expr text;
begin
  author_col := public._get_posts_author_column();

  if author_col is null then
    raise notice 'No author column detected on posts table, skipping trigger recreation';
    return;
  end if;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'posts'
      and column_name = 'created_at'
  ) into has_created_at;

  created_at_expr := case
    when has_created_at then 'coalesce(new.created_at, now())'
    else 'now()'
  end;

  execute format($fn$
    create or replace function public.update_connections_on_post()
    returns trigger
    language plpgsql
    security definer
    set search_path = public
    as $trigger$
    declare
      post_data jsonb;
      post_text text;
      post_author_id uuid;
      post_id_val bigint;
      post_created_at timestamptz;
    begin
      post_id_val := new.id;
      post_data := to_jsonb(new);

      post_text := coalesce(
        nullif(trim(post_data->>'text'), ''),
        nullif(trim(post_data->>'body'), ''),
        nullif(trim(post_data->>'content'), ''),
        nullif(trim(post_data->>'raw_text'), '')
      );

      post_author_id := nullif(post_data->>%1$L, '')::uuid;
      post_created_at := %2$s;

      delete from public.user_connections where post_id = post_id_val;

      if post_text is not null and post_author_id is not null then
        perform public.extract_mentions_from_post(post_text, post_author_id, post_id_val, post_created_at);
      end if;

      return new;
    end;
    $trigger$;
  $fn$, author_col, created_at_expr);
end $$;

drop trigger if exists post_connections_trigger on public.posts;
create trigger post_connections_trigger
  after insert or update on public.posts
  for each row
  execute function public.update_connections_on_post();

-- Re-process posts to rebuild connection data with history-aware mentions
do $$
declare
  author_col text;
  has_text boolean;
  has_body boolean;
  has_content boolean;
  has_raw_text boolean;
  text_expr_parts text[];
  regex_parts text[];
  nonempty_parts text[];
  text_expr text;
  regex_condition text;
  nonempty_condition text;
  query text;
  post_record record;
  processed_count int := 0;
begin
  author_col := public._get_posts_author_column();

  if author_col is null then
    raise notice 'Connections backfill skipped: no author column on posts table';
    return;
  end if;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'posts'
      and column_name = 'text'
  ) into has_text;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'posts'
      and column_name = 'body'
  ) into has_body;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'posts'
      and column_name = 'content'
  ) into has_content;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'posts'
      and column_name = 'raw_text'
  ) into has_raw_text;

  text_expr_parts := array[]::text[];
  regex_parts := array[]::text[];
  nonempty_parts := array[]::text[];

  if has_text then
    text_expr_parts := array_append(text_expr_parts, 'nullif(trim(p.text), '''')');
    regex_parts := array_append(regex_parts, 'p.text ~ ''@[A-Za-z0-9_.-]+''');
    regex_parts := array_append(regex_parts, 'p.text ~ ''/u/[A-Za-z0-9_.-]+''');
    nonempty_parts := array_append(nonempty_parts, '(p.text is not null and trim(p.text) != '''')');
  end if;

  if has_body then
    text_expr_parts := array_append(text_expr_parts, 'nullif(trim(p.body), '''')');
    regex_parts := array_append(regex_parts, 'p.body ~ ''@[A-Za-z0-9_.-]+''');
    regex_parts := array_append(regex_parts, 'p.body ~ ''/u/[A-Za-z0-9_.-]+''');
    nonempty_parts := array_append(nonempty_parts, '(p.body is not null and trim(p.body) != '''')');
  end if;

  if has_content then
    text_expr_parts := array_append(text_expr_parts, 'nullif(trim(p.content), '''')');
    regex_parts := array_append(regex_parts, 'p.content ~ ''@[A-Za-z0-9_.-]+''');
    regex_parts := array_append(regex_parts, 'p.content ~ ''/u/[A-Za-z0-9_.-]+''');
    nonempty_parts := array_append(nonempty_parts, '(p.content is not null and trim(p.content) != '''')');
  end if;

  if has_raw_text then
    text_expr_parts := array_append(text_expr_parts, 'nullif(trim(p.raw_text), '''')');
    regex_parts := array_append(regex_parts, 'p.raw_text ~ ''@[A-Za-z0-9_.-]+''');
    regex_parts := array_append(regex_parts, 'p.raw_text ~ ''/u/[A-Za-z0-9_.-]+''');
    nonempty_parts := array_append(nonempty_parts, '(p.raw_text is not null and trim(p.raw_text) != '''')');
  end if;

  if array_length(text_expr_parts, 1) is null then
    text_expr := 'null';
  else
    text_expr := 'coalesce(' || array_to_string(text_expr_parts, ', ') || ')';
  end if;

  if array_length(regex_parts, 1) is null then
    regex_condition := 'false';
  else
    regex_condition := array_to_string(regex_parts, ' OR ');
  end if;

  if array_length(nonempty_parts, 1) is null then
    nonempty_condition := 'false';
  else
    nonempty_condition := array_to_string(nonempty_parts, ' OR ');
  end if;

  query := format('
    select
      p.id,
      %s as post_text,
      p.%I as post_author_id,
      p.created_at as created_at
    from public.posts p
    where (%s)
      and (%s)
  ', text_expr, author_col, nonempty_condition, regex_condition);

  for post_record in execute query loop
    begin
      delete from public.user_connections where post_id = post_record.id;

      if post_record.post_text is not null and post_record.post_author_id is not null then
        perform public.extract_mentions_from_post(
          post_record.post_text,
          post_record.post_author_id,
          post_record.id,
          post_record.created_at
        );
        processed_count := processed_count + 1;
      end if;
    exception
      when others then
        raise notice 'Backfill error for post %: %', post_record.id, sqlerrm;
    end;
  end loop;

  raise notice 'Username history backfill processed % posts', processed_count;
end $$;

commit;

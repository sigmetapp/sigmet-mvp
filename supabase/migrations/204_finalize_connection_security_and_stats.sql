-- Harden user_connections policies, finalize mention function, and refresh stats
begin;

-- Restrict insert policy to service role and trigger invocations
drop policy if exists "allow all inserts" on public.user_connections;
create policy "allow trigger inserts"
  on public.user_connections
  for insert
  to public
  with check (
    auth.role() = 'service_role'
    or auth.uid() is null
  );

-- Final version of extract_mentions_from_post without excessive logging
create or replace function public.extract_mentions_from_post(
  post_text text,
  post_author_id uuid,
  post_id bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  username_match text;
  user_id_found uuid;
  current_user_id uuid;
  text_lower text;
  matches text[];
  match_record text;
begin
  current_user_id := post_author_id;

  if post_text is null or trim(post_text) = '' then
    return;
  end if;

  if post_author_id is null then
    return;
  end if;

  text_lower := lower(post_text);

  -- Handle @username mentions
  select array_agg(match[1]) into matches
  from regexp_matches(text_lower, '@([a-z0-9_]+)', 'g') as match;

  if matches is not null then
    foreach match_record in array matches loop
      username_match := match_record;

      select user_id into user_id_found
      from public.profiles
      where lower(trim(username)) = lower(trim(username_match))
        and username is not null
        and username <> ''
      limit 1;

      if user_id_found is not null and user_id_found <> current_user_id then
        insert into public.user_connections (user_id, connected_user_id, post_id, connection_type)
        values (user_id_found, current_user_id, post_id, 'they_mentioned_me')
        on conflict (user_id, connected_user_id, post_id, connection_type) do nothing;

        insert into public.user_connections (user_id, connected_user_id, post_id, connection_type)
        values (current_user_id, user_id_found, post_id, 'i_mentioned_them')
        on conflict (user_id, connected_user_id, post_id, connection_type) do nothing;
      end if;
    end loop;
  end if;

  -- Handle /u/username mentions
  select array_agg(match[1]) into matches
  from regexp_matches(text_lower, '/u/([a-z0-9_]+)(\s|$|\n|/)', 'g') as match;

  if matches is not null then
    foreach match_record in array matches loop
      username_match := match_record;

      select user_id into user_id_found
      from public.profiles
      where lower(trim(username)) = lower(trim(username_match))
        and username is not null
        and username <> ''
      limit 1;

      if user_id_found is not null and user_id_found <> current_user_id then
        insert into public.user_connections (user_id, connected_user_id, post_id, connection_type)
        values (user_id_found, current_user_id, post_id, 'they_mentioned_me')
        on conflict (user_id, connected_user_id, post_id, connection_type) do nothing;

        insert into public.user_connections (user_id, connected_user_id, post_id, connection_type)
        values (current_user_id, user_id_found, post_id, 'i_mentioned_them')
        on conflict (user_id, connected_user_id, post_id, connection_type) do nothing;
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
          values (user_id_found, current_user_id, post_id, 'they_mentioned_me')
          on conflict (user_id, connected_user_id, post_id, connection_type) do nothing;

          insert into public.user_connections (user_id, connected_user_id, post_id, connection_type)
          values (current_user_id, user_id_found, post_id, 'i_mentioned_them')
          on conflict (user_id, connected_user_id, post_id, connection_type) do nothing;
        end if;
      exception
        when others then
          -- Ignore malformed UUIDs
          null;
      end;
    end loop;
  end if;
end;
$$;

-- Recreate trigger function to consume author id correctly
do $$
declare
  author_col text;
begin
  author_col := public._get_posts_author_column();

  if author_col is null then
    raise notice 'No author column detected on posts table, skipping trigger recreation';
    return;
  end if;

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
    begin
      post_id_val := new.id;
      post_data := to_jsonb(new);

      post_text := coalesce(
        nullif(trim(post_data->>'text'), ''),
        nullif(trim(post_data->>'body'), ''),
        nullif(trim(post_data->>'content'), ''),
        nullif(trim(post_data->>'raw_text'), '')
      );

      post_author_id := nullif(post_data->>%L, '')::uuid;

      delete from public.user_connections where post_id = post_id_val;

      if post_text is not null and post_author_id is not null then
        perform public.extract_mentions_from_post(post_text, post_author_id, post_id_val);
      end if;

      return new;
    end;
    $trigger$;
  $fn$, author_col);
end $$;

drop trigger if exists post_connections_trigger on public.posts;
create trigger post_connections_trigger
  after insert or update on public.posts
  for each row
  execute function public.update_connections_on_post();

-- Enhanced stats function with precalculated first/repeat totals
drop function if exists public.get_user_connection_stats(uuid);
create or replace function public.get_user_connection_stats(target_user_id uuid)
returns table (
  total_count bigint,
  unique_connections bigint,
  first_connection_count bigint,
  repeat_connection_count bigint,
  they_mention_count bigint,
  i_mention_count bigint
)
language sql
stable
as $$
  with metrics as (
    select
      count(*)::bigint as total_count,
      count(distinct connected_user_id)::bigint as unique_connections,
      count(*) filter (where connection_type = 'they_mentioned_me')::bigint as they_mention_count,
      count(*) filter (where connection_type = 'i_mentioned_them')::bigint as i_mention_count
    from public.user_connections
    where user_id = target_user_id
  )
  select
    total_count,
    unique_connections,
    least(total_count, unique_connections) as first_connection_count,
    greatest(total_count - least(total_count, unique_connections), 0)::bigint as repeat_connection_count,
    they_mention_count,
    i_mention_count
  from metrics;
$$;

-- Backfill existing posts with mentions to populate connection table
do $$
declare
  author_col text;
  has_text boolean;
  has_body boolean;
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
    raise notice 'Backfill skipped: no author column on posts table';
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

  text_expr_parts := array[]::text[];
  regex_parts := array[]::text[];
  nonempty_parts := array[]::text[];

  if has_text then
    text_expr_parts := array_append(text_expr_parts, 'nullif(trim(p.text), '''')');
    regex_parts := array_append(regex_parts, 'p.text ~ ''@[A-Za-z0-9_]+''');
    regex_parts := array_append(regex_parts, 'p.text ~ ''/u/[A-Za-z0-9_]+''');
    nonempty_parts := array_append(nonempty_parts, '(p.text is not null and trim(p.text) != '''')');
  end if;

  if has_body then
    text_expr_parts := array_append(text_expr_parts, 'nullif(trim(p.body), '''')');
    regex_parts := array_append(regex_parts, 'p.body ~ ''@[A-Za-z0-9_]+''');
    regex_parts := array_append(regex_parts, 'p.body ~ ''/u/[A-Za-z0-9_]+''');
    nonempty_parts := array_append(nonempty_parts, '(p.body is not null and trim(p.body) != '''')');
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
      p.%I as post_author_id
    from public.posts p
    where (%s)
      and (%s)
    order by p.created_at desc
  ', text_expr, author_col, nonempty_condition, regex_condition);

  for post_record in execute query loop
    begin
      delete from public.user_connections where post_id = post_record.id;

      if post_record.post_text is not null and post_record.post_author_id is not null then
        perform public.extract_mentions_from_post(
          post_record.post_text,
          post_record.post_author_id,
          post_record.id
        );
        processed_count := processed_count + 1;
      end if;
    exception
      when others then
        raise notice 'Backfill error for post %: %', post_record.id, sqlerrm;
    end;
  end loop;

  raise notice 'Connections backfill processed % posts', processed_count;
end $$;

-- Diagnostics
select
  count(*) as total_connections,
  count(distinct post_id) as posts_with_connections,
  count(distinct user_id) as users_with_connections
from public.user_connections;

commit;

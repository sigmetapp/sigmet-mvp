-- Fix author lookup in connections trigger and provide diagnostics
begin;

do $$
declare
  author_col text;
begin
  author_col := public._get_posts_author_column();

  if author_col is null then
    raise notice 'No author column detected on posts table, skipping update';
    return;
  end if;

  -- Recreate trigger function with correct JSON key lookup for author column
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

-- Re-run backfill for posts that currently have no connections recorded
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
    raise notice 'No author column detected on posts table, skipping backfill';
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
      and not exists (
        select 1
        from public.user_connections uc
        where uc.post_id = p.id
      )
    order by p.created_at desc
  ', text_expr, author_col, nonempty_condition, regex_condition);

  for post_record in execute query loop
    begin
      perform public.extract_mentions_from_post(
        post_record.post_text,
        post_record.post_author_id,
        post_record.id
      );
      processed_count := processed_count + 1;
    exception
      when others then
        raise notice 'Backfill error for post %: %', post_record.id, sqlerrm;
    end;
  end loop;

  raise notice 'Backfill processed % posts missing connections', processed_count;
end $$;

-- Quick diagnostics to help verify connection data
select
  count(*) as total_connections,
  count(distinct post_id) as posts_with_connections,
  count(distinct user_id) as users_with_connections
from public.user_connections;

select
  user_id,
  count(*) as connections,
  count(distinct connected_user_id) as unique_people
from public.user_connections
group by user_id
order by connections desc
limit 20;

commit;

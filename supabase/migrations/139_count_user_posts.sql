begin;

create or replace function public.count_user_posts(
  user_uuid uuid,
  since timestamptz default null
)
returns bigint
language plpgsql
security definer
stable
as $$
declare
  posts_column text;
  result bigint := 0;
begin
  select column_name
    into posts_column
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'posts'
    and column_name in ('author_id', 'user_id')
  order by case when column_name = 'author_id' then 0 else 1 end
  limit 1;

  if posts_column is null then
    return 0;
  end if;

  if since is null then
    execute format(
      'select count(*) from public.posts where %I = $1',
      posts_column
    )
    into result
    using user_uuid;
  else
    execute format(
      'select count(*) from public.posts where %I = $1 and created_at >= $2',
      posts_column
    )
    into result
    using user_uuid, since;
  end if;

  return coalesce(result, 0);
end;
$$;

commit;

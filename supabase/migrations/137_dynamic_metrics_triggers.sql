-- Align metrics triggers with posts/comments schemas that use either author_id or user_id

create or replace function public.resolve_user_reference_column(table_name_input text)
returns text
language sql
stable
as $$
  select column_name
  from information_schema.columns
  where table_schema = 'public'
    and table_name = table_name_input
    and column_name in ('author_id', 'user_id')
  order by case when column_name = 'author_id' then 0 else 1 end
  limit 1
$$;

create or replace function public.update_metrics_on_post_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid;
begin
  if TG_OP = 'INSERT' then
    actor_id := coalesce(
      nullif((to_jsonb(NEW)->>'author_id'), '')::uuid,
      nullif((to_jsonb(NEW)->>'user_id'), '')::uuid
    );

    if actor_id is null then
      return NEW;
    end if;

    perform public.initialize_user_metrics(actor_id);

    update public.user_metrics
    set total_posts = total_posts + 1,
        updated_at = now()
    where user_id = actor_id;

    if coalesce(NEW.created_at, now()) >= now() - interval '30 days' then
      update public.user_metrics
      set total_posts_last_30d = total_posts_last_30d + 1,
          updated_at = now()
      where user_id = actor_id;
    end if;

    return NEW;
  elsif TG_OP = 'DELETE' then
    actor_id := coalesce(
      nullif((to_jsonb(OLD)->>'author_id'), '')::uuid,
      nullif((to_jsonb(OLD)->>'user_id'), '')::uuid
    );

    if actor_id is null then
      return OLD;
    end if;

    update public.user_metrics
    set total_posts = greatest(0, total_posts - 1),
        updated_at = now()
    where user_id = actor_id;

    return OLD;
  end if;

  return null;
end;
$$;

create or replace function public.update_metrics_on_comment_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  commenter_id uuid;
  post_author_id uuid;
  posts_author_column text := public.resolve_user_reference_column('posts');
  comments_author_column text := coalesce(
    public.resolve_user_reference_column('comments'),
    public.resolve_user_reference_column('posts')
  );
  commenter_count integer;
  thread_comment_count integer;
begin
  if posts_author_column is null then
    raise exception 'Unable to resolve author/user column for public.posts';
  end if;

  if comments_author_column is null then
    raise exception 'Unable to resolve author/user column for public.comments';
  end if;

  if TG_OP = 'INSERT' then
    commenter_id := coalesce(
      nullif((to_jsonb(NEW)->>'author_id'), '')::uuid,
      nullif((to_jsonb(NEW)->>'user_id'), '')::uuid
    );

    if commenter_id is null then
      return NEW;
    end if;

    execute format('select %I from public.posts where id = $1', posts_author_column)
      into post_author_id
      using NEW.post_id;

    perform public.initialize_user_metrics(commenter_id);
    if post_author_id is not null then
      perform public.initialize_user_metrics(post_author_id);
    end if;

    update public.user_metrics
    set total_comments = total_comments + 1,
        updated_at = now()
    where user_id = commenter_id;

    if post_author_id is not null and post_author_id != commenter_id then
      update public.user_metrics
      set comments_on_others_posts = comments_on_others_posts + 1,
          updated_at = now()
      where user_id = commenter_id;

      execute format(
        'select coalesce(count(distinct c.%1$I), 0)
         from public.comments c
         join public.posts p on p.id = c.post_id
         where p.%2$I = $1
           and c.%1$I != $1',
        comments_author_column,
        posts_author_column
      )
      into commenter_count
      using post_author_id;

      update public.user_metrics
      set distinct_commenters = commenter_count,
          updated_at = now()
      where user_id = post_author_id;
    end if;

    execute format(
      'select count(*)
       from public.comments
       where post_id = $1
         and %I = $2',
      comments_author_column
    )
    into thread_comment_count
    using NEW.post_id, commenter_id;

    if thread_comment_count = 10 then
      update public.user_metrics
      set threads_with_10_comments = threads_with_10_comments + 1,
          updated_at = now()
      where user_id = commenter_id;
    end if;

    return NEW;
  elsif TG_OP = 'DELETE' then
    commenter_id := coalesce(
      nullif((to_jsonb(OLD)->>'author_id'), '')::uuid,
      nullif((to_jsonb(OLD)->>'user_id'), '')::uuid
    );

    if commenter_id is null then
      return OLD;
    end if;

    execute format('select %I from public.posts where id = $1', posts_author_column)
      into post_author_id
      using OLD.post_id;

    update public.user_metrics
    set total_comments = greatest(0, total_comments - 1),
        updated_at = now()
    where user_id = commenter_id;

    if post_author_id is not null and post_author_id != commenter_id then
      update public.user_metrics
      set comments_on_others_posts = greatest(0, comments_on_others_posts - 1),
          updated_at = now()
      where user_id = commenter_id;

      execute format(
        'select coalesce(count(distinct c.%1$I), 0)
         from public.comments c
         join public.posts p on p.id = c.post_id
         where p.%2$I = $1
           and c.%1$I != $1',
        comments_author_column,
        posts_author_column
      )
      into commenter_count
      using post_author_id;

      update public.user_metrics
      set distinct_commenters = commenter_count,
          updated_at = now()
      where user_id = post_author_id;
    end if;

    return OLD;
  end if;

  return null;
end;
$$;

create or replace function public.update_metrics_on_like_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  liker_id uuid;
  post_author_id uuid;
  posts_author_column text := public.resolve_user_reference_column('posts');
begin
  if posts_author_column is null then
    raise exception 'Unable to resolve author/user column for public.posts';
  end if;

  if TG_OP = 'INSERT' then
    liker_id := nullif((to_jsonb(NEW)->>'user_id'), '')::uuid;

    if liker_id is null then
      return NEW;
    end if;

    execute format('select %I from public.posts where id = $1', posts_author_column)
      into post_author_id
      using NEW.post_id;

    perform public.initialize_user_metrics(liker_id);
    if post_author_id is not null then
      perform public.initialize_user_metrics(post_author_id);
    end if;

    update public.user_metrics
    set likes_given = likes_given + 1,
        updated_at = now()
    where user_id = liker_id;

    if post_author_id is not null and post_author_id != liker_id then
      update public.user_metrics
      set likes_received = likes_received + 1,
          updated_at = now()
      where user_id = post_author_id;
    end if;

    return NEW;
  elsif TG_OP = 'DELETE' then
    liker_id := nullif((to_jsonb(OLD)->>'user_id'), '')::uuid;

    if liker_id is null then
      return OLD;
    end if;

    execute format('select %I from public.posts where id = $1', posts_author_column)
      into post_author_id
      using OLD.post_id;

    update public.user_metrics
    set likes_given = greatest(0, likes_given - 1),
        updated_at = now()
    where user_id = liker_id;

    if post_author_id is not null and post_author_id != liker_id then
      update public.user_metrics
      set likes_received = greatest(0, likes_received - 1),
          updated_at = now()
      where user_id = post_author_id;
    end if;

    return OLD;
  end if;

  return null;
end;
$$;

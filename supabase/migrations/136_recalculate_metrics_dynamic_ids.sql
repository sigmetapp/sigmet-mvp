-- Ensure recalculate_user_metrics works when legacy tables use user_id instead of author_id
create or replace function public.recalculate_user_metrics(
  user_uuid uuid default null,
  recalc_all boolean default false
)
returns integer
language plpgsql
security definer
as $$
declare
  affected_users integer := 0;
  user_record record;
  posts_last_30d integer := 0;
  total_active_days integer := 0;
  consecutive_days integer := 0;
  weekly_active_weeks integer := 0;
  distinct_commenters_count integer := 0;
  threads_10_comments_count integer := 0;
  likes_received_count integer := 0;
  posts_author_column text;
  comments_author_column text;
  activity_dates date[];
  prev_activity_date date;
  current_activity_date date;
  streak integer := 0;
  idx integer;
  active_days_sql text;
  weekly_sql text;
begin
  -- Determine which column to use for associating posts/comments with authors
  select column_name
    into posts_author_column
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'posts'
    and column_name in ('author_id', 'user_id')
  order by case when column_name = 'author_id' then 0 else 1 end
  limit 1;

  if posts_author_column is null then
    raise exception 'Unable to find author/user column on public.posts table';
  end if;

  select column_name
    into comments_author_column
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'comments'
    and column_name in ('author_id', 'user_id')
  order by case when column_name = 'author_id' then 0 else 1 end
  limit 1;

  if comments_author_column is null then
    comments_author_column := posts_author_column;
  end if;

  -- Ensure user_metrics exists for all users when doing a global recalculation
  if recalc_all then
    insert into public.user_metrics (user_id)
    select id
    from auth.users
    where not exists (
      select 1 from public.user_metrics um where um.user_id = auth.users.id
    );
  end if;

  if user_uuid is not null then
    for user_record in
      select id from auth.users where id = user_uuid
    loop
      -- Always ensure the metrics row exists for the user we are recalculating
      perform public.initialize_user_metrics(user_record.id);

      -- Reset per-user aggregates
      posts_last_30d := 0;
      total_active_days := 0;
      consecutive_days := 0;
      weekly_active_weeks := 0;
      distinct_commenters_count := 0;
      threads_10_comments_count := 0;
      likes_received_count := 0;
      activity_dates := null;
      prev_activity_date := null;
      streak := 0;

      -- Posts in the last 30 days
      begin
        execute format(
          'select count(*) from public.posts where %I = $1 and created_at >= now() - interval ''30 days''',
          posts_author_column
        )
        into posts_last_30d
        using user_record.id;
      exception
        when others then
          posts_last_30d := 0;
      end;

      -- Collect activity dates (posts + comments)
      begin
        active_days_sql := format(
          'select array_agg(activity_date order by activity_date desc)
           from (
             select distinct date_trunc(''day'', created_at)::date as activity_date
             from (
               select created_at from public.posts where %1$I = $1
               union all
               select created_at from public.comments where %2$I = $1
             ) as combined
           ) as activity',
          posts_author_column,
          comments_author_column
        );

        execute active_days_sql
        into activity_dates
        using user_record.id;
      exception
        when others then
          activity_dates := null;
      end;

      total_active_days := coalesce(array_length(activity_dates, 1), 0);

      -- Current consecutive active-day streak (most recent backwards)
      if activity_dates is not null and array_length(activity_dates, 1) > 0 then
        streak := 0;
        prev_activity_date := null;

        for idx in array_lower(activity_dates, 1)..array_upper(activity_dates, 1) loop
          current_activity_date := activity_dates[idx];

          if prev_activity_date is null then
            streak := 1;
          elsif prev_activity_date = current_activity_date then
            continue;
          elsif prev_activity_date - current_activity_date = 1 then
            streak := streak + 1;
          else
            exit;
          end if;

          prev_activity_date := current_activity_date;
        end loop;

        consecutive_days := streak;
      else
        consecutive_days := 0;
      end if;

      -- Weekly active streak (unique active weeks in last 8 weeks)
      begin
        weekly_sql := format(
          'select coalesce(count(distinct date_trunc(''week'', created_at)::date), 0)
           from (
             select created_at from public.posts where %1$I = $1 and created_at >= now() - interval ''8 weeks''
             union all
             select created_at from public.comments where %2$I = $1 and created_at >= now() - interval ''8 weeks''
           ) as weekly_activity',
          posts_author_column,
          comments_author_column
        );

        execute weekly_sql
        into weekly_active_weeks
        using user_record.id;
      exception
        when others then
          weekly_active_weeks := 0;
      end;

      -- Distinct commenters on the user's posts (excluding self)
      begin
        execute format(
          'select coalesce(count(distinct c.%1$I), 0)
           from public.comments c
           join public.posts p on p.id = c.post_id
           where p.%2$I = $1
             and c.%1$I != $1',
          comments_author_column,
          posts_author_column
        )
        into distinct_commenters_count
        using user_record.id;
      exception
        when others then
          distinct_commenters_count := 0;
      end;

      -- Threads where the user has 10+ comments
      begin
        execute format(
          'select coalesce(count(*), 0)
           from (
             select post_id
             from public.comments
             where %1$I = $1
             group by post_id
             having count(*) >= 10
           ) as threads',
          comments_author_column
        )
        into threads_10_comments_count
        using user_record.id;
      exception
        when others then
          threads_10_comments_count := 0;
      end;

      -- Total likes received on posts
      begin
        execute format(
          'select coalesce(count(*), 0)
           from public.post_reactions pr
           join public.posts p on p.id = pr.post_id
           where p.%1$I = $1',
          posts_author_column
        )
        into likes_received_count
        using user_record.id;
      exception
        when others then
          likes_received_count := 0;
      end;

      -- Persist recalculated metrics
      update public.user_metrics
      set
        total_posts_last_30d = posts_last_30d,
        active_days = total_active_days,
        consecutive_active_days = consecutive_days,
        weekly_active_streak = weekly_active_weeks,
        distinct_commenters = distinct_commenters_count,
        threads_with_10_comments = threads_10_comments_count,
        likes_received = likes_received_count,
        earned_badges_count = (
          select count(*) from public.user_badges where user_id = user_record.id
        ),
        updated_at = now()
      where user_id = user_record.id;

      -- Re-evaluate badges based on refreshed metrics
      perform public.evaluate_user_badges(user_record.id);

      affected_users := affected_users + 1;
    end loop;
  elsif recalc_all then
    for user_record in
      select distinct user_id as id
      from public.user_metrics
      where updated_at >= now() - interval '24 hours'
    loop
      affected_users := affected_users + coalesce(public.recalculate_user_metrics(user_record.id, false), 0);
    end loop;
  end if;

  return affected_users;
end;
$$;

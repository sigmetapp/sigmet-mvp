-- Daily backfill function for user metrics and badge evaluation
-- This recalculates derived metrics that can't be updated incrementally

-- Function to recalculate derived metrics for all users (or specific user)
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
  posts_count_30d integer;
  active_days_count integer;
  distinct_commenters_count integer;
  threads_10_comments_count integer;
  total_likes_received integer;
begin
  -- Initialize metrics for all users if needed (only if recalc_all)
  if recalc_all then
    insert into public.user_metrics (user_id)
    select id from auth.users
    where not exists (
      select 1 from public.user_metrics where user_metrics.user_id = auth.users.id
    );
  end if;
  
  -- Process users
  if user_uuid is not null then
    -- Single user
    for user_record in
      select id from auth.users where id = user_uuid
    loop
      -- Recalculate total_posts_last_30d
      select count(*) into posts_count_30d
      from public.posts
      where author_id = user_record.id
        and created_at >= now() - interval '30 days';
      
      -- Recalculate active_days (days with at least one post or comment)
      select count(distinct date_trunc('day', activity_date)) into active_days_count
      from (
        select created_at::date as activity_date from public.posts where author_id = user_record.id
        union
        select created_at::date as activity_date from public.comments where author_id = user_record.id
      ) as activity;
      
      -- Recalculate consecutive_active_days
      -- This is a simplified version - for production, consider a more sophisticated calculation
      -- For now, we'll set it based on recent activity
      select coalesce(max(streak), 0) into active_days_count
      from (
        with daily_activity as (
          select date_trunc('day', created_at)::date as day
          from public.posts
          where author_id = user_record.id
          union
          select date_trunc('day', created_at)::date as day
          from public.comments
          where author_id = user_record.id
        ),
        ordered_days as (
          select day, row_number() over (order by day desc) as rn
          from daily_activity
        ),
        streaks as (
          select day, rn, day - (rn || ' days')::interval::date as streak_group
          from ordered_days
        )
        select streak_group, count(*) as streak
        from streaks
        group by streak_group
        having count(*) >= (
          select count(*)
          from streaks s2
          where s2.streak_group = streaks.streak_group
            and s2.day >= current_date - (select count(*) from streaks s3 where s3.streak_group = streaks.streak_group)::integer
        )
        order by count(*) desc
        limit 1
      ) as streak_calc;
      
      -- For simplicity, calculate consecutive_active_days as days with activity in last week
      select count(*) into active_days_count
      from (
        select distinct date_trunc('day', created_at)::date as day
        from (
          select created_at from public.posts where author_id = user_record.id and created_at >= now() - interval '30 days'
          union all
          select created_at from public.comments where author_id = user_record.id and created_at >= now() - interval '30 days'
        ) as recent_activity
        where day >= current_date - 30
      ) as recent_days;
      
      -- Simplified consecutive days: count how many days in a row from today backwards have activity
      with recent_activity as (
        select distinct date_trunc('day', created_at)::date as activity_date
        from (
          select created_at from public.posts where author_id = user_record.id
          union all
          select created_at from public.comments where author_id = user_record.id
        ) as all_activity
        where activity_date >= current_date - 30
      ),
      consecutive as (
        select activity_date,
               activity_date - row_number() over (order by activity_date desc)::integer as grp
        from recent_activity
      )
      select coalesce(max(cnt), 0) into active_days_count
      from (
        select grp, count(*) as cnt
        from consecutive
        where activity_date >= (select max(activity_date) from consecutive) - 30
        group by grp
        order by cnt desc
        limit 1
      ) as max_streak;
      
      -- Recalculate distinct_commenters
      select coalesce(count(distinct c.author_id), 0) into distinct_commenters_count
      from public.comments c
      join public.posts p on p.id = c.post_id
      where p.author_id = user_record.id
        and c.author_id != user_record.id;
      
      -- Recalculate threads_with_10_comments
      select coalesce(count(*), 0) into threads_10_comments_count
      from (
        select post_id
        from public.comments
        where author_id = user_record.id
        group by post_id
        having count(*) >= 10
      ) as threads;
      
      -- Recalculate total likes received
      select coalesce(sum(case when pr.user_id is not null then 1 else 0 end), 0) into total_likes_received
      from public.posts p
      left join public.post_reactions pr on pr.post_id = p.id
      where p.author_id = user_record.id;
      
      -- Weekly active streak calculation (simplified: weeks with at least 1 day of activity)
      -- This is complex, so we'll use a simplified version for now
      -- Count weeks in last 8 weeks with at least 1 day of activity
      select count(distinct date_trunc('week', activity_date)) into active_days_count
      from (
        select date_trunc('day', created_at)::date as activity_date
        from public.posts
        where author_id = user_record.id
          and created_at >= now() - interval '8 weeks'
        union
        select date_trunc('day', created_at)::date as activity_date
        from public.comments
        where author_id = user_record.id
          and created_at >= now() - interval '8 weeks'
      ) as weekly_activity;
      
      -- Update metrics
      update public.user_metrics
      set
        total_posts_last_30d = posts_count_30d,
        active_days = (
          select count(distinct date_trunc('day', activity_date))
          from (
            select created_at::date as activity_date from public.posts where author_id = user_record.id
            union
            select created_at::date as activity_date from public.comments where author_id = user_record.id
          ) as activity
        ),
        consecutive_active_days = (
          with recent_activity as (
            select distinct date_trunc('day', created_at)::date as activity_date
            from (
              select created_at from public.posts where author_id = user_record.id
              union all
              select created_at from public.comments where author_id = user_record.id
            ) as all_activity
            where activity_date >= current_date - 365
          ),
          consecutive as (
            select activity_date,
                   activity_date - row_number() over (order by activity_date desc)::integer as grp
            from recent_activity
          )
          select coalesce(max(cnt), 0)
          from (
            select grp, count(*) as cnt
            from consecutive
            where activity_date >= (select max(activity_date) from consecutive) - 365
            group by grp
            order by cnt desc
            limit 1
          ) as max_streak
        ),
        weekly_active_streak = (
          select count(distinct date_trunc('week', activity_date))
          from (
            select date_trunc('day', created_at)::date as activity_date
            from public.posts
            where author_id = user_record.id
              and created_at >= now() - interval '8 weeks'
            union
            select date_trunc('day', created_at)::date as activity_date
            from public.comments
            where author_id = user_record.id
              and created_at >= now() - interval '8 weeks'
          ) as weekly_activity
        ),
        distinct_commenters = distinct_commenters_count,
        threads_with_10_comments = threads_10_comments_count,
        likes_received = total_likes_received,
        earned_badges_count = (
          select count(*) from public.user_badges where user_id = user_record.id
        ),
        updated_at = now()
      where user_id = user_record.id;
      
      -- Evaluate badges for this user
      perform public.evaluate_user_badges(user_record.id);
      
      affected_users := 1;
    end loop;
  elsif recalc_all then
    -- All users that changed metrics in last 24h
    for user_record in
      select distinct user_id as id
      from public.user_metrics
      where updated_at >= now() - interval '24 hours'
    loop
      -- Similar calculation as above, but in a loop
      -- For brevity, we'll call recalculate_user_metrics recursively
      perform public.recalculate_user_metrics(user_record.id, false);
      affected_users := affected_users + 1;
    end loop;
  end if;
  
  return affected_users;
end;
$$;

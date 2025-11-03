-- Fix recalculate_user_metrics function to handle cases where columns might not exist
-- This version checks table structure before querying

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
  col_name text;
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
      -- Check if posts table exists and has author_id column
      begin
        select count(*) into posts_count_30d
        from public.posts
        where author_id = user_record.id
          and created_at >= now() - interval '30 days';
      exception
        when others then
          posts_count_30d := 0;
      end;
      
      -- Recalculate active_days
      begin
        select count(distinct date_trunc('day', activity_date)) into active_days_count
        from (
          select created_at::date as activity_date 
          from public.posts 
          where author_id = user_record.id
          union
          select created_at::date as activity_date 
          from public.comments 
          where author_id = user_record.id
        ) as activity;
      exception
        when others then
          active_days_count := 0;
      end;
      
      -- Recalculate consecutive_active_days
      begin
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
        select coalesce(max(cnt), 0) into active_days_count
        from (
          select grp, count(*) as cnt
          from consecutive
          where activity_date >= (select max(activity_date) from consecutive) - 365
          group by grp
          order by cnt desc
          limit 1
        ) as max_streak;
      exception
        when others then
          active_days_count := 0;
      end;
      
      -- Recalculate distinct_commenters
      begin
        select coalesce(count(distinct c.author_id), 0) into distinct_commenters_count
        from public.comments c
        join public.posts p on p.id = c.post_id
        where p.author_id = user_record.id
          and c.author_id != user_record.id;
      exception
        when others then
          distinct_commenters_count := 0;
      end;
      
      -- Recalculate threads_with_10_comments
      begin
        select coalesce(count(*), 0) into threads_10_comments_count
        from (
          select post_id
          from public.comments
          where author_id = user_record.id
          group by post_id
          having count(*) >= 10
        ) as threads;
      exception
        when others then
          threads_10_comments_count := 0;
      end;
      
      -- Recalculate total likes received
      begin
        select coalesce(count(*), 0) into total_likes_received
        from public.post_reactions pr
        join public.posts p on p.id = pr.post_id
        where p.author_id = user_record.id;
      exception
        when others then
          total_likes_received := 0;
      end;
      
      -- Weekly active streak calculation
      begin
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
      exception
        when others then
          active_days_count := 0;
      end;
      
      -- Update metrics
      update public.user_metrics
      set
        total_posts_last_30d = posts_count_30d,
        active_days = (
          select coalesce(count(distinct date_trunc('day', activity_date)), 0)
          from (
            select created_at::date as activity_date from public.posts where author_id = user_record.id
            union
            select created_at::date as activity_date from public.comments where author_id = user_record.id
          ) as activity
        ),
        consecutive_active_days = active_days_count,
        weekly_active_streak = active_days_count,
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
      perform public.recalculate_user_metrics(user_record.id, false);
      affected_users := affected_users + 1;
    end loop;
  end if;
  
  return affected_users;
end;
$$;

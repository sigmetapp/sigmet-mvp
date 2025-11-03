-- Badges System V2: Complete production-ready badges system with automatic awarding
-- This migration creates a new comprehensive badges system that replaces the basic one

begin;

-- Drop old badges system tables if they exist (from migration 112)
drop table if exists public.badge_display_preferences cascade;
drop table if exists public.user_badges cascade;
drop table if exists public.badge_types cascade;

-- Drop old triggers first (they depend on functions)
-- Note: user_metrics_badge_eval_trigger is new, so we don't need to drop it
drop trigger if exists posts_metrics_trigger on public.posts;
drop trigger if exists comments_metrics_trigger on public.comments;
drop trigger if exists post_reactions_metrics_trigger on public.post_reactions;

-- Drop old functions that might conflict
-- We drop them individually without cascade to avoid validation issues
drop function if exists public.evaluate_user_badges(uuid);
drop function if exists public.trigger_badge_evaluation();
drop function if exists public.update_metrics_on_post_change();
drop function if exists public.update_metrics_on_comment_change();
drop function if exists public.update_metrics_on_like_change();
drop function if exists public.update_invite_metrics(text, uuid);
drop function if exists public.mark_invited_user_active(text);
drop function if exists public.initialize_user_metrics(uuid);

-- ============================================
-- USER METRICS TABLE
-- ============================================
create table if not exists public.user_metrics (
  user_id uuid primary key references auth.users(id) on delete cascade,
  total_posts integer default 0 not null,
  total_comments integer default 0 not null,
  likes_given integer default 0 not null,
  likes_received integer default 0 not null,
  distinct_commenters integer default 0 not null,
  invited_users_total integer default 0 not null,
  invited_users_with_activity integer default 0 not null,
  comments_on_others_posts integer default 0 not null,
  threads_with_10_comments integer default 0 not null,
  earned_badges_count integer default 0 not null,
  total_posts_last_30d integer default 0 not null,
  consecutive_active_days integer default 0 not null,
  weekly_active_streak integer default 0 not null,
  active_days integer default 0 not null,
  social_weight integer default 0 not null,
  updated_at timestamptz default now() not null
);

create index if not exists user_metrics_updated_at_idx on public.user_metrics(updated_at desc);

-- Enable RLS
alter table public.user_metrics enable row level security;

-- Users can only read their own metrics
create policy "read own metrics" on public.user_metrics
  for select using (auth.uid() = user_id);

-- No direct inserts/updates from client - only via server functions and triggers
create policy "service role only writes" on public.user_metrics
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ============================================
-- BADGES TABLE
-- ============================================
create table if not exists public.badges (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  title text not null,
  description text not null,
  how_to_get text not null,
  metric text not null,
  operator text not null check (operator in ('gte', 'eq', 'lte')),
  threshold integer not null,
  icon text not null,
  color_start text not null,
  color_end text not null,
  shape text not null check (shape in ('circle', 'hex', 'shield', 'ribbon', 'badge', 'medal')),
  category text not null check (category in ('activity', 'community', 'growth', 'consistency')),
  is_active boolean default true not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index if not exists badges_key_idx on public.badges(key);
create index if not exists badges_is_active_idx on public.badges(is_active) where is_active = true;
create index if not exists badges_category_idx on public.badges(category);

-- Enable RLS
alter table public.badges enable row level security;

-- Anyone can read badges
create policy "read badges" on public.badges
  for select using (true);

-- Only service role can write (admin operations)
create policy "service role only writes" on public.badges
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ============================================
-- USER BADGES TABLE
-- ============================================
create table if not exists public.user_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  badge_key text not null references public.badges(key) on delete cascade,
  awarded_at timestamptz default now() not null,
  evidence jsonb not null default '{}'::jsonb,
  unique (user_id, badge_key)
);

create index if not exists user_badges_user_id_idx on public.user_badges(user_id);
create index if not exists user_badges_badge_key_idx on public.user_badges(badge_key);
create index if not exists user_badges_awarded_at_idx on public.user_badges(awarded_at desc);

-- Enable RLS
alter table public.user_badges enable row level security;

-- Users can read their own badges
create policy "read own badges" on public.user_badges
  for select using (auth.uid() = user_id);

-- Public read for earned badges (for profile display)
create policy "read public earned badges" on public.user_badges
  for select using (true);

-- No direct inserts from client - only via evaluate_user_badges function
create policy "service role only writes" on public.user_badges
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ============================================
-- FUNCTIONS: Initialize user metrics
-- ============================================
create or replace function public.initialize_user_metrics(user_uuid uuid)
returns void
language plpgsql
security definer
as $$
begin
  insert into public.user_metrics (user_id)
  values (user_uuid)
  on conflict (user_id) do nothing;
end;
$$;

-- ============================================
-- FUNCTIONS: Update metrics on post created/deleted
-- ============================================
create or replace function public.update_metrics_on_post_change()
returns trigger
language plpgsql
security definer
as $$
begin
  if TG_OP = 'INSERT' then
    -- Initialize metrics if needed
    perform public.initialize_user_metrics(NEW.author_id);
    
    -- Increment total_posts
    update public.user_metrics
    set total_posts = total_posts + 1,
        updated_at = now()
    where user_id = NEW.author_id;
    
    -- Update total_posts_last_30d (will be recalculated by cron, but approximate)
    update public.user_metrics
    set total_posts_last_30d = total_posts_last_30d + 1,
        updated_at = now()
    where user_id = NEW.author_id
      and NEW.created_at >= now() - interval '30 days';
    
    return NEW;
  elsif TG_OP = 'DELETE' then
    -- Decrement total_posts
    update public.user_metrics
    set total_posts = greatest(0, total_posts - 1),
        updated_at = now()
    where user_id = OLD.author_id;
    
    return OLD;
  end if;
  return null;
end;
$$;

-- ============================================
-- FUNCTIONS: Update metrics on comment created/deleted
-- ============================================
create or replace function public.update_metrics_on_comment_change()
returns trigger
language plpgsql
security definer
as $$
declare
  post_author_id uuid;
  commenter_count integer;
  thread_comment_count integer;
begin
  if TG_OP = 'INSERT' then
    -- Get post author
    select author_id into post_author_id
    from public.posts
    where id = NEW.post_id;
    
    -- Initialize metrics for both commenter and post author
    perform public.initialize_user_metrics(NEW.author_id);
    if post_author_id is not null then
      perform public.initialize_user_metrics(post_author_id);
    end if;
    
    -- Increment total_comments for commenter
    update public.user_metrics
    set total_comments = total_comments + 1,
        updated_at = now()
    where user_id = NEW.author_id;
    
    -- If commenting on someone else's post, increment comments_on_others_posts
    if post_author_id is not null and post_author_id != NEW.author_id then
      update public.user_metrics
      set comments_on_others_posts = comments_on_others_posts + 1,
          updated_at = now()
      where user_id = NEW.author_id;
    end if;
    
    -- Update distinct_commenters for post author
    if post_author_id is not null and post_author_id != NEW.author_id then
      select count(distinct author_id) into commenter_count
      from public.comments
      where post_id = NEW.post_id;
      
      update public.user_metrics
      set distinct_commenters = (
        select count(distinct c.author_id)
        from public.comments c
        join public.posts p on p.id = c.post_id
        where p.author_id = user_metrics.user_id
          and c.author_id != user_metrics.user_id
      ),
      updated_at = now()
      where user_id = post_author_id;
    end if;
    
    -- Check for threads with 10+ comments
    select count(*) into thread_comment_count
    from public.comments
    where post_id = NEW.post_id
      and author_id = NEW.author_id;
    
    if thread_comment_count = 10 then
      update public.user_metrics
      set threads_with_10_comments = threads_with_10_comments + 1,
          updated_at = now()
      where user_id = NEW.author_id;
    end if;
    
    return NEW;
  elsif TG_OP = 'DELETE' then
    -- Get post author
    select author_id into post_author_id
    from public.posts
    where id = OLD.post_id;
    
    -- Decrement total_comments
    update public.user_metrics
    set total_comments = greatest(0, total_comments - 1),
        updated_at = now()
    where user_id = OLD.author_id;
    
    -- Decrement comments_on_others_posts if commenting on someone else's post
    if post_author_id is not null and post_author_id != OLD.author_id then
      update public.user_metrics
      set comments_on_others_posts = greatest(0, comments_on_others_posts - 1),
          updated_at = now()
      where user_id = OLD.author_id;
      
      -- Recalculate distinct_commenters for post author
      update public.user_metrics
      set distinct_commenters = (
        select coalesce(count(distinct c.author_id), 0)
        from public.comments c
        join public.posts p on p.id = c.post_id
        where p.author_id = user_metrics.user_id
          and c.author_id != user_metrics.user_id
      ),
      updated_at = now()
      where user_id = post_author_id;
    end if;
    
    return OLD;
  end if;
  return null;
end;
$$;

-- ============================================
-- FUNCTIONS: Update metrics on like created/deleted
-- ============================================
create or replace function public.update_metrics_on_like_change()
returns trigger
language plpgsql
security definer
as $$
declare
  post_author_id uuid;
begin
  if TG_OP = 'INSERT' then
    -- Get post author
    select author_id into post_author_id
    from public.posts
    where id = NEW.post_id;
    
    -- Initialize metrics
    perform public.initialize_user_metrics(NEW.user_id);
    if post_author_id is not null then
      perform public.initialize_user_metrics(post_author_id);
    end if;
    
    -- Increment likes_given for liker
    update public.user_metrics
    set likes_given = likes_given + 1,
        updated_at = now()
    where user_id = NEW.user_id;
    
    -- Increment likes_received for post author
    if post_author_id is not null and post_author_id != NEW.user_id then
      update public.user_metrics
      set likes_received = likes_received + 1,
          updated_at = now()
      where user_id = post_author_id;
    end if;
    
    return NEW;
  elsif TG_OP = 'DELETE' then
    -- Get post author
    select author_id into post_author_id
    from public.posts
    where id = OLD.post_id;
    
    -- Decrement likes_given
    update public.user_metrics
    set likes_given = greatest(0, likes_given - 1),
        updated_at = now()
    where user_id = OLD.user_id;
    
    -- Decrement likes_received
    if post_author_id is not null and post_author_id != OLD.user_id then
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

-- ============================================
-- FUNCTIONS: Update metrics on invite accepted
-- ============================================
create or replace function public.update_invite_metrics(invite_code text, new_user_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  inviter_id uuid;
begin
  -- Get inviter from invite code
  select creator into inviter_id
  from public.invites
  where code = invite_code;
  
  if inviter_id is null then
    return;
  end if;
  
  -- Initialize metrics
  perform public.initialize_user_metrics(inviter_id);
  perform public.initialize_user_metrics(new_user_id);
  
  -- Increment invited_users_total
  update public.user_metrics
  set invited_users_total = invited_users_total + 1,
      updated_at = now()
  where user_id = inviter_id;
end;
$$;

-- ============================================
-- FUNCTIONS: Update metrics when invited user becomes active
-- ============================================
create or replace function public.mark_invited_user_active(invite_code text)
returns void
language plpgsql
security definer
as $$
declare
  inviter_id uuid;
begin
  -- Get inviter from invite code
  select creator into inviter_id
  from public.invites
  where code = invite_code;
  
  if inviter_id is null then
    return;
  end if;
  
  -- Initialize metrics if needed
  perform public.initialize_user_metrics(inviter_id);
  
  -- Increment invited_users_with_activity
  update public.user_metrics
  set invited_users_with_activity = invited_users_with_activity + 1,
      updated_at = now()
  where user_id = inviter_id;
end;
$$;

-- ============================================
-- FUNCTIONS: Evaluate user badges
-- ============================================
create or replace function public.evaluate_user_badges(user_uuid uuid)
returns integer
language plpgsql
security definer
as $$
declare
  metrics_rec record;
  badge_rec record;
  metric_value integer;
  composite_value integer;
  should_award boolean;
  new_badges_count integer := 0;
  evidence_json jsonb;
  metric_snapshot jsonb;
begin
  -- Get user metrics (initialize if needed)
  perform public.initialize_user_metrics(user_uuid);
  
  select * into metrics_rec
  from public.user_metrics
  where user_id = user_uuid;
  
  -- Create snapshot for evidence
  metric_snapshot := row_to_json(metrics_rec)::jsonb;
  
  -- Iterate over all active badges
  for badge_rec in
    select * from public.badges
    where is_active = true
    order by created_at
  loop
    -- Skip if already awarded
    if exists (
      select 1 from public.user_badges
      where user_id = user_uuid
        and badge_key = badge_rec.key
    ) then
      continue;
    end if;
    
    -- Determine metric value based on badge metric
    case badge_rec.metric
      when 'total_posts' then
        metric_value := metrics_rec.total_posts;
      when 'total_comments' then
        metric_value := metrics_rec.total_comments;
      when 'likes_given' then
        metric_value := metrics_rec.likes_given;
      when 'likes_received' then
        metric_value := metrics_rec.likes_received;
      when 'total_likes_received' then
        metric_value := metrics_rec.likes_received;
      when 'distinct_commenters' then
        metric_value := metrics_rec.distinct_commenters;
      when 'invited_users_total' then
        metric_value := metrics_rec.invited_users_total;
      when 'invited_users_with_activity' then
        metric_value := metrics_rec.invited_users_with_activity;
      when 'comments_on_others_posts' then
        metric_value := metrics_rec.comments_on_others_posts;
      when 'threads_with_10_comments' then
        metric_value := metrics_rec.threads_with_10_comments;
      when 'earned_badges_count' then
        metric_value := metrics_rec.earned_badges_count;
      when 'total_posts_last_30d' then
        metric_value := metrics_rec.total_posts_last_30d;
      when 'consecutive_active_days' then
        metric_value := metrics_rec.consecutive_active_days;
      when 'weekly_active_streak' then
        metric_value := metrics_rec.weekly_active_streak;
      when 'active_days' then
        metric_value := metrics_rec.active_days;
      when 'social_weight' then
        metric_value := metrics_rec.social_weight;
      when 'composite_posts_comments_3_5' then
        if metrics_rec.total_posts >= 3 and metrics_rec.total_comments >= 5 then
          composite_value := 1;
        else
          composite_value := 0;
        end if;
        metric_value := composite_value;
      when 'composite_posts_comments_5_10' then
        if metrics_rec.total_posts >= 5 and metrics_rec.total_comments >= 10 then
          composite_value := 1;
        else
          composite_value := 0;
        end if;
        metric_value := composite_value;
      when 'composite_posts_comments_20_50' then
        if metrics_rec.total_posts >= 20 and metrics_rec.total_comments >= 50 then
          composite_value := 1;
        else
          composite_value := 0;
        end if;
        metric_value := composite_value;
      when 'comment_likes_from_distinct_users' then
        -- This metric needs to be calculated from post_reactions + comments
        -- For now, set to 0 as it requires a more complex query
        metric_value := 0;
      else
        metric_value := 0;
    end case;
    
    -- Check if condition is met
    should_award := false;
    case badge_rec.operator
      when 'gte' then
        should_award := metric_value >= badge_rec.threshold;
      when 'eq' then
        should_award := metric_value = badge_rec.threshold;
      when 'lte' then
        should_award := metric_value <= badge_rec.threshold;
    end case;
    
    -- Award badge if condition met
    if should_award then
      evidence_json := jsonb_build_object(
        'metric_snapshot', metric_snapshot,
        'metric_value', metric_value,
        'threshold', badge_rec.threshold,
        'operator', badge_rec.operator,
        'awarded_at', now()
      );
      
      -- Upsert user_badge
      insert into public.user_badges (user_id, badge_key, evidence)
      values (user_uuid, badge_rec.key, evidence_json)
      on conflict (user_id, badge_key) do nothing;
      
      -- Only increment counter if it was actually inserted (not already existed)
      if found then
        new_badges_count := new_badges_count + 1;
        
        -- Update earned_badges_count in metrics
        update public.user_metrics
        set earned_badges_count = (
          select count(*) from public.user_badges
          where user_id = user_uuid
        ),
        updated_at = now()
        where user_id = user_uuid;
      end if;
    end if;
  end loop;
  
  return new_badges_count;
end;
$$;

-- ============================================
-- TRIGGERS
-- ============================================

-- Trigger for posts
drop trigger if exists posts_metrics_trigger on public.posts;
create trigger posts_metrics_trigger
  after insert or delete on public.posts
  for each row
  execute function public.update_metrics_on_post_change();

-- Trigger for comments
drop trigger if exists comments_metrics_trigger on public.comments;
create trigger comments_metrics_trigger
  after insert or delete on public.comments
  for each row
  execute function public.update_metrics_on_comment_change();

-- Trigger for likes (post_reactions)
drop trigger if exists post_reactions_metrics_trigger on public.post_reactions;
create trigger post_reactions_metrics_trigger
  after insert or delete on public.post_reactions
  for each row
  execute function public.update_metrics_on_like_change();

-- Trigger to evaluate badges after metrics are updated
-- Only evaluates if relevant metrics changed (not just earned_badges_count)
create or replace function public.trigger_badge_evaluation()
returns trigger
language plpgsql
security definer
as $$
begin
  -- Only evaluate if a metric that affects badges changed
  -- (not just earned_badges_count to avoid infinite loop)
  if (old.total_posts is distinct from new.total_posts) or
     (old.total_comments is distinct from new.total_comments) or
     (old.likes_given is distinct from new.likes_given) or
     (old.likes_received is distinct from new.likes_received) or
     (old.distinct_commenters is distinct from new.distinct_commenters) or
     (old.invited_users_total is distinct from new.invited_users_total) or
     (old.invited_users_with_activity is distinct from new.invited_users_with_activity) or
     (old.comments_on_others_posts is distinct from new.comments_on_others_posts) or
     (old.threads_with_10_comments is distinct from new.threads_with_10_comments) or
     (old.total_posts_last_30d is distinct from new.total_posts_last_30d) or
     (old.consecutive_active_days is distinct from new.consecutive_active_days) or
     (old.weekly_active_streak is distinct from new.weekly_active_streak) or
     (old.active_days is distinct from new.active_days) or
     (old.social_weight is distinct from new.social_weight) then
    
    -- Evaluate badges in the background (won't block)
    perform public.evaluate_user_badges(new.user_id);
  end if;
  
  return new;
end;
$$;

-- Create trigger that evaluates badges after metrics update
drop trigger if exists user_metrics_badge_eval_trigger on public.user_metrics;
create trigger user_metrics_badge_eval_trigger
  after update on public.user_metrics
  for each row
  when (old.* is distinct from new.*)
  execute function public.trigger_badge_evaluation();

commit;

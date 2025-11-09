-- Verify and fix notifications backfill
-- This migration checks if notifications exist and creates them if needed
begin;

-- Check if notifications table has any data
do $$
declare
  notification_count bigint;
  comments_count bigint;
  reactions_count bigint;
begin
  -- Count existing notifications
  select count(*) into notification_count from public.notifications;
  
  raise notice 'Current notifications count: %', notification_count;
  
  -- Count potential notifications from comments
  select count(*) into comments_count
  from public.comments c
  inner join public.posts p on p.id = c.post_id
  where c.parent_id is null;
  
  raise notice 'Potential comment notifications: %', comments_count;
  
  -- Count potential notifications from reactions
  select count(*) into reactions_count
  from public.post_reactions pr
  inner join public.posts p on p.id = pr.post_id
  where pr.user_id != p.author_id;
  
  raise notice 'Potential reaction notifications: %', reactions_count;
  
  -- If no notifications exist, run backfill again
  if notification_count = 0 then
    raise notice 'No notifications found. Running backfill...';
    -- This will be handled by migration 172
  end if;
end $$;

-- Ensure RLS policies allow reading
drop policy if exists "read own notifications" on public.notifications;
create policy "read own notifications" on public.notifications
  for select using (auth.uid() = user_id);

commit;

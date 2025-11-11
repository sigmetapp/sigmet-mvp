-- Debug connections by temporarily disabling RLS and testing
begin;

-- Step 1: Temporarily disable RLS for testing
alter table public.user_connections disable row level security;

-- Step 2: Check if we have posts with mentions and users with usernames
do $$
declare
  posts_with_mentions int;
  users_with_username int;
  test_user_id uuid;
  test_mentioned_user_id uuid;
  test_username text;
  test_post_id bigint := 444444;
  connections_before int;
  connections_after int;
begin
  -- Count posts with mentions
  select count(*) into posts_with_mentions 
  from posts 
  where text ~ '@[a-zA-Z0-9_]+' or text ~ '/u/[a-zA-Z0-9_]+';
  
  -- Count users with username
  select count(*) into users_with_username 
  from profiles 
  where username is not null and username != '';
  
  raise notice '=== BASIC CHECKS ===';
  raise notice 'Posts with mentions: %', posts_with_mentions;
  raise notice 'Users with username: %', users_with_username;
  
  if posts_with_mentions = 0 then
    raise notice 'WARNING: No posts with mentions found!';
  end if;
  
  if users_with_username < 2 then
    raise notice 'WARNING: Need at least 2 users with username for testing!';
    return;
  end if;
  
  -- Get two different users
  select user_id, username into test_user_id, test_username
  from profiles
  where username is not null and username != ''
  order by created_at desc
  limit 1;
  
  select user_id into test_mentioned_user_id
  from profiles
  where username is not null 
    and username != ''
    and user_id != test_user_id
  order by created_at desc
  limit 1;
  
  if test_user_id is null or test_mentioned_user_id is null then
    raise notice 'ERROR: Could not find 2 different users';
    return;
  end if;
  
  raise notice '=== TEST USERS ===';
  raise notice 'User 1: %', test_user_id;
  raise notice 'User 2: %', test_mentioned_user_id;
  raise notice 'Username to mention: %', test_username;
  
  -- Check connections before
  select count(*) into connections_before
  from user_connections
  where post_id = test_post_id;
  
  raise notice 'Connections before: %', connections_before;
  
  -- Test direct insert (bypassing function)
  raise notice '=== TEST DIRECT INSERT ===';
  begin
    insert into public.user_connections (user_id, connected_user_id, post_id, connection_type)
    values (test_mentioned_user_id, test_user_id, test_post_id, 'they_mentioned_me')
    on conflict (user_id, connected_user_id, post_id, connection_type) do nothing;
    
    insert into public.user_connections (user_id, connected_user_id, post_id, connection_type)
    values (test_user_id, test_mentioned_user_id, test_post_id, 'i_mentioned_them')
    on conflict (user_id, connected_user_id, post_id, connection_type) do nothing;
    
    select count(*) into connections_after
    from user_connections
    where post_id = test_post_id;
    
    raise notice 'Direct insert: SUCCESS! Connections after: %', connections_after;
    
    -- Clean up
    delete from user_connections where post_id = test_post_id;
    
  exception
    when others then
      raise notice 'Direct insert FAILED: %', sqlerrm;
  end;
  
  -- Test function
  raise notice '=== TEST FUNCTION ===';
  begin
    perform public.extract_mentions_from_post(
      format('Hello @%s, how are you?', test_username),
      test_user_id,
      test_post_id
    );
    
    select count(*) into connections_after
    from user_connections
    where post_id = test_post_id;
    
    raise notice 'Function call: SUCCESS! Connections after: %', connections_after;
    
    if connections_after > connections_before then
      raise notice '✅ Function created connections!';
    else
      raise notice '❌ Function did NOT create connections!';
      
      -- Debug: check if username lookup works
      declare
        found_user_id uuid;
        found_count int;
      begin
        select user_id into found_user_id
        from profiles
        where lower(trim(username)) = lower(trim(test_username))
        limit 1;
        
        select count(*) into found_count
        from profiles
        where lower(trim(username)) = lower(trim(test_username));
        
        raise notice 'Username lookup: found_count=%, found_user_id=%', found_count, found_user_id;
        
        if found_user_id is null then
          raise notice 'ERROR: Username lookup failed!';
        elsif found_user_id != test_mentioned_user_id then
          raise notice 'WARNING: Username lookup found different user!';
        end if;
      end;
    end if;
    
    -- Clean up
    delete from user_connections where post_id = test_post_id;
    
  exception
    when others then
      raise notice 'Function call FAILED: %', sqlerrm;
  end;
end $$;

-- Step 3: Process all existing posts (with RLS disabled)
do $$
declare
  post_record record;
  processed_count int := 0;
  author_col text;
  error_count int := 0;
  total_connections_before int;
  total_connections_after int;
  posts_with_mentions_count int;
begin
  author_col := public._get_posts_author_column();
  
  if author_col is null then
    raise notice 'ERROR: No author column found';
    return;
  end if;
  
  -- Count connections before
  select count(*) into total_connections_before from user_connections;
  
  -- Count posts with mentions
  execute format('
    select count(*) 
    from posts 
    where text ~ ''@[a-zA-Z0-9_]+'' or text ~ ''/u/[a-zA-Z0-9_]+''
  ') into posts_with_mentions_count;
  
  raise notice '=== BACKFILL WITH RLS DISABLED ===';
  raise notice 'Current connections: %', total_connections_before;
  raise notice 'Posts with mentions: %', posts_with_mentions_count;
  
  if posts_with_mentions_count = 0 then
    raise notice 'No posts with mentions to process';
    return;
  end if;
  
  -- Process all posts with mentions
  for post_record in 
    execute format('
      select 
        p.id,
        coalesce(
          nullif(trim(p.text), ''''),
          nullif(trim(p.body), ''''),
          ''''
        ) as post_text,
        p.%I as post_author_id
      from public.posts p
      where (
        (p.text is not null and trim(p.text) != '''') 
        or (p.body is not null and trim(p.body) != '''')
      )
      and (p.text ~ ''@[a-zA-Z0-9_]+'' or p.text ~ ''/u/[a-zA-Z0-9_]+'')
      order by p.created_at desc
    ', author_col)
  loop
    if post_record.post_text is null or trim(post_record.post_text) = '' then
      continue;
    end if;
    
    if post_record.post_author_id is null then
      raise notice 'Post %: Skipping (no author)', post_record.id;
      continue;
    end if;
    
    begin
      perform public.extract_mentions_from_post(
        post_record.post_text,
        post_record.post_author_id,
        post_record.id
      );
      
      processed_count := processed_count + 1;
      
      if processed_count % 10 = 0 then
        raise notice 'Processed % posts', processed_count;
      end if;
    exception
      when others then
        error_count := error_count + 1;
        raise notice 'Error processing post %: %', post_record.id, sqlerrm;
        if error_count > 10 then
          raise notice 'Too many errors, stopping backfill';
          exit;
        end if;
    end;
  end loop;
  
  -- Count connections after
  select count(*) into total_connections_after from user_connections;
  
  raise notice '=== BACKFILL COMPLETE ===';
  raise notice 'Processed: %, Errors: %', processed_count, error_count;
  raise notice 'Connections before: %, after: %, created: %', 
    total_connections_before, 
    total_connections_after,
    total_connections_after - total_connections_before;
end $$;

-- Step 4: Re-enable RLS with proper policies
alter table public.user_connections enable row level security;

-- Drop old policies
drop policy if exists "users can view own connections" on public.user_connections;
drop policy if exists "system can insert connections" on public.user_connections;
drop policy if exists "service role can insert connections" on public.user_connections;

-- Create new policies
create policy "users can view own connections" 
  on public.user_connections for select 
  using (user_id = auth.uid() or connected_user_id = auth.uid());

-- Allow all inserts (security definer functions will use this)
create policy "allow all inserts" 
  on public.user_connections for insert 
  with check (true);

-- Step 5: Final check
select 
  'Final connections count' as info,
  count(*) as total_connections,
  count(distinct user_id) as unique_users
from user_connections;

commit;

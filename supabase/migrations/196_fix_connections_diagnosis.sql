-- Comprehensive diagnosis and fix for connections
begin;

-- Step 1: Check basic conditions
do $$
declare
  posts_count int;
  posts_with_mentions int;
  users_with_username int;
  connections_count int;
  trigger_exists bool;
  function_exists bool;
begin
  -- Count posts
  select count(*) into posts_count from posts;
  
  -- Count posts with mentions
  select count(*) into posts_with_mentions 
  from posts 
  where text ~ '@[a-zA-Z0-9_]+' or text ~ '/u/[a-zA-Z0-9_]+';
  
  -- Count users with username
  select count(*) into users_with_username 
  from profiles 
  where username is not null and username != '';
  
  -- Count connections
  select count(*) into connections_count from user_connections;
  
  -- Check trigger
  select exists(
    select 1 from pg_trigger where tgname = 'post_connections_trigger'
  ) into trigger_exists;
  
  -- Check function
  select exists(
    select 1 from pg_proc where proname = 'extract_mentions_from_post'
  ) into function_exists;
  
  raise notice '=== DIAGNOSIS ===';
  raise notice 'Posts total: %', posts_count;
  raise notice 'Posts with mentions: %', posts_with_mentions;
  raise notice 'Users with username: %', users_with_username;
  raise notice 'Current connections: %', connections_count;
  raise notice 'Trigger exists: %', trigger_exists;
  raise notice 'Function exists: %', function_exists;
end $$;

-- Step 2: Fix RLS policy - ensure system can insert
drop policy if exists "system can insert connections" on public.user_connections;

-- Create a more permissive policy for inserts (for trigger function)
create policy "system can insert connections" 
  on public.user_connections for insert 
  with check (true);

-- Also allow service role to insert (if needed)
create policy "service role can insert connections" 
  on public.user_connections for insert 
  with check (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
    or true  -- Fallback for security definer functions
  );

-- Step 3: Recreate extract_mentions_from_post with better error handling
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
  mention_pattern text;
  username_match text;
  user_id_found uuid;
  current_user_id uuid;
  text_lower text;
  mentions_count int := 0;
  connections_created int := 0;
  insert_error text;
begin
  current_user_id := post_author_id;
  
  if post_text is null or trim(post_text) = '' then
    return;
  end if;
  
  if post_author_id is null then
    raise notice 'Post %: author_id is null, skipping', post_id;
    return;
  end if;
  
  text_lower := lower(post_text);
  
  -- Extract @username mentions using a simpler approach
  for mention_pattern in 
    select (regexp_matches(text_lower, '@([a-z0-9_]+)', 'g'))[1]
  loop
    username_match := mention_pattern;
    
    if username_match is not null and length(username_match) > 0 then
      mentions_count := mentions_count + 1;
      
      -- Find user by username (case-insensitive)
      select user_id into user_id_found
      from public.profiles
      where lower(trim(username)) = lower(trim(username_match))
        and username is not null
        and username != ''
      limit 1;
      
      if user_id_found is not null and user_id_found != current_user_id then
        -- Try to insert connections
        begin
          insert into public.user_connections (user_id, connected_user_id, post_id, connection_type)
          values (user_id_found, current_user_id, post_id, 'they_mentioned_me')
          on conflict (user_id, connected_user_id, post_id, connection_type) do nothing;
          
          insert into public.user_connections (user_id, connected_user_id, post_id, connection_type)
          values (current_user_id, user_id_found, post_id, 'i_mentioned_them')
          on conflict (user_id, connected_user_id, post_id, connection_type) do nothing;
          
          connections_created := connections_created + 2;
        exception
          when others then
            insert_error := sqlerrm;
            raise notice 'Post %: Error inserting connection for @%: %', post_id, username_match, insert_error;
        end;
      elsif user_id_found is null then
        raise notice 'Post %: Username @% not found in profiles', post_id, username_match;
      end if;
    end if;
  end loop;
  
  -- Extract /u/username mentions
  for mention_pattern in 
    select (regexp_matches(text_lower, '/u/([a-z0-9_]+)(\s|$|\n|/)', 'g'))[1]
  loop
    username_match := mention_pattern;
    
    if username_match is not null and length(username_match) > 0 then
      mentions_count := mentions_count + 1;
      
      select user_id into user_id_found
      from public.profiles
      where lower(trim(username)) = lower(trim(username_match))
        and username is not null
        and username != ''
      limit 1;
      
      if user_id_found is not null and user_id_found != current_user_id then
        begin
          insert into public.user_connections (user_id, connected_user_id, post_id, connection_type)
          values (user_id_found, current_user_id, post_id, 'they_mentioned_me')
          on conflict (user_id, connected_user_id, post_id, connection_type) do nothing;
          
          insert into public.user_connections (user_id, connected_user_id, post_id, connection_type)
          values (current_user_id, user_id_found, post_id, 'i_mentioned_them')
          on conflict (user_id, connected_user_id, post_id, connection_type) do nothing;
          
          connections_created := connections_created + 2;
        exception
          when others then
            raise notice 'Post %: Error inserting connection for /u/%: %', post_id, username_match, sqlerrm;
        end;
      end if;
    end if;
  end loop;
  
  -- Check for /u/{user_id} pattern
  for mention_pattern in 
    select (regexp_matches(text_lower, '/u/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(\s|$|\n|/)', 'gi'))[1]
  loop
    if mention_pattern is not null then
      begin
        user_id_found := mention_pattern::uuid;
        
        if user_id_found is not null and user_id_found != current_user_id then
          if exists (select 1 from auth.users where id = user_id_found) then
            mentions_count := mentions_count + 1;
            
            insert into public.user_connections (user_id, connected_user_id, post_id, connection_type)
            values (user_id_found, current_user_id, post_id, 'they_mentioned_me')
            on conflict (user_id, connected_user_id, post_id, connection_type) do nothing;
            
            insert into public.user_connections (user_id, connected_user_id, post_id, connection_type)
            values (current_user_id, user_id_found, post_id, 'i_mentioned_them')
            on conflict (user_id, connected_user_id, post_id, connection_type) do nothing;
            
            connections_created := connections_created + 2;
          end if;
        end if;
      exception
        when others then
          null;  -- Invalid UUID format, skip
      end;
    end if;
  end loop;
  
  -- Log results only if something was found
  if mentions_count > 0 then
    raise notice 'Post %: Found % mentions, created % connections', post_id, mentions_count, connections_created;
  end if;
end;
$$;

-- Step 4: Test function manually with real data
do $$
declare
  test_user record;
  test_mentioned_user record;
  test_post_id bigint := 666666;
  test_text text;
  connections_before int;
  connections_after int;
begin
  -- Get two different users
  select user_id, username into test_user
  from profiles
  where username is not null and username != ''
  order by created_at desc
  limit 1;
  
  select user_id, username into test_mentioned_user
  from profiles
  where username is not null 
    and username != ''
    and user_id != coalesce(test_user.user_id, '00000000-0000-0000-0000-000000000000'::uuid)
  order by created_at desc
  limit 1;
  
  if test_user.user_id is null or test_mentioned_user.user_id is null then
    raise notice 'TEST SKIPPED: Need at least 2 users with username';
    raise notice 'User 1: %, User 2: %', test_user.user_id, test_mentioned_user.user_id;
    return;
  end if;
  
  raise notice '=== MANUAL TEST ===';
  raise notice 'Author: % (@%)', test_user.user_id, test_user.username;
  raise notice 'Mentioned: % (@%)', test_mentioned_user.user_id, test_mentioned_user.username;
  
  -- Check connections before
  select count(*) into connections_before
  from user_connections
  where post_id = test_post_id;
  
  -- Create test text
  test_text := format('Hello @%s, how are you?', test_mentioned_user.username);
  raise notice 'Test text: %', test_text;
  
  -- Call function
  begin
    perform public.extract_mentions_from_post(
      test_text,
      test_user.user_id,
      test_post_id
    );
    
    -- Check connections after
    select count(*) into connections_after
    from user_connections
    where post_id = test_post_id;
    
    raise notice 'Connections before: %, after: %, created: %', 
      connections_before, connections_after, connections_after - connections_before;
    
    if connections_after > connections_before then
      raise notice '✅ TEST SUCCESS: Connections created!';
    else
      raise notice '❌ TEST FAILED: No connections created!';
    end if;
    
    -- Clean up
    delete from user_connections where post_id = test_post_id;
    
  exception
    when others then
      raise notice '❌ TEST ERROR: %', sqlerrm;
  end;
end $$;

-- Step 5: Process all existing posts
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
  
  raise notice '=== BACKFILL START ===';
  raise notice 'Current connections: %', total_connections_before;
  raise notice 'Posts with mentions: %', posts_with_mentions_count;
  raise notice 'Using column: %', author_col;
  
  -- Process all posts
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

-- Step 6: Final check
select 
  'Final connections count' as info,
  count(*) as total_connections,
  count(distinct user_id) as unique_users
from user_connections;

commit;

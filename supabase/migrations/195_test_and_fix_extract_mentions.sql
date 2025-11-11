-- Test and fix extract_mentions_from_post function
begin;

-- First, let's add logging to the extract_mentions_from_post function
create or replace function public.extract_mentions_from_post(
  post_text text,
  post_author_id uuid,
  post_id bigint
)
returns void
language plpgsql
security definer
as $$
declare
  mention_pattern text;
  username_match text;
  user_id_found uuid;
  current_user_id uuid;
  text_lower text;
  mentions_count int := 0;
  connections_created int := 0;
begin
  current_user_id := post_author_id;
  
  if post_text is null or trim(post_text) = '' then
    return;
  end if;
  
  text_lower := lower(post_text);
  
  -- Extract @username mentions
  for mention_pattern in 
    select regexp_split_to_table(text_lower, '\s+')
    where regexp_split_to_table ~ '^@[a-z0-9_]+'
  loop
    username_match := substring(mention_pattern from '^@([a-z0-9_]+)');
    
    if username_match is not null then
      mentions_count := mentions_count + 1;
      
      select user_id into user_id_found
      from public.profiles
      where lower(username) = username_match
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
            raise notice 'Error inserting connection for @%: %', username_match, sqlerrm;
        end;
      end if;
    end if;
  end loop;
  
  -- Extract /u/username mentions
  for mention_pattern in 
    select (regexp_matches(text_lower, '/u/([a-z0-9_]+)(\s|$|\n)', 'g'))[1]
  loop
    username_match := mention_pattern;
    
    if username_match is not null then
      mentions_count := mentions_count + 1;
      
      select user_id into user_id_found
      from public.profiles
      where lower(username) = username_match
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
            raise notice 'Error inserting connection for /u/%: %', username_match, sqlerrm;
        end;
      end if;
    end if;
  end loop;
  
  -- Check for /u/{user_id} pattern
  for mention_pattern in 
    select (regexp_matches(text_lower, '/u/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(\s|$|\n)', 'gi'))[1]
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
          null;
      end;
    end if;
  end loop;
  
  -- Log results
  if mentions_count > 0 then
    raise notice 'Post %: Found % mentions, created % connections', post_id, mentions_count, connections_created;
  end if;
end;
$$;

-- Test with real usernames from database
do $$
declare
  test_user record;
  test_mentioned_user record;
  test_post_id bigint;
  mentions_found int := 0;
begin
  -- Get two different users
  select user_id, username into test_user
  from profiles
  where username is not null and username != ''
  limit 1;
  
  select user_id, username into test_mentioned_user
  from profiles
  where username is not null 
    and username != ''
    and user_id != test_user.user_id
  limit 1;
  
  if test_user.user_id is null or test_mentioned_user.user_id is null then
    raise notice 'Need at least 2 users with usernames for testing';
    return;
  end if;
  
  raise notice 'Testing with user: % (@%), mentioning: % (@%)', 
    test_user.user_id, test_user.username,
    test_mentioned_user.user_id, test_mentioned_user.username;
  
  -- Test with a real mention
  test_post_id := 999999; -- Temporary ID for testing
  
  -- Try to extract mentions from a test string with real username
  begin
    perform public.extract_mentions_from_post(
      format('Hello @%s how are you?', test_mentioned_user.username),
      test_user.user_id,
      test_post_id
    );
    
    -- Check if connection was created
    select count(*) into mentions_found
    from user_connections
    where post_id = test_post_id;
    
    raise notice 'Test completed. Connections created: %', mentions_found;
    
    if mentions_found = 0 then
      raise notice 'WARNING: No connections created! Check function logic.';
    end if;
    
    -- Clean up test data
    delete from user_connections where post_id = test_post_id;
    
  exception
    when others then
      raise notice 'Error in extract_mentions_from_post: %', sqlerrm;
  end;
end $$;

-- Check if there are any posts with mentions that should create connections
do $$
declare
  post_with_mention record;
  author_col text;
  posts_with_mentions int := 0;
begin
  author_col := public._get_posts_author_column();
  
  if author_col is null then
    raise notice 'No author column found';
    return;
  end if;
  
  -- Check how many posts have @ mentions
  execute format('
    select count(*) 
    from posts 
    where text ~ ''@[a-zA-Z0-9_]+''
       or text ~ ''/u/[a-zA-Z0-9_]+''
  ') into posts_with_mentions;
  
  raise notice 'Posts with potential mentions: %', posts_with_mentions;
  
  -- Try to process one post manually and see what happens
  for post_with_mention in 
    execute format('
      select id, text, %I as author_id
      from posts
      where (text ~ ''@[a-zA-Z0-9_]+'' or text ~ ''/u/[a-zA-Z0-9_]+'')
        and text is not null
      limit 1
    ', author_col)
  loop
    raise notice 'Found post ID: %, text: %, author: %', 
      post_with_mention.id, 
      substring(post_with_mention.text, 1, 50),
      post_with_mention.author_id;
    
    -- Try to extract mentions
    begin
      perform public.extract_mentions_from_post(
        post_with_mention.text,
        post_with_mention.author_id,
        post_with_mention.id
      );
      
      raise notice 'Successfully processed post %', post_with_mention.id;
    exception
      when others then
        raise notice 'Error processing post %: %', post_with_mention.id, sqlerrm;
    end;
  end loop;
end $$;

-- Now process all existing posts
do $$
declare
  post_record record;
  processed_count int := 0;
  author_col text;
  error_count int := 0;
  total_connections_before int;
  total_connections_after int;
begin
  author_col := public._get_posts_author_column();
  
  if author_col is null then
    raise notice 'No author column found, skipping backfill';
    return;
  end if;
  
  -- Count connections before
  select count(*) into total_connections_before from user_connections;
  
  raise notice 'Starting backfill. Current connections: %', total_connections_before;
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
      order by p.created_at desc
    ', author_col)
  loop
    if post_record.post_text is null or trim(post_record.post_text) = '' then
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
  
  raise notice 'Backfill completed. Processed: %, Errors: %', processed_count, error_count;
  raise notice 'Connections before: %, after: %, created: %', 
    total_connections_before, 
    total_connections_after,
    total_connections_after - total_connections_before;
end $$;

-- Final check
select 
  'Final connections count' as info,
  count(*) as total_connections,
  count(distinct user_id) as unique_users
from user_connections;

commit;

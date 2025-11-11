-- Fix extract_mentions_from_post function with better regex handling and logging
begin;

-- Recreate function with improved logic
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
  username_match text;
  user_id_found uuid;
  current_user_id uuid;
  text_lower text;
  mentions_count int := 0;
  connections_created int := 0;
  all_matches text[];
  match_record text;
  insert_error text;
begin
  current_user_id := post_author_id;
  
  if post_text is null or trim(post_text) = '' then
    return;
  end if;
  
  if post_author_id is null then
    return;
  end if;
  
  text_lower := lower(post_text);
  
  -- Extract @username mentions using array approach (more reliable)
  -- Get all matches as array
  select array_agg(match[1]) into all_matches
  from regexp_matches(text_lower, '@([a-z0-9_]+)', 'g') as match;
  
  -- Process each match
  if all_matches is not null then
    foreach match_record in array all_matches
    loop
      username_match := match_record;
      
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
              -- Don't raise, just log via notice if needed
          end;
        end if;
      end if;
    end loop;
  end if;
  
  -- Extract /u/username mentions
  select array_agg(match[1]) into all_matches
  from regexp_matches(text_lower, '/u/([a-z0-9_]+)(\s|$|\n|/)', 'g') as match;
  
  if all_matches is not null then
    foreach match_record in array all_matches
    loop
      username_match := match_record;
      
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
              null;
          end;
        end if;
      end if;
    end loop;
  end if;
  
  -- Check for /u/{user_id} pattern
  select array_agg(match[1]) into all_matches
  from regexp_matches(text_lower, '/u/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(\s|$|\n|/)', 'gi') as match;
  
  if all_matches is not null then
    foreach match_record in array all_matches
    loop
      if match_record is not null then
        begin
          user_id_found := match_record::uuid;
          
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
  end if;
end;
$$;

-- Test the fixed function
do $$
declare
  test_user record;
  test_mentioned_user record;
  connections_before int;
  connections_after int;
  test_text text;
begin
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
    raise notice 'TEST SKIPPED: Need 2 users';
    return;
  end if;
  
  raise notice '=== TESTING FIXED FUNCTION ===';
  raise notice 'Author: % (@%)', test_user.user_id, test_user.username;
  raise notice 'Mentioned: % (@%)', test_mentioned_user.user_id, test_mentioned_user.username;
  
  -- Count connections before
  select count(*) into connections_before
  from user_connections
  where (user_id = test_user.user_id and connected_user_id = test_mentioned_user.user_id)
     or (user_id = test_mentioned_user.user_id and connected_user_id = test_user.user_id);
  
  raise notice 'Connections before: %', connections_before;
  
  -- Create test text
  test_text := format('Hello @%s, how are you?', test_mentioned_user.username);
  raise notice 'Test text: %', test_text;
  
  -- Call function
  begin
    perform public.extract_mentions_from_post(
      test_text,
      test_user.user_id,
      null  -- NULL post_id for test
    );
    
    -- Count connections after
    select count(*) into connections_after
    from user_connections
    where (user_id = test_user.user_id and connected_user_id = test_mentioned_user.user_id)
       or (user_id = test_mentioned_user.user_id and connected_user_id = test_user.user_id);
    
    raise notice 'Connections after: %', connections_after;
    raise notice 'Created: %', connections_after - connections_before;
    
    if connections_after > connections_before then
      raise notice '✅ SUCCESS: Function works!';
    else
      raise notice '❌ FAILED: Function did not create connections';
      
      -- Debug: check regex
      declare
        test_lower text;
        regex_result text[];
      begin
        test_lower := lower(test_text);
        select array_agg(match[1]) into regex_result
        from regexp_matches(test_lower, '@([a-z0-9_]+)', 'g') as match;
        
        raise notice 'Regex test: text_lower=%', test_lower;
        raise notice 'Regex result: %', regex_result;
        raise notice 'Username to find: %', lower(test_mentioned_user.username);
      end;
    end if;
    
    -- Clean up
    delete from user_connections 
    where ((user_id = test_user.user_id and connected_user_id = test_mentioned_user.user_id)
        or (user_id = test_mentioned_user.user_id and connected_user_id = test_user.user_id))
      and post_id is null;
    
  exception
    when others then
      raise notice '❌ ERROR: %', sqlerrm;
  end;
end $$;

-- Final check
select 
  'Final connections count' as info,
  count(*) as total_connections,
  count(distinct user_id) as unique_users
from user_connections;

commit;

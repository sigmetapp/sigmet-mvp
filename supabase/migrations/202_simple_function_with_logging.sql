-- Create simple function with detailed logging
begin;

-- Drop and recreate function with simplest possible logic
drop function if exists public.extract_mentions_from_post(text, uuid, bigint);

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
  all_matches text[];
  match_record text;
  mentions_found int := 0;
  connections_created int := 0;
begin
  -- Initialize
  current_user_id := post_author_id;
  
  -- Validate inputs
  if post_text is null or trim(post_text) = '' then
    raise notice 'extract_mentions: post_text is empty';
    return;
  end if;
  
  if post_author_id is null then
    raise notice 'extract_mentions: post_author_id is null';
    return;
  end if;
  
  raise notice 'extract_mentions: START - post_id=%, author_id=%', post_id, post_author_id;
  raise notice 'extract_mentions: post_text=%', substring(post_text, 1, 100);
  
  -- Convert to lowercase
  text_lower := lower(post_text);
  raise notice 'extract_mentions: text_lower=%', substring(text_lower, 1, 100);
  
  -- Extract @username mentions
  select array_agg(match[1]) into all_matches
  from regexp_matches(text_lower, '@([a-z0-9_]+)', 'g') as match;
  
  if all_matches is null then
    raise notice 'extract_mentions: No @ mentions found';
  else
    raise notice 'extract_mentions: Found % @ mentions: %', 
      array_length(all_matches, 1), 
      array_to_string(all_matches, ', ');
    
    -- Process each match
    foreach match_record in array all_matches
    loop
      username_match := match_record;
      mentions_found := mentions_found + 1;
      
      raise notice 'extract_mentions: Processing mention %: @%', mentions_found, username_match;
      
      -- Lookup user
      select user_id into user_id_found
      from public.profiles
      where lower(trim(username)) = lower(trim(username_match))
        and username is not null
        and username != ''
      limit 1;
      
      if user_id_found is null then
        raise notice 'extract_mentions: Username @% not found in profiles', username_match;
        continue;
      end if;
      
      raise notice 'extract_mentions: Found user_id=% for @%', user_id_found, username_match;
      
      if user_id_found = current_user_id then
        raise notice 'extract_mentions: User_id matches author, skipping';
        continue;
      end if;
      
      -- Insert connections
      begin
        raise notice 'extract_mentions: Inserting connection 1: user_id=%, connected_user_id=%, post_id=%', 
          user_id_found, current_user_id, post_id;
        
        insert into public.user_connections (user_id, connected_user_id, post_id, connection_type)
        values (user_id_found, current_user_id, post_id, 'they_mentioned_me')
        on conflict (user_id, connected_user_id, post_id, connection_type) do nothing;
        
        raise notice 'extract_mentions: Insert 1 successful';
        
        raise notice 'extract_mentions: Inserting connection 2: user_id=%, connected_user_id=%, post_id=%', 
          current_user_id, user_id_found, post_id;
        
        insert into public.user_connections (user_id, connected_user_id, post_id, connection_type)
        values (current_user_id, user_id_found, post_id, 'i_mentioned_them')
        on conflict (user_id, connected_user_id, post_id, connection_type) do nothing;
        
        raise notice 'extract_mentions: Insert 2 successful';
        
        connections_created := connections_created + 2;
        
      exception
        when others then
          raise notice 'extract_mentions: ERROR inserting connections: %', sqlerrm;
      end;
    end loop;
  end if;
  
  raise notice 'extract_mentions: END - mentions_found=%, connections_created=%', mentions_found, connections_created;
end;
$$;

-- Test the function
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
    raise notice 'TEST: Need 2 users';
    return;
  end if;
  
  raise notice '=== TESTING FUNCTION ===';
  raise notice 'Author: % (@%)', test_user.user_id, test_user.username;
  raise notice 'Mentioned: % (@%)', test_mentioned_user.user_id, test_mentioned_user.username;
  
  select count(*) into connections_before
  from user_connections
  where (user_id = test_user.user_id and connected_user_id = test_mentioned_user.user_id)
     or (user_id = test_mentioned_user.user_id and connected_user_id = test_user.user_id);
  
  raise notice 'Connections before: %', connections_before;
  
  test_text := format('Hello @%s, how are you?', test_mentioned_user.username);
  raise notice 'Test text: %', test_text;
  
  begin
    perform public.extract_mentions_from_post(
      test_text,
      test_user.user_id,
      null
    );
    
    select count(*) into connections_after
    from user_connections
    where (user_id = test_user.user_id and connected_user_id = test_mentioned_user.user_id)
       or (user_id = test_mentioned_user.user_id and connected_user_id = test_user.user_id);
    
    raise notice 'Connections after: %', connections_after;
    raise notice 'Created: %', connections_after - connections_before;
    
    if connections_after > connections_before then
      raise notice '✅ TEST SUCCESS';
    else
      raise notice '❌ TEST FAILED';
    end if;
    
    -- Clean up
    delete from user_connections 
    where ((user_id = test_user.user_id and connected_user_id = test_mentioned_user.user_id)
        or (user_id = test_mentioned_user.user_id and connected_user_id = test_user.user_id))
      and post_id is null;
    
  exception
    when others then
      raise notice '❌ TEST ERROR: %', sqlerrm;
  end;
end $$;

-- Final check
select 
  'Final connections count' as info,
  count(*) as total_connections,
  count(distinct user_id) as unique_users
from user_connections;

commit;

-- Comprehensive function test with all results in tables
begin;

-- Create results table
create temp table if not exists function_test_results (
  test_step text,
  result text
);

delete from function_test_results;

-- Step 1: Test regex extraction
do $$
declare
  test_text text := 'Hello @AlexM, how are you?';
  text_lower text;
  regex_matches text[];
  match_count int;
begin
  text_lower := lower(test_text);
  
  -- Test regex
  select array_agg(match[1]) into regex_matches
  from regexp_matches(text_lower, '@([a-z0-9_]+)', 'g') as match;
  
  if regex_matches is not null then
    select array_length(regex_matches, 1) into match_count;
  else
    match_count := 0;
  end if;
  
  insert into function_test_results values 
    ('Тест regex', format('Текст: %s', test_text)),
    ('Тест regex', format('Текст lower: %s', text_lower)),
    ('Тест regex', format('Найдено совпадений: %s', match_count)),
    ('Тест regex', format('Совпадения: %s', coalesce(array_to_string(regex_matches, ', '), 'NULL')));
end $$;

-- Step 2: Test username lookup
do $$
declare
  test_username text := 'AlexM';
  found_user_id uuid;
  found_count int;
begin
  select user_id, count(*) into found_user_id, found_count
  from profiles
  where lower(trim(username)) = lower(trim(test_username))
    and username is not null
    and username != ''
  group by user_id
  limit 1;
  
  insert into function_test_results values 
    ('Тест поиска username', format('Искали: %s', test_username)),
    ('Тест поиска username', format('Найдено записей: %s', found_count)),
    ('Тест поиска username', format('User ID: %s', coalesce(found_user_id::text, 'NULL')));
end $$;

-- Step 3: Test direct insert
do $$
declare
  user1_id uuid;
  user2_id uuid;
  insert_success bool := false;
begin
  select user_id into user1_id
  from profiles
  where username is not null and username != ''
  order by created_at desc
  limit 1;
  
  select user_id into user2_id
  from profiles
  where username is not null 
    and username != ''
    and user_id != coalesce(user1_id, '00000000-0000-0000-0000-000000000000'::uuid)
  order by created_at desc
  limit 1;
  
  if user1_id is null or user2_id is null then
    insert into function_test_results values 
      ('Тест прямой вставки', '❌ Нет двух пользователей');
    return;
  end if;
  
  begin
    insert into public.user_connections (user_id, connected_user_id, post_id, connection_type)
    values (user1_id, user2_id, null, 'they_mentioned_me')
    on conflict (user_id, connected_user_id, post_id, connection_type) do nothing;
    
    insert_success := true;
    insert into function_test_results values 
      ('Тест прямой вставки', format('✅ УСПЕХ: user1=%s, user2=%s', user1_id, user2_id));
    
    -- Clean up
    delete from user_connections 
    where user_id = user1_id and connected_user_id = user2_id and post_id is null;
    
  exception
    when others then
      insert into function_test_results values 
        ('Тест прямой вставки', format('❌ ОШИБКА: %s', sqlerrm));
  end;
end $$;

-- Step 4: Test function step by step
do $$
declare
  test_user record;
  test_mentioned_user record;
  test_text text;
  text_lower text;
  regex_matches text[];
  username_match text;
  user_id_found uuid;
  connections_before int;
  connections_after int;
  step_result text;
begin
  -- Get test users
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
    insert into function_test_results values 
      ('Тест функции', '❌ Нет двух пользователей');
    return;
  end if;
  
  insert into function_test_results values 
    ('Тест функции', format('Автор: %s (@%s)', test_user.user_id, test_user.username)),
    ('Тест функции', format('Упомянутый: %s (@%s)', test_mentioned_user.user_id, test_mentioned_user.username));
  
  -- Create test text
  test_text := format('Hello @%s, how are you?', test_mentioned_user.username);
  text_lower := lower(test_text);
  
  insert into function_test_results values 
    ('Тест функции', format('Тестовый текст: %s', test_text)),
    ('Тест функции', format('Текст lower: %s', text_lower));
  
  -- Step 1: Extract mentions with regex
  select array_agg(match[1]) into regex_matches
  from regexp_matches(text_lower, '@([a-z0-9_]+)', 'g') as match;
  
  if regex_matches is null or array_length(regex_matches, 1) is null then
    insert into function_test_results values 
      ('Тест функции', '❌ Regex не нашел совпадений');
    return;
  end if;
  
  insert into function_test_results values 
    ('Тест функции', format('Regex нашел: %s', array_to_string(regex_matches, ', ')));
  
  -- Step 2: Get first match
  username_match := regex_matches[1];
  insert into function_test_results values 
    ('Тест функции', format('Username match: %s', username_match));
  
  -- Step 3: Lookup user
  select user_id into user_id_found
  from profiles
  where lower(trim(username)) = lower(trim(username_match))
    and username is not null
    and username != ''
  limit 1;
  
  if user_id_found is null then
    insert into function_test_results values 
      ('Тест функции', format('❌ Username "%s" не найден в profiles', username_match));
    return;
  end if;
  
  insert into function_test_results values 
    ('Тест функции', format('✅ Username найден: %s', user_id_found));
  
  if user_id_found = test_user.user_id then
    insert into function_test_results values 
      ('Тест функции', '⚠️ User ID совпадает с автором (пропуск)');
    return;
  end if;
  
  -- Step 4: Count connections before
  select count(*) into connections_before
  from user_connections
  where (user_id = test_user.user_id and connected_user_id = user_id_found)
     or (user_id = user_id_found and connected_user_id = test_user.user_id);
  
  insert into function_test_results values 
    ('Тест функции', format('Connections до: %s', connections_before));
  
  -- Step 5: Try to insert
  begin
    insert into public.user_connections (user_id, connected_user_id, post_id, connection_type)
    values (user_id_found, test_user.user_id, null, 'they_mentioned_me')
    on conflict (user_id, connected_user_id, post_id, connection_type) do nothing;
    
    insert into public.user_connections (user_id, connected_user_id, post_id, connection_type)
    values (test_user.user_id, user_id_found, null, 'i_mentioned_them')
    on conflict (user_id, connected_user_id, post_id, connection_type) do nothing;
    
    -- Count after
    select count(*) into connections_after
    from user_connections
    where (user_id = test_user.user_id and connected_user_id = user_id_found)
       or (user_id = user_id_found and connected_user_id = test_user.user_id);
    
    insert into function_test_results values 
      ('Тест функции', format('Connections после: %s', connections_after)),
      ('Тест функции', format('Создано: %s', connections_after - connections_before));
    
    if connections_after > connections_before then
      insert into function_test_results values 
        ('Тест функции', '✅ УСПЕХ: Connections созданы!');
    else
      insert into function_test_results values 
        ('Тест функции', '❌ ОШИБКА: Connections не созданы');
    end if;
    
    -- Clean up
    delete from user_connections 
    where ((user_id = test_user.user_id and connected_user_id = user_id_found)
        or (user_id = user_id_found and connected_user_id = test_user.user_id))
      and post_id is null;
    
  exception
    when others then
      insert into function_test_results values 
        ('Тест функции', format('❌ ОШИБКА при вставке: %s', sqlerrm));
  end;
end $$;

-- Step 5: Test actual function call
do $$
declare
  test_user record;
  test_mentioned_user record;
  connections_before int;
  connections_after int;
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
    insert into function_test_results values 
      ('Тест вызова функции', '❌ Нет двух пользователей');
    return;
  end if;
  
  select count(*) into connections_before
  from user_connections
  where (user_id = test_user.user_id and connected_user_id = test_mentioned_user.user_id)
     or (user_id = test_mentioned_user.user_id and connected_user_id = test_user.user_id);
  
  begin
    perform public.extract_mentions_from_post(
      format('Hello @%s, how are you?', test_mentioned_user.username),
      test_user.user_id,
      null
    );
    
    select count(*) into connections_after
    from user_connections
    where (user_id = test_user.user_id and connected_user_id = test_mentioned_user.user_id)
       or (user_id = test_mentioned_user.user_id and connected_user_id = test_user.user_id);
    
    if connections_after > connections_before then
      insert into function_test_results values 
        ('Тест вызова функции', format('✅ УСПЕХ: создано %s connections', (connections_after - connections_before)::text));
    else
      insert into function_test_results values 
        ('Тест вызова функции', format('❌ ОШИБКА: было %s, стало %s', connections_before, connections_after));
    end if;
    
    -- Clean up
    delete from user_connections 
    where ((user_id = test_user.user_id and connected_user_id = test_mentioned_user.user_id)
        or (user_id = test_mentioned_user.user_id and connected_user_id = test_user.user_id))
      and post_id is null;
    
  exception
    when others then
      insert into function_test_results values 
        ('Тест вызова функции', format('❌ ОШИБКА: %s', sqlerrm));
  end;
end $$;

-- Show all results
select test_step, result from function_test_results 
order by 
  case test_step
    when 'Тест regex' then 1
    when 'Тест поиска username' then 2
    when 'Тест прямой вставки' then 3
    when 'Тест функции' then 4
    when 'Тест вызова функции' then 5
    else 6
  end,
  result;

-- Final statistics
select 
  'ФИНАЛЬНАЯ СТАТИСТИКА' as info,
  count(*)::text as total_connections,
  count(distinct user_id)::text as unique_users
from user_connections;

commit;

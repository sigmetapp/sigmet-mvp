-- Final debug - all results in tables, no logs needed
begin;

-- Create results table
create temp table debug_results (
  step_num int,
  step_name text,
  result text
);

delete from debug_results;

-- Step 1: Check if we have users
insert into debug_results
select 1, 'Проверка пользователей', 
  format('Найдено пользователей с username: %s', count(*))
from profiles
where username is not null and username != '';

-- Step 2: Get test users
do $$
declare
  user1_id uuid;
  user1_username text;
  user2_id uuid;
  user2_username text;
begin
  select user_id, username into user1_id, user1_username
  from profiles
  where username is not null and username != ''
  order by created_at desc
  limit 1;
  
  select user_id, username into user2_id, user2_username
  from profiles
  where username is not null 
    and username != ''
    and user_id != coalesce(user1_id, '00000000-0000-0000-0000-000000000000'::uuid)
  order by created_at desc
  limit 1;
  
  if user1_id is null or user2_id is null then
    insert into debug_results values (2, 'Получение тестовых пользователей', '❌ Нет двух пользователей');
    return;
  end if;
  
  insert into debug_results values 
    (2, 'Пользователь 1', format('%s (@%s)', user1_id, user1_username)),
    (2, 'Пользователь 2', format('%s (@%s)', user2_id, user2_username));
end $$;

-- Step 3: Test regex directly
insert into debug_results
select 3, 'Тест regex', 
  format('Найдено совпадений: %s', 
    coalesce(
      (select array_length(array_agg(match[1]), 1)
       from regexp_matches('hello @alexm, how are you?', '@([a-z0-9_]+)', 'g') as match),
      0
    )
  );

-- Step 4: Test direct insert (bypass function)
do $$
declare
  user1_id uuid;
  user2_id uuid;
  insert_count int;
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
    insert into debug_results values (4, 'Прямая вставка', '❌ Нет пользователей');
    return;
  end if;
  
  begin
    insert into public.user_connections (user_id, connected_user_id, post_id, connection_type)
    values (user1_id, user2_id, null, 'they_mentioned_me')
    on conflict (user_id, connected_user_id, post_id, connection_type) do nothing;
    
    insert into public.user_connections (user_id, connected_user_id, post_id, connection_type)
    values (user2_id, user1_id, null, 'i_mentioned_them')
    on conflict (user_id, connected_user_id, post_id, connection_type) do nothing;
    
    select count(*) into insert_count
    from user_connections
    where (user_id = user1_id and connected_user_id = user2_id)
       or (user_id = user2_id and connected_user_id = user1_id);
    
    if insert_count > 0 then
      insert into debug_results values 
        (4, 'Прямая вставка', format('✅ УСПЕХ: создано %s connections', insert_count));
      
      -- Clean up
      delete from user_connections 
      where (user_id = user1_id and connected_user_id = user2_id)
         or (user_id = user2_id and connected_user_id = user1_id);
    else
      insert into debug_results values (4, 'Прямая вставка', '❌ ОШИБКА: connections не созданы');
    end if;
    
  exception
    when others then
      insert into debug_results values (4, 'Прямая вставка', format('❌ ОШИБКА: %s', sqlerrm));
  end;
end $$;

-- Step 5: Test function call and check what happens
do $$
declare
  test_user record;
  test_mentioned_user record;
  test_text text;
  text_lower text;
  regex_result text[];
  username_from_regex text;
  found_user_id uuid;
  connections_before int;
  connections_after int;
  function_called bool := false;
begin
  -- Get users
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
    insert into debug_results values (5, 'Тест функции', '❌ Нет пользователей');
    return;
  end if;
  
  insert into debug_results values 
    (5, 'Тест функции - Автор', format('%s (@%s)', test_user.user_id, test_user.username)),
    (5, 'Тест функции - Упомянутый', format('%s (@%s)', test_mentioned_user.user_id, test_mentioned_user.username));
  
  -- Create test text
  test_text := format('Hello @%s, how are you?', test_mentioned_user.username);
  text_lower := lower(test_text);
  
  insert into debug_results values 
    (5, 'Тест функции - Текст', test_text),
    (5, 'Тест функции - Текст lower', text_lower);
  
  -- Test regex manually
  select array_agg(match[1]) into regex_result
  from regexp_matches(text_lower, '@([a-z0-9_]+)', 'g') as match;
  
  if regex_result is null or array_length(regex_result, 1) is null then
    insert into debug_results values (5, 'Тест функции - Regex', '❌ Не нашел совпадений');
    return;
  end if;
  
  username_from_regex := regex_result[1];
  insert into debug_results values 
    (5, 'Тест функции - Regex результат', format('Найдено: %s', array_to_string(regex_result, ', '))),
    (5, 'Тест функции - Username из regex', username_from_regex);
  
  -- Lookup user
  select user_id into found_user_id
  from profiles
  where lower(trim(username)) = lower(trim(username_from_regex))
    and username is not null
    and username != ''
  limit 1;
  
  if found_user_id is null then
    insert into debug_results values 
      (5, 'Тест функции - Поиск username', format('❌ Username "%s" не найден', username_from_regex));
    return;
  end if;
  
  insert into debug_results values 
    (5, 'Тест функции - Поиск username', format('✅ Найден: %s', found_user_id));
  
  if found_user_id = test_user.user_id then
    insert into debug_results values (5, 'Тест функции - Проверка', '⚠️ User ID совпадает с автором (пропуск)');
    return;
  end if;
  
  -- Count before
  select count(*) into connections_before
  from user_connections
  where (user_id = test_user.user_id and connected_user_id = found_user_id)
     or (user_id = found_user_id and connected_user_id = test_user.user_id);
  
  insert into debug_results values (5, 'Тест функции - Connections до', connections_before::text);
  
  -- Call function
  begin
    perform public.extract_mentions_from_post(
      test_text,
      test_user.user_id,
      null
    );
    
    function_called := true;
    insert into debug_results values (5, 'Тест функции - Вызов', '✅ Функция выполнена без ошибок');
    
  exception
    when others then
      insert into debug_results values 
        (5, 'Тест функции - Вызов', format('❌ ОШИБКА: %s', sqlerrm));
      return;
  end;
  
  -- Count after
  select count(*) into connections_after
  from user_connections
  where (user_id = test_user.user_id and connected_user_id = found_user_id)
     or (user_id = found_user_id and connected_user_id = test_user.user_id);
  
  insert into debug_results values 
    (5, 'Тест функции - Connections после', connections_after::text),
    (5, 'Тест функции - Создано', (connections_after - connections_before)::text);
  
  if connections_after > connections_before then
    insert into debug_results values (5, 'Тест функции - Результат', '✅ УСПЕХ: Connections созданы!');
  else
    insert into debug_results values (5, 'Тест функции - Результат', '❌ ОШИБКА: Connections НЕ созданы');
    
    -- Try manual insert to see if it works
    begin
      insert into public.user_connections (user_id, connected_user_id, post_id, connection_type)
      values (found_user_id, test_user.user_id, null, 'they_mentioned_me')
      on conflict (user_id, connected_user_id, post_id, connection_type) do nothing;
      
      insert into debug_results values (5, 'Тест функции - Ручная вставка', '✅ Работает (значит проблема в функции)');
      
      -- Clean up
      delete from user_connections 
      where (user_id = test_user.user_id and connected_user_id = found_user_id)
         or (user_id = found_user_id and connected_user_id = test_user.user_id);
      
    exception
      when others then
        insert into debug_results values 
          (5, 'Тест функции - Ручная вставка', format('❌ ОШИБКА: %s', sqlerrm));
    end;
  end if;
  
  -- Clean up test connections
  delete from user_connections 
  where ((user_id = test_user.user_id and connected_user_id = found_user_id)
      or (user_id = found_user_id and connected_user_id = test_user.user_id))
    and post_id is null;
    
end $$;

-- Step 6: Check function definition
insert into debug_results
select 6, 'Проверка функции', 
  case 
    when exists (select 1 from pg_proc where proname = 'extract_mentions_from_post') 
    then '✅ Функция существует'
    else '❌ Функция не существует'
  end;

-- Step 7: Check RLS policies
insert into debug_results
select 7, 'RLS политики', 
  format('Найдено политик: %s', count(*))
from pg_policies
where tablename = 'user_connections';

-- Show all results
select step_num, step_name, result 
from debug_results 
order by step_num, step_name;

-- Final statistics
select 
  'ФИНАЛЬНАЯ СТАТИСТИКА' as info,
  count(*)::text as total_connections,
  count(distinct user_id)::text as unique_users
from user_connections;

commit;

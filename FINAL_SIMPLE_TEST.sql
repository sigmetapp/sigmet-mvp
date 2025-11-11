-- Финальный простой тест - все результаты в SELECT
-- Выполните в Supabase SQL Editor

-- 1. Тест regex
SELECT 
  '1. ТЕСТ REGEX' as test_name,
  'Текст: Hello @AlexM, how are you?' as step,
  array_to_string(
    (SELECT array_agg(match[1]) 
     FROM regexp_matches('hello @alexm, how are you?', '@([a-z0-9_]+)', 'g') as match),
    ', '
  ) as result;

-- 2. Тест поиска username
SELECT 
  '2. ТЕСТ ПОИСКА USERNAME' as test_name,
  'Искали: AlexM' as step,
  COALESCE(
    (SELECT user_id::text 
     FROM profiles 
     WHERE lower(trim(username)) = 'alexm' 
       AND username IS NOT NULL 
       AND username != ''
     LIMIT 1),
    'НЕ НАЙДЕН'
  ) as result;

-- 3. Тест прямой вставки
DO $$
DECLARE
  user1_id uuid;
  user2_id uuid;
  insert_success bool := false;
  error_msg text;
BEGIN
  SELECT user_id INTO user1_id
  FROM profiles
  WHERE username IS NOT NULL AND username != ''
  ORDER BY created_at DESC
  LIMIT 1;
  
  SELECT user_id INTO user2_id
  FROM profiles
  WHERE username IS NOT NULL 
    AND username != ''
    AND user_id != COALESCE(user1_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF user1_id IS NULL OR user2_id IS NULL THEN
    RAISE NOTICE 'Нет двух пользователей';
    RETURN;
  END IF;
  
  BEGIN
    INSERT INTO public.user_connections (user_id, connected_user_id, post_id, connection_type)
    VALUES (user1_id, user2_id, NULL, 'they_mentioned_me')
    ON CONFLICT (user_id, connected_user_id, post_id, connection_type) DO NOTHING;
    
    insert_success := true;
    
    -- Clean up
    DELETE FROM user_connections 
    WHERE user_id = user1_id AND connected_user_id = user2_id AND post_id IS NULL;
    
  EXCEPTION
    WHEN OTHERS THEN
      error_msg := SQLERRM;
      RAISE NOTICE 'Ошибка: %', error_msg;
  END;
END $$;

SELECT 
  '3. ТЕСТ ПРЯМОЙ ВСТАВКИ' as test_name,
  'Результат' as step,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM user_connections LIMIT 1
    ) THEN '✅ Таблица работает'
    ELSE 'Проверьте логи выше'
  END as result;

-- 4. Пошаговый тест функции
WITH test_data AS (
  SELECT 
    (SELECT user_id FROM profiles WHERE username IS NOT NULL AND username != '' ORDER BY created_at DESC LIMIT 1) as user1_id,
    (SELECT username FROM profiles WHERE username IS NOT NULL AND username != '' ORDER BY created_at DESC LIMIT 1) as user1_username,
    (SELECT user_id FROM profiles WHERE username IS NOT NULL AND username != '' AND user_id != (SELECT user_id FROM profiles WHERE username IS NOT NULL AND username != '' ORDER BY created_at DESC LIMIT 1) ORDER BY created_at DESC LIMIT 1) as user2_id,
    (SELECT username FROM profiles WHERE username IS NOT NULL AND username != '' AND user_id != (SELECT user_id FROM profiles WHERE username IS NOT NULL AND username != '' ORDER BY created_at DESC LIMIT 1) ORDER BY created_at DESC LIMIT 1) as user2_username
)
SELECT 
  '4. ПОШАГОВЫЙ ТЕСТ' as test_name,
  'Автор' as step,
  format('%s (@%s)', user1_id, user1_username) as result
FROM test_data

UNION ALL

SELECT 
  '',
  'Упомянутый',
  format('%s (@%s)', user2_id, user2_username)
FROM test_data

UNION ALL

SELECT 
  '',
  'Тестовый текст',
  format('Hello @%s, how are you?', user2_username)
FROM test_data

UNION ALL

SELECT 
  '',
  'Regex результат',
  array_to_string(
    (SELECT array_agg(match[1]) 
     FROM regexp_matches(lower(format('Hello @%s, how are you?', user2_username)), '@([a-z0-9_]+)', 'g') as match),
    ', '
  )
FROM test_data

UNION ALL

SELECT 
  '',
  'Username найден',
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM profiles 
      WHERE lower(trim(username)) = lower(user2_username)
        AND username IS NOT NULL
    ) THEN '✅ ДА'
    ELSE '❌ НЕТ'
  END
FROM test_data;

-- 5. Тест вызова функции
DO $$
DECLARE
  test_user record;
  test_mentioned_user record;
  connections_before int;
  connections_after int;
  test_text text;
BEGIN
  SELECT user_id, username INTO test_user
  FROM profiles
  WHERE username IS NOT NULL AND username != ''
  ORDER BY created_at DESC
  LIMIT 1;
  
  SELECT user_id, username INTO test_mentioned_user
  FROM profiles
  WHERE username IS NOT NULL 
    AND username != ''
    AND user_id != COALESCE(test_user.user_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF test_user.user_id IS NULL OR test_mentioned_user.user_id IS NULL THEN
    RAISE NOTICE 'Нет двух пользователей для теста';
    RETURN;
  END IF;
  
  -- Count before
  SELECT COUNT(*) INTO connections_before
  FROM user_connections
  WHERE (user_id = test_user.user_id AND connected_user_id = test_mentioned_user.user_id)
     OR (user_id = test_mentioned_user.user_id AND connected_user_id = test_user.user_id);
  
  RAISE NOTICE '=== ВЫЗОВ ФУНКЦИИ ===';
  RAISE NOTICE 'Connections до: %', connections_before;
  
  -- Create test text
  test_text := format('Hello @%s, how are you?', test_mentioned_user.username);
  RAISE NOTICE 'Текст: %', test_text;
  
  -- Call function
  BEGIN
    PERFORM public.extract_mentions_from_post(
      test_text,
      test_user.user_id,
      NULL
    );
    
    RAISE NOTICE 'Функция выполнена без ошибок';
    
    -- Count after
    SELECT COUNT(*) INTO connections_after
    FROM user_connections
    WHERE (user_id = test_user.user_id AND connected_user_id = test_mentioned_user.user_id)
       OR (user_id = test_mentioned_user.user_id AND connected_user_id = test_user.user_id);
    
    RAISE NOTICE 'Connections после: %', connections_after;
    RAISE NOTICE 'Создано: %', connections_after - connections_before;
    
    IF connections_after > connections_before THEN
      RAISE NOTICE '✅ УСПЕХ: Connections созданы!';
    ELSE
      RAISE NOTICE '❌ ОШИБКА: Connections НЕ созданы';
      
      -- Debug: check what function should have found
      DECLARE
        text_lower text;
        regex_matches text[];
        username_match text;
        found_user_id uuid;
      BEGIN
        text_lower := lower(test_text);
        SELECT array_agg(match[1]) INTO regex_matches
        FROM regexp_matches(text_lower, '@([a-z0-9_]+)', 'g') as match;
        
        RAISE NOTICE 'Отладка: text_lower=%', text_lower;
        RAISE NOTICE 'Отладка: regex_matches=%', regex_matches;
        
        IF regex_matches IS NOT NULL AND array_length(regex_matches, 1) > 0 THEN
          username_match := regex_matches[1];
          RAISE NOTICE 'Отладка: username_match=%', username_match;
          
          SELECT user_id INTO found_user_id
          FROM profiles
          WHERE lower(trim(username)) = lower(trim(username_match))
            AND username IS NOT NULL
            AND username != ''
          LIMIT 1;
          
          RAISE NOTICE 'Отладка: found_user_id=%', found_user_id;
          RAISE NOTICE 'Отладка: test_user.user_id=%', test_user.user_id;
          RAISE NOTICE 'Отладка: Совпадают? %', (found_user_id = test_user.user_id);
        END IF;
      END;
    END IF;
    
    -- Clean up
    DELETE FROM user_connections 
    WHERE ((user_id = test_user.user_id AND connected_user_id = test_mentioned_user.user_id)
        OR (user_id = test_mentioned_user.user_id AND connected_user_id = test_user.user_id))
      AND post_id IS NULL;
    
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE '❌ ОШИБКА при вызове функции: %', SQLERRM;
      RAISE NOTICE 'Код ошибки: %', SQLSTATE;
  END;
END $$;

-- 6. Финальная статистика
SELECT 
  '6. ФИНАЛЬНАЯ СТАТИСТИКА' as test_name,
  'Total connections' as step,
  COUNT(*)::text as result
FROM user_connections;

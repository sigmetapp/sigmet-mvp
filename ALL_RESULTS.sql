-- Все результаты в одной таблице
-- Выполните в Supabase SQL Editor

-- Создаем временную таблицу для результатов
CREATE TEMP TABLE IF NOT EXISTS all_test_results (
  id serial,
  test_name text,
  result text
);

DELETE FROM all_test_results;

-- 1. Проверка пользователей
INSERT INTO all_test_results (test_name, result)
SELECT '1. Пользователи', format('Найдено: %s', COUNT(*))
FROM profiles
WHERE username IS NOT NULL AND username != '';

-- 2. Получение тестовых пользователей
DO $$
DECLARE
  user1_id uuid;
  user1_username text;
  user2_id uuid;
  user2_username text;
BEGIN
  SELECT user_id, username INTO user1_id, user1_username
  FROM profiles
  WHERE username IS NOT NULL AND username != ''
  ORDER BY created_at DESC
  LIMIT 1;
  
  SELECT user_id, username INTO user2_id, user2_username
  FROM profiles
  WHERE username IS NOT NULL 
    AND username != ''
    AND user_id != COALESCE(user1_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF user1_id IS NULL OR user2_id IS NULL THEN
    INSERT INTO all_test_results (test_name, result) VALUES 
      ('2. Тестовые пользователи', '❌ Нет двух пользователей');
    RETURN;
  END IF;
  
  INSERT INTO all_test_results (test_name, result) VALUES 
    ('2. Тестовые пользователи', format('User1: %s (@%s)', user1_id, user1_username)),
    ('2. Тестовые пользователи', format('User2: %s (@%s)', user2_id, user2_username));
END $$;

-- 3. Тест regex
INSERT INTO all_test_results (test_name, result)
SELECT '3. Тест regex', 
  format('Найдено: %s', 
    COALESCE(
      (SELECT array_length(array_agg(match[1]), 1)
       FROM regexp_matches('hello @alexm, how are you?', '@([a-z0-9_]+)', 'g') as match),
      0
    )::text
  );

-- 4. Тест прямой вставки
DO $$
DECLARE
  user1_id uuid;
  user2_id uuid;
  insert_count int;
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
    INSERT INTO all_test_results (test_name, result) VALUES 
      ('4. Прямая вставка', '❌ Нет пользователей');
    RETURN;
  END IF;
  
  BEGIN
    INSERT INTO public.user_connections (user_id, connected_user_id, post_id, connection_type)
    VALUES (user1_id, user2_id, NULL, 'they_mentioned_me')
    ON CONFLICT (user_id, connected_user_id, post_id, connection_type) DO NOTHING;
    
    SELECT COUNT(*) INTO insert_count
    FROM user_connections
    WHERE (user_id = user1_id AND connected_user_id = user2_id)
       OR (user_id = user2_id AND connected_user_id = user1_id);
    
    IF insert_count > 0 THEN
      INSERT INTO all_test_results (test_name, result) VALUES 
        ('4. Прямая вставка', format('✅ УСПЕХ: %s connections', insert_count));
      
      DELETE FROM user_connections 
      WHERE (user_id = user1_id AND connected_user_id = user2_id)
         OR (user_id = user2_id AND connected_user_id = user1_id);
    ELSE
      INSERT INTO all_test_results (test_name, result) VALUES 
        ('4. Прямая вставка', '❌ ОШИБКА');
    END IF;
    
  EXCEPTION
    WHEN OTHERS THEN
      INSERT INTO all_test_results (test_name, result) VALUES 
        ('4. Прямая вставка', format('❌ ОШИБКА: %s', SQLERRM));
  END;
END $$;

-- 5. Тест функции (пошагово)
DO $$
DECLARE
  test_user record;
  test_mentioned_user record;
  test_text text;
  text_lower text;
  regex_result text[];
  username_match text;
  found_user_id uuid;
  connections_before int;
  connections_after int;
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
    INSERT INTO all_test_results (test_name, result) VALUES 
      ('5. Тест функции', '❌ Нет пользователей');
    RETURN;
  END IF;
  
  INSERT INTO all_test_results (test_name, result) VALUES 
    ('5. Тест функции', format('Автор: %s (@%s)', test_user.user_id, test_user.username)),
    ('5. Тест функции', format('Упомянутый: %s (@%s)', test_mentioned_user.user_id, test_mentioned_user.username));
  
  test_text := format('Hello @%s, how are you?', test_mentioned_user.username);
  text_lower := lower(test_text);
  
  INSERT INTO all_test_results (test_name, result) VALUES 
    ('5. Тест функции', format('Текст: %s', test_text));
  
  -- Regex
  SELECT array_agg(match[1]) INTO regex_result
  FROM regexp_matches(text_lower, '@([a-z0-9_]+)', 'g') as match;
  
  IF regex_result IS NULL OR array_length(regex_result, 1) IS NULL THEN
    INSERT INTO all_test_results (test_name, result) VALUES 
      ('5. Тест функции', '❌ Regex не нашел совпадений');
    RETURN;
  END IF;
  
  username_match := regex_result[1];
  INSERT INTO all_test_results (test_name, result) VALUES 
    ('5. Тест функции', format('Regex нашел: %s', username_match));
  
  -- Lookup
  SELECT user_id INTO found_user_id
  FROM profiles
  WHERE lower(trim(username)) = lower(trim(username_match))
    AND username IS NOT NULL
    AND username != ''
  LIMIT 1;
  
  IF found_user_id IS NULL THEN
    INSERT INTO all_test_results (test_name, result) VALUES 
      ('5. Тест функции', format('❌ Username "%s" не найден', username_match));
    RETURN;
  END IF;
  
  INSERT INTO all_test_results (test_name, result) VALUES 
    ('5. Тест функции', format('✅ Username найден: %s', found_user_id));
  
  IF found_user_id = test_user.user_id THEN
    INSERT INTO all_test_results (test_name, result) VALUES 
      ('5. Тест функции', '⚠️ User ID = автор (пропуск)');
    RETURN;
  END IF;
  
  -- Count before
  SELECT COUNT(*) INTO connections_before
  FROM user_connections
  WHERE (user_id = test_user.user_id AND connected_user_id = found_user_id)
     OR (user_id = found_user_id AND connected_user_id = test_user.user_id);
  
  INSERT INTO all_test_results (test_name, result) VALUES 
    ('5. Тест функции', format('Connections до: %s', connections_before));
  
  -- Call function
  BEGIN
    PERFORM public.extract_mentions_from_post(
      test_text,
      test_user.user_id,
      NULL
    );
    
    INSERT INTO all_test_results (test_name, result) VALUES 
      ('5. Тест функции', '✅ Функция выполнена');
    
  EXCEPTION
    WHEN OTHERS THEN
      INSERT INTO all_test_results (test_name, result) VALUES 
        ('5. Тест функции', format('❌ ОШИБКА: %s', SQLERRM));
      RETURN;
  END;
  
  -- Count after
  SELECT COUNT(*) INTO connections_after
  FROM user_connections
  WHERE (user_id = test_user.user_id AND connected_user_id = found_user_id)
     OR (user_id = found_user_id AND connected_user_id = test_user.user_id);
  
  INSERT INTO all_test_results (test_name, result) VALUES 
    ('5. Тест функции', format('Connections после: %s', connections_after)),
    ('5. Тест функции', format('Создано: %s', connections_after - connections_before));
  
  IF connections_after > connections_before THEN
    INSERT INTO all_test_results (test_name, result) VALUES 
      ('5. Тест функции', '✅ УСПЕХ: Connections созданы!');
  ELSE
    INSERT INTO all_test_results (test_name, result) VALUES 
      ('5. Тест функции', '❌ ОШИБКА: Connections НЕ созданы');
  END IF;
  
  -- Clean up
  DELETE FROM user_connections 
  WHERE ((user_id = test_user.user_id AND connected_user_id = found_user_id)
      OR (user_id = found_user_id AND connected_user_id = test_user.user_id))
    AND post_id IS NULL;
    
END $$;

-- Показать ВСЕ результаты
SELECT test_name, result 
FROM all_test_results 
ORDER BY id;

-- Финальная статистика
SELECT 
  'ФИНАЛЬНАЯ СТАТИСТИКА' as test_name,
  format('Connections: %s, Users: %s', 
    COUNT(*)::text,
    COUNT(DISTINCT user_id)::text
  ) as result
FROM user_connections;

-- Детальная диагностика - все результаты в таблицах
-- Выполните в Supabase SQL Editor

-- 1. Базовые проверки
SELECT 
  'Всего постов' as metric,
  COUNT(*)::text as value
FROM posts

UNION ALL

SELECT 
  'Посты с текстом',
  COUNT(*)::text
FROM posts
WHERE text IS NOT NULL AND trim(text) != ''

UNION ALL

SELECT 
  'Посты с @ упоминаниями (regex)',
  COUNT(*)::text
FROM posts
WHERE text ~ '@[a-zA-Z0-9_]+'

UNION ALL

SELECT 
  'Посты с /u/ упоминаниями (regex)',
  COUNT(*)::text
FROM posts
WHERE text ~ '/u/[a-zA-Z0-9_]+'

UNION ALL

SELECT 
  'Пользователи с username',
  COUNT(*)::text
FROM profiles
WHERE username IS NOT NULL AND username != ''

UNION ALL

SELECT 
  'Текущие connections',
  COUNT(*)::text
FROM user_connections;

-- 2. Показать реальные посты с mentions
SELECT 
  '=== РЕАЛЬНЫЕ ПОСТЫ С MENTIONS ===' as section,
  id::text,
  author_id::text,
  SUBSTRING(text, 1, 100) as text_preview,
  created_at::text
FROM posts
WHERE text ~ '@[a-zA-Z0-9_]+' OR text ~ '/u/[a-zA-Z0-9_]+'
ORDER BY created_at DESC
LIMIT 10;

-- 3. Извлечь все упомянутые username из постов
SELECT 
  '=== USERNAME УПОМЯНУТЫЕ В ПОСТАХ ===' as section,
  (regexp_matches(LOWER(text), '@([a-z0-9_]+)', 'g'))[1] as mentioned_username,
  COUNT(*) as mention_count
FROM posts
WHERE text ~ '@[a-zA-Z0-9_]+'
GROUP BY (regexp_matches(LOWER(text), '@([a-z0-9_]+)', 'g'))[1]
ORDER BY mention_count DESC
LIMIT 20;

-- 4. Проверить, существуют ли эти username в profiles
WITH mentioned_usernames AS (
  SELECT DISTINCT
    (regexp_matches(LOWER(text), '@([a-z0-9_]+)', 'g'))[1] as username_lower
  FROM posts
  WHERE text ~ '@[a-zA-Z0-9_]+'
)
SELECT 
  '=== СОВПАДЕНИЯ USERNAME ===' as section,
  mu.username_lower as mentioned_in_posts,
  COALESCE(pr.username, 'НЕ НАЙДЕН') as found_username,
  CASE 
    WHEN pr.user_id IS NOT NULL THEN '✅ Найден'
    ELSE '❌ НЕ найден'
  END as status,
  COALESCE(pr.user_id::text, '') as user_id
FROM mentioned_usernames mu
LEFT JOIN profiles pr ON LOWER(TRIM(pr.username)) = LOWER(TRIM(mu.username_lower))
ORDER BY status, mu.username_lower
LIMIT 30;

-- 5. Тест функции вручную (создаст временную таблицу с результатами)
DO $$
DECLARE
  test_user record;
  test_mentioned_user record;
  test_post_id bigint := 555555;
  test_text text;
  connections_before int;
  connections_after int;
  test_result_text text;
BEGIN
  -- Получить двух разных пользователей
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
  
  -- Создать таблицу для результата
  CREATE TEMP TABLE IF NOT EXISTS test_function_result (
    step text,
    result text
  );
  
  DELETE FROM test_function_result;
  
  IF test_user.user_id IS NULL OR test_mentioned_user.user_id IS NULL THEN
    INSERT INTO test_function_result VALUES 
      ('ОШИБКА', 'Нужно минимум 2 пользователя с username для теста'),
      ('User 1', COALESCE(test_user.user_id::text, 'NULL')),
      ('User 2', COALESCE(test_mentioned_user.user_id::text, 'NULL'));
    RETURN;
  END IF;
  
  INSERT INTO test_function_result VALUES 
    ('Автор поста', format('%s (@%s)', test_user.user_id, test_user.username)),
    ('Упомянутый пользователь', format('%s (@%s)', test_mentioned_user.user_id, test_mentioned_user.username));
  
  -- Проверить connections до
  SELECT COUNT(*) INTO connections_before
  FROM user_connections
  WHERE post_id = test_post_id;
  
  INSERT INTO test_function_result VALUES 
    ('Connections до теста', connections_before::text);
  
  -- Создать тестовый текст
  test_text := format('Hello @%s, how are you?', test_mentioned_user.username);
  INSERT INTO test_function_result VALUES 
    ('Тестовый текст', test_text);
  
  -- Проверить, найдет ли функция username
  DECLARE
    username_found_count int;
  BEGIN
    SELECT COUNT(*) INTO username_found_count
    FROM profiles
    WHERE LOWER(TRIM(username)) = LOWER(TRIM(test_mentioned_user.username));
    
    INSERT INTO test_function_result VALUES 
      ('Найдено совпадений username в profiles', username_found_count::text);
  END;
  
  -- Вызвать функцию
  BEGIN
    PERFORM public.extract_mentions_from_post(
      test_text,
      test_user.user_id,
      test_post_id
    );
    
    INSERT INTO test_function_result VALUES 
      ('Функция выполнена', 'Без ошибок');
    
    -- Проверить connections после
    SELECT COUNT(*) INTO connections_after
    FROM user_connections
    WHERE post_id = test_post_id;
    
    INSERT INTO test_function_result VALUES 
      ('Connections после теста', connections_after::text),
      ('Создано connections', (connections_after - connections_before)::text);
    
    IF connections_after > connections_before THEN
      INSERT INTO test_function_result VALUES 
        ('Результат', '✅ УСПЕХ: Connections созданы!');
    ELSE
      INSERT INTO test_function_result VALUES 
        ('Результат', '❌ ОШИБКА: Connections НЕ созданы!');
      
      -- Попробовать вставить вручную, чтобы проверить RLS
      BEGIN
        INSERT INTO public.user_connections (user_id, connected_user_id, post_id, connection_type)
        VALUES (test_mentioned_user.user_id, test_user.user_id, test_post_id, 'they_mentioned_me')
        ON CONFLICT DO NOTHING;
        
        INSERT INTO test_function_result VALUES 
          ('Ручная вставка', '✅ Успешно (RLS не блокирует)');
      EXCEPTION
        WHEN OTHERS THEN
          INSERT INTO test_function_result VALUES 
            ('Ручная вставка', format('❌ Ошибка: %s', SQLERRM));
      END;
    END IF;
    
    -- Очистить тестовые данные
    DELETE FROM user_connections WHERE post_id = test_post_id;
    
  EXCEPTION
    WHEN OTHERS THEN
      INSERT INTO test_function_result VALUES 
        ('ОШИБКА при выполнении функции', SQLERRM),
        ('Код ошибки', SQLSTATE);
  END;
END $$;

-- Показать результат теста
SELECT 
  '=== РЕЗУЛЬТАТ ТЕСТА ФУНКЦИИ ===' as section,
  step,
  result
FROM test_function_result
ORDER BY 
  CASE step
    WHEN 'Результат' THEN 1
    WHEN 'ОШИБКА при выполнении функции' THEN 1
    WHEN 'Автор поста' THEN 2
    WHEN 'Упомянутый пользователь' THEN 3
    WHEN 'Тестовый текст' THEN 4
    WHEN 'Connections до теста' THEN 5
    WHEN 'Connections после теста' THEN 6
    WHEN 'Создано connections' THEN 7
    WHEN 'Ручная вставка' THEN 8
    ELSE 9
  END;

-- 6. Проверить RLS политики
SELECT 
  '=== RLS ПОЛИТИКИ ===' as section,
  policyname,
  cmd::text as command,
  CASE WHEN qual IS NOT NULL THEN 'Есть' ELSE 'Нет' END as has_qual,
  CASE WHEN with_check IS NOT NULL THEN 'Есть' ELSE 'Нет' END as has_with_check,
  qual::text as qual_text,
  with_check::text as with_check_text
FROM pg_policies
WHERE tablename = 'user_connections';

-- 7. Проверить триггер
SELECT 
  '=== ТРИГГЕР ===' as section,
  tgname as trigger_name,
  CASE tgenabled
    WHEN 'O' THEN 'Включен'
    WHEN 'D' THEN 'Выключен'
    ELSE 'Неизвестно'
  END as status,
  pg_get_triggerdef(oid) as definition
FROM pg_trigger
WHERE tgname = 'post_connections_trigger';

-- 8. Попробовать обработать реальный пост вручную
DO $$
DECLARE
  real_post record;
  author_col text;
  connections_before int;
  connections_after int;
BEGIN
  author_col := public._get_posts_author_column();
  
  IF author_col IS NULL THEN
    RAISE NOTICE 'ОШИБКА: Не найдена колонка автора';
    RETURN;
  END IF;
  
  -- Найти реальный пост с mention
  EXECUTE format('
    SELECT id, text, %I as author_id
    FROM posts
    WHERE text ~ ''@[a-zA-Z0-9_]+''
      AND text IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 1
  ', author_col) INTO real_post;
  
  IF real_post.id IS NULL THEN
    CREATE TEMP TABLE IF NOT EXISTS real_post_test (
      step text,
      result text
    );
    DELETE FROM real_post_test;
    INSERT INTO real_post_test VALUES 
      ('Результат', 'Не найдено постов с mentions для теста');
    RETURN;
  END IF;
  
  -- Проверить connections до
  SELECT COUNT(*) INTO connections_before
  FROM user_connections
  WHERE post_id = real_post.id;
  
  -- Обработать пост
  BEGIN
    PERFORM public.extract_mentions_from_post(
      real_post.text,
      real_post.author_id,
      real_post.id
    );
    
    -- Проверить connections после
    SELECT COUNT(*) INTO connections_after
    FROM user_connections
    WHERE post_id = real_post.id;
    
    CREATE TEMP TABLE IF NOT EXISTS real_post_test (
      step text,
      result text
    );
    DELETE FROM real_post_test;
    
    INSERT INTO real_post_test VALUES 
      ('Найден пост ID', real_post.id::text),
      ('Автор', real_post.author_id::text),
      ('Текст (первые 100 символов)', SUBSTRING(real_post.text, 1, 100)),
      ('Connections до обработки', connections_before::text),
      ('Connections после обработки', connections_after::text),
      ('Создано connections', (connections_after - connections_before)::text),
      ('Результат', CASE WHEN connections_after > connections_before THEN '✅ УСПЕХ' ELSE '❌ ОШИБКА' END);
    
  EXCEPTION
    WHEN OTHERS THEN
      CREATE TEMP TABLE IF NOT EXISTS real_post_test (
        step text,
        result text
      );
      DELETE FROM real_post_test;
      INSERT INTO real_post_test VALUES 
        ('ОШИБКА', SQLERRM),
        ('Код ошибки', SQLSTATE);
  END;
END $$;

-- Показать результат обработки реального поста
SELECT 
  '=== ОБРАБОТКА РЕАЛЬНОГО ПОСТА ===' as section,
  step,
  result
FROM real_post_test
ORDER BY 
  CASE step
    WHEN 'Результат' THEN 1
    WHEN 'ОШИБКА' THEN 1
    WHEN 'Найден пост ID' THEN 2
    WHEN 'Автор' THEN 3
    WHEN 'Текст (первые 100 символов)' THEN 4
    WHEN 'Connections до обработки' THEN 5
    WHEN 'Connections после обработки' THEN 6
    WHEN 'Создано connections' THEN 7
    ELSE 8
  END;

-- 9. Финальная статистика
SELECT 
  '=== ФИНАЛЬНАЯ СТАТИСТИКА ===' as section,
  COUNT(*)::text as total_connections,
  COUNT(DISTINCT user_id)::text as unique_users,
  COUNT(DISTINCT post_id)::text as posts_with_connections
FROM user_connections;

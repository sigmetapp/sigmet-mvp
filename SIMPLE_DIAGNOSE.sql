-- Простая диагностика без логов - все результаты в таблицах
-- Выполните в Supabase SQL Editor

-- 1. Базовые проверки
SELECT 
  'Всего постов' as check_name,
  COUNT(*)::text as result
FROM posts

UNION ALL

SELECT 
  'Посты с текстом',
  COUNT(*)::text
FROM posts
WHERE text IS NOT NULL AND trim(text) != ''

UNION ALL

SELECT 
  'Посты с @ упоминаниями',
  COUNT(*)::text
FROM posts
WHERE text ~ '@[a-zA-Z0-9_]+'

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
FROM user_connections

UNION ALL

SELECT 
  'Триггер существует',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'post_connections_trigger'
  ) THEN 'ДА' ELSE 'НЕТ' END

UNION ALL

SELECT 
  'Триггер включен',
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_trigger 
      WHERE tgname = 'post_connections_trigger' AND tgenabled = 'O'
    ) THEN 'ДА' 
    ELSE 'НЕТ' 
  END

UNION ALL

SELECT 
  'Функция extract_mentions_from_post существует',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'extract_mentions_from_post'
  ) THEN 'ДА' ELSE 'НЕТ' END;

-- 2. Примеры постов с mentions
SELECT 
  '=== ПРИМЕРЫ ПОСТОВ С MENTIONS ===' as info,
  '' as id,
  '' as author_id,
  '' as text_preview,
  '' as created_at
WHERE false

UNION ALL

SELECT 
  '',
  id::text,
  author_id::text,
  SUBSTRING(text, 1, 80) as text_preview,
  created_at::text
FROM posts
WHERE text ~ '@[a-zA-Z0-9_]+'
ORDER BY created_at DESC
LIMIT 5;

-- 3. Примеры username
SELECT 
  '=== ПРИМЕРЫ USERNAME ===' as info,
  user_id::text,
  username,
  LOWER(username) as username_lower
FROM profiles
WHERE username IS NOT NULL AND username != ''
ORDER BY created_at DESC
LIMIT 10;

-- 4. Проверка RLS политик
SELECT 
  '=== RLS ПОЛИТИКИ ===' as info,
  policyname,
  cmd::text,
  CASE WHEN qual IS NOT NULL THEN 'Есть' ELSE 'Нет' END as has_qual,
  CASE WHEN with_check IS NOT NULL THEN 'Есть' ELSE 'Нет' END as has_with_check
FROM pg_policies
WHERE tablename = 'user_connections';

-- 5. Тест функции (создаст временные connections)
DO $$
DECLARE
  test_user record;
  test_mentioned_user record;
  test_post_id bigint := 777777;
  test_text text;
  connections_before int;
  connections_after int;
  result_text text;
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
  
  IF test_user.user_id IS NULL OR test_mentioned_user.user_id IS NULL THEN
    -- Создать таблицу для результата
    CREATE TEMP TABLE IF NOT EXISTS test_result (
      test_name text,
      result text
    );
    
    INSERT INTO test_result VALUES 
      ('ОШИБКА', 'Нужно минимум 2 пользователя с username для теста');
    RETURN;
  END IF;
  
  -- Проверить connections до
  SELECT COUNT(*) INTO connections_before
  FROM user_connections
  WHERE post_id = test_post_id;
  
  -- Создать тестовый текст
  test_text := format('Hello @%s, how are you?', test_mentioned_user.username);
  
  -- Вызвать функцию
  BEGIN
    PERFORM public.extract_mentions_from_post(
      test_text,
      test_user.user_id,
      test_post_id
    );
    
    -- Проверить connections после
    SELECT COUNT(*) INTO connections_after
    FROM user_connections
    WHERE post_id = test_post_id;
    
    -- Создать таблицу для результата
    CREATE TEMP TABLE IF NOT EXISTS test_result (
      test_name text,
      result text
    );
    
    DELETE FROM test_result;
    
    INSERT INTO test_result VALUES 
      ('Автор поста', format('%s (@%s)', test_user.user_id, test_user.username)),
      ('Упомянутый пользователь', format('%s (@%s)', test_mentioned_user.user_id, test_mentioned_user.username)),
      ('Тестовый текст', test_text),
      ('Connections до', connections_before::text),
      ('Connections после', connections_after::text),
      ('Создано connections', (connections_after - connections_before)::text),
      ('Результат', CASE WHEN connections_after > connections_before THEN '✅ УСПЕХ' ELSE '❌ ОШИБКА' END);
    
    -- Очистить тестовые данные
    DELETE FROM user_connections WHERE post_id = test_post_id;
    
  EXCEPTION
    WHEN OTHERS THEN
      CREATE TEMP TABLE IF NOT EXISTS test_result (
        test_name text,
        result text
      );
      DELETE FROM test_result;
      INSERT INTO test_result VALUES 
        ('ОШИБКА', SQLERRM),
        ('Код ошибки', SQLSTATE);
  END;
END $$;

-- Показать результат теста
SELECT 
  '=== РЕЗУЛЬТАТ ТЕСТА ФУНКЦИИ ===' as info,
  test_name,
  result
FROM test_result
ORDER BY 
  CASE test_name
    WHEN 'Результат' THEN 1
    WHEN 'ОШИБКА' THEN 1
    WHEN 'Автор поста' THEN 2
    WHEN 'Упомянутый пользователь' THEN 3
    WHEN 'Тестовый текст' THEN 4
    WHEN 'Connections до' THEN 5
    WHEN 'Connections после' THEN 6
    WHEN 'Создано connections' THEN 7
    ELSE 8
  END;

-- 6. Проверка реального поста
SELECT 
  '=== ПРОВЕРКА РЕАЛЬНОГО ПОСТА ===' as info,
  p.id::text,
  p.author_id::text,
  SUBSTRING(p.text, 1, 60) as text_preview,
  COALESCE(uc.count::text, '0') as connections_count
FROM posts p
LEFT JOIN (
  SELECT post_id, COUNT(*) as count
  FROM user_connections
  GROUP BY post_id
) uc ON p.id = uc.post_id
WHERE p.text ~ '@[a-zA-Z0-9_]+'
  AND p.text IS NOT NULL
ORDER BY p.created_at DESC
LIMIT 5;

-- 7. Проверка, какие username упоминаются в постах
SELECT 
  '=== USERNAME В ПОСТАХ ===' as info,
  (regexp_matches(LOWER(p.text), '@([a-z0-9_]+)', 'g'))[1] as mentioned_username,
  COUNT(*) as mention_count
FROM posts p
WHERE p.text ~ '@[a-zA-Z0-9_]+'
GROUP BY (regexp_matches(LOWER(p.text), '@([a-z0-9_]+)', 'g'))[1]
ORDER BY mention_count DESC
LIMIT 10;

-- 8. Проверка, существуют ли эти username в profiles
WITH mentioned_usernames AS (
  SELECT DISTINCT
    (regexp_matches(LOWER(p.text), '@([a-z0-9_]+)', 'g'))[1] as username_lower
  FROM posts p
  WHERE p.text ~ '@[a-zA-Z0-9_]+'
)
SELECT 
  '=== СОВПАДЕНИЯ USERNAME ===' as info,
  mu.username_lower as mentioned_in_posts,
  CASE 
    WHEN pr.user_id IS NOT NULL THEN '✅ Найден в profiles'
    ELSE '❌ НЕ найден в profiles'
  END as status,
  COALESCE(pr.user_id::text, '') as user_id
FROM mentioned_usernames mu
LEFT JOIN profiles pr ON LOWER(pr.username) = mu.username_lower
ORDER BY status, mu.username_lower
LIMIT 20;

-- 9. Финальная статистика
SELECT 
  '=== ФИНАЛЬНАЯ СТАТИСТИКА ===' as info,
  COUNT(*)::text as total_connections,
  COUNT(DISTINCT user_id)::text as unique_users,
  COUNT(DISTINCT post_id)::text as posts_with_connections
FROM user_connections;

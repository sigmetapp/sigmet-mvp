-- Полная диагностика проблемы с connections
-- Выполните в Supabase SQL Editor

-- 1. Базовые проверки
SELECT '=== БАЗОВЫЕ ПРОВЕРКИ ===' as section;

SELECT 
  'Всего постов' as metric,
  COUNT(*) as value
FROM posts

UNION ALL

SELECT 
  'Посты с текстом',
  COUNT(*)
FROM posts
WHERE text IS NOT NULL AND trim(text) != ''

UNION ALL

SELECT 
  'Посты с @ упоминаниями',
  COUNT(*)
FROM posts
WHERE text ~ '@[a-zA-Z0-9_]+'

UNION ALL

SELECT 
  'Пользователи с username',
  COUNT(*)
FROM profiles
WHERE username IS NOT NULL AND username != ''

UNION ALL

SELECT 
  'Текущие connections',
  COUNT(*)
FROM user_connections;

-- 2. Проверка примеров постов с mentions
SELECT '=== ПРИМЕРЫ ПОСТОВ С MENTIONS ===' as section;

SELECT 
  id,
  author_id,
  SUBSTRING(text, 1, 100) as text_preview,
  created_at
FROM posts
WHERE text ~ '@[a-zA-Z0-9_]+'
ORDER BY created_at DESC
LIMIT 5;

-- 3. Проверка примеров username
SELECT '=== ПРИМЕРЫ USERNAME ===' as section;

SELECT 
  user_id,
  username,
  LOWER(username) as username_lower,
  LENGTH(username) as username_length
FROM profiles
WHERE username IS NOT NULL AND username != ''
ORDER BY created_at DESC
LIMIT 10;

-- 4. Тест функции вручную
SELECT '=== ТЕСТ ФУНКЦИИ ===' as section;

DO $$
DECLARE
  test_user record;
  test_mentioned_user record;
  test_post_id bigint := 888888;
  test_text text;
  connections_before int;
  connections_after int;
  mentions_found int;
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
    RAISE NOTICE 'ОШИБКА: Нужно минимум 2 пользователя с username для теста';
    RAISE NOTICE 'User 1: %, User 2: %', test_user.user_id, test_mentioned_user.user_id;
    RETURN;
  END IF;
  
  RAISE NOTICE '=== НАЧАЛО ТЕСТА ===';
  RAISE NOTICE 'Автор поста: % (@%)', test_user.user_id, test_user.username;
  RAISE NOTICE 'Упомянутый пользователь: % (@%)', test_mentioned_user.user_id, test_mentioned_user.username;
  
  -- Проверить connections до
  SELECT COUNT(*) INTO connections_before
  FROM user_connections
  WHERE post_id = test_post_id;
  
  RAISE NOTICE 'Connections до теста: %', connections_before;
  
  -- Создать тестовый текст
  test_text := format('Hello @%s, how are you?', test_mentioned_user.username);
  RAISE NOTICE 'Тестовый текст: %', test_text;
  
  -- Проверить, найдет ли функция username
  SELECT COUNT(*) INTO mentions_found
  FROM profiles
  WHERE LOWER(username) = LOWER(test_mentioned_user.username);
  
  RAISE NOTICE 'Найдено совпадений username в profiles: %', mentions_found;
  
  -- Вызвать функцию
  BEGIN
    PERFORM public.extract_mentions_from_post(
      test_text,
      test_user.user_id,
      test_post_id
    );
    
    RAISE NOTICE 'Функция выполнена без ошибок';
    
    -- Проверить connections после
    SELECT COUNT(*) INTO connections_after
    FROM user_connections
    WHERE post_id = test_post_id;
    
    RAISE NOTICE 'Connections после теста: %', connections_after;
    RAISE NOTICE 'Создано connections: %', connections_after - connections_before;
    
    IF connections_after > connections_before THEN
      RAISE NOTICE '✅ УСПЕХ: Connections созданы!';
      
      -- Показать созданные connections
      RAISE NOTICE 'Созданные connections:';
      FOR test_user IN 
        SELECT * FROM user_connections WHERE post_id = test_post_id
      LOOP
        RAISE NOTICE '  - user_id: %, connected_user_id: %, type: %', 
          test_user.user_id, test_user.connected_user_id, test_user.connection_type;
      END LOOP;
    ELSE
      RAISE NOTICE '❌ ОШИБКА: Connections НЕ созданы!';
      RAISE NOTICE 'Возможные причины:';
      RAISE NOTICE '  1. Функция не находит username в тексте';
      RAISE NOTICE '  2. Функция не находит user_id в profiles';
      RAISE NOTICE '  3. RLS политика блокирует вставку';
      RAISE NOTICE '  4. Ошибка в логике функции';
    END IF;
    
    -- Очистить тестовые данные
    DELETE FROM user_connections WHERE post_id = test_post_id;
    RAISE NOTICE 'Тестовые данные удалены';
    
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE '❌ ОШИБКА при выполнении функции: %', SQLERRM;
      RAISE NOTICE 'Код ошибки: %', SQLSTATE;
  END;
  
  RAISE NOTICE '=== КОНЕЦ ТЕСТА ===';
END $$;

-- 5. Проверка RLS политик
SELECT '=== RLS ПОЛИТИКИ ===' as section;

SELECT 
  schemaname,
  tablename,
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'user_connections';

-- 6. Проверка триггера
SELECT '=== ТРИГГЕР ===' as section;

SELECT 
  tgname as trigger_name,
  tgenabled as enabled,
  CASE tgenabled
    WHEN 'O' THEN 'Enabled'
    WHEN 'D' THEN 'Disabled'
    ELSE 'Unknown'
  END as status
FROM pg_trigger
WHERE tgname = 'post_connections_trigger';

-- 7. Проверка функции триггера
SELECT '=== ФУНКЦИЯ ТРИГГЕРА ===' as section;

SELECT 
  proname as function_name,
  CASE 
    WHEN prosrc LIKE '%extract_mentions_from_post%' THEN 'Использует extract_mentions_from_post'
    ELSE 'Не использует extract_mentions_from_post'
  END as uses_extract_function
FROM pg_proc
WHERE proname = 'update_connections_on_post';

-- 8. Проверка реального поста
SELECT '=== ОБРАБОТКА РЕАЛЬНОГО ПОСТА ===' as section;

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
    RAISE NOTICE 'Не найдено постов с mentions для теста';
    RETURN;
  END IF;
  
  RAISE NOTICE 'Найден пост ID: %', real_post.id;
  RAISE NOTICE 'Автор: %', real_post.author_id;
  RAISE NOTICE 'Текст (первые 100 символов): %', SUBSTRING(real_post.text, 1, 100);
  
  -- Проверить connections до
  SELECT COUNT(*) INTO connections_before
  FROM user_connections
  WHERE post_id = real_post.id;
  
  RAISE NOTICE 'Connections для этого поста до обработки: %', connections_before;
  
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
    
    RAISE NOTICE 'Connections для этого поста после обработки: %', connections_after;
    RAISE NOTICE 'Создано новых connections: %', connections_after - connections_before;
    
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'ОШИБКА при обработке поста: %', SQLERRM;
  END;
END $$;

-- 9. Финальная статистика
SELECT '=== ФИНАЛЬНАЯ СТАТИСТИКА ===' as section;

SELECT 
  COUNT(*) as total_connections,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(DISTINCT post_id) as posts_with_connections
FROM user_connections;

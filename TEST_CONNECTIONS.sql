-- Простой тест для диагностики connections
-- Выполните этот запрос в Supabase SQL Editor

-- 1. Проверьте, есть ли посты с mentions
SELECT 
  'Posts with @ mentions' as check_type,
  COUNT(*) as count
FROM posts
WHERE text ~ '@[a-zA-Z0-9_]+'
   OR text ~ '/u/[a-zA-Z0-9_]+';

-- 2. Проверьте, есть ли пользователи с username
SELECT 
  'Users with username' as check_type,
  COUNT(*) as count
FROM profiles
WHERE username IS NOT NULL AND username != '';

-- 3. Проверьте пример поста с mention
SELECT 
  id,
  author_id,
  SUBSTRING(text, 1, 100) as text_preview,
  created_at
FROM posts
WHERE text ~ '@[a-zA-Z0-9_]+'
   OR text ~ '/u/[a-zA-Z0-9_]+'
ORDER BY created_at DESC
LIMIT 5;

-- 4. Проверьте примеры username
SELECT 
  user_id,
  username,
  LOWER(username) as username_lower
FROM profiles
WHERE username IS NOT NULL AND username != ''
LIMIT 10;

-- 5. Тест функции вручную (замените значения на реальные)
-- Сначала найдите user_id и username:
-- SELECT user_id, username FROM profiles WHERE username IS NOT NULL LIMIT 2;

-- Затем выполните тест (замените значения):
/*
DO $$
DECLARE
  test_user_id uuid := 'ваш-user-id-1';
  test_mentioned_user_id uuid := 'ваш-user-id-2';
  test_username text := 'username-которого-упоминаете';
  test_post_id bigint := 999999;
  connections_created int;
BEGIN
  -- Вызвать функцию
  PERFORM public.extract_mentions_from_post(
    format('Hello @%s test', test_username),
    test_user_id,
    test_post_id
  );
  
  -- Проверить результат
  SELECT COUNT(*) INTO connections_created
  FROM user_connections
  WHERE post_id = test_post_id;
  
  RAISE NOTICE 'Connections created: %', connections_created;
  
  -- Показать созданные connections
  SELECT * FROM user_connections WHERE post_id = test_post_id;
  
  -- Очистить тестовые данные
  DELETE FROM user_connections WHERE post_id = test_post_id;
END $$;
*/

-- 6. Проверьте RLS политики
SELECT 
  schemaname,
  tablename,
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'user_connections';

-- 7. Проверьте, работает ли триггер
SELECT 
  tgname as trigger_name,
  tgenabled as enabled,
  pg_get_triggerdef(oid) as definition
FROM pg_trigger
WHERE tgname = 'post_connections_trigger';

-- 8. Проверьте функцию триггера
SELECT 
  proname as function_name,
  prosrc as source_code
FROM pg_proc
WHERE proname = 'update_connections_on_post';

-- Быстрая диагностика - все в одном запросе
-- Выполните в Supabase SQL Editor

-- 1. Базовые проверки
SELECT 
  '1. БАЗОВЫЕ ПРОВЕРКИ' as section,
  'Всего постов' as check_name,
  COUNT(*)::text as result
FROM posts

UNION ALL

SELECT 
  '',
  'Посты с текстом',
  COUNT(*)::text
FROM posts
WHERE text IS NOT NULL AND trim(text) != ''

UNION ALL

SELECT 
  '',
  'Посты с @ упоминаниями',
  COUNT(*)::text
FROM posts
WHERE text ~ '@[a-zA-Z0-9_]+'

UNION ALL

SELECT 
  '',
  'Пользователи с username',
  COUNT(*)::text
FROM profiles
WHERE username IS NOT NULL AND username != ''

UNION ALL

SELECT 
  '',
  'Текущие connections',
  COUNT(*)::text
FROM user_connections

UNION ALL

-- 2. Примеры постов с mentions
SELECT 
  '2. ПРИМЕРЫ ПОСТОВ' as section,
  format('ID: %s, Автор: %s', id::text, author_id::text) as check_name,
  SUBSTRING(text, 1, 80) as result
FROM posts
WHERE text ~ '@[a-zA-Z0-9_]+' OR text ~ '/u/[a-zA-Z0-9_]+'
ORDER BY created_at DESC
LIMIT 3

UNION ALL

-- 3. Извлеченные username из постов
SELECT 
  '3. USERNAME В ПОСТАХ' as section,
  (regexp_matches(LOWER(text), '@([a-z0-9_]+)', 'g'))[1] as check_name,
  format('Упоминается %s раз(а)', COUNT(*)::text) as result
FROM posts
WHERE text ~ '@[a-zA-Z0-9_]+'
GROUP BY (regexp_matches(LOWER(text), '@([a-z0-9_]+)', 'g'))[1]
ORDER BY COUNT(*) DESC
LIMIT 5

UNION ALL

-- 4. Проверка совпадений username
SELECT 
  '4. СОВПАДЕНИЯ USERNAME' as section,
  mu.username_lower as check_name,
  CASE 
    WHEN pr.user_id IS NOT NULL THEN format('✅ Найден: %s', pr.user_id)
    ELSE '❌ НЕ найден в profiles'
  END as result
FROM (
  SELECT DISTINCT
    (regexp_matches(LOWER(text), '@([a-z0-9_]+)', 'g'))[1] as username_lower
  FROM posts
  WHERE text ~ '@[a-zA-Z0-9_]+'
  LIMIT 5
) mu
LEFT JOIN profiles pr ON LOWER(TRIM(pr.username)) = LOWER(TRIM(mu.username_lower))

UNION ALL

-- 5. Тест функции
SELECT 
  '5. ТЕСТ ФУНКЦИИ' as section,
  step as check_name,
  result
FROM (
  SELECT * FROM test_function_result
  UNION ALL
  SELECT 'Тест не выполнен', 'Выполните полный DETAILED_DIAGNOSE.sql для теста'
  WHERE NOT EXISTS (SELECT 1 FROM test_function_result LIMIT 1)
) t
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
    ELSE 8
  END
LIMIT 10

UNION ALL

-- 6. RLS политики
SELECT 
  '6. RLS ПОЛИТИКИ' as section,
  policyname as check_name,
  format('Command: %s, Qual: %s, WithCheck: %s', 
    cmd::text,
    CASE WHEN qual IS NOT NULL THEN 'Есть' ELSE 'Нет' END,
    CASE WHEN with_check IS NOT NULL THEN 'Есть' ELSE 'Нет' END
  ) as result
FROM pg_policies
WHERE tablename = 'user_connections'

UNION ALL

-- 7. Триггер
SELECT 
  '7. ТРИГГЕР' as section,
  'post_connections_trigger' as check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_trigger 
      WHERE tgname = 'post_connections_trigger' AND tgenabled = 'O'
    ) THEN '✅ Включен'
    WHEN EXISTS (
      SELECT 1 FROM pg_trigger 
      WHERE tgname = 'post_connections_trigger'
    ) THEN '❌ Выключен'
    ELSE '❌ Не существует'
  END as result

UNION ALL

-- 8. Финальная статистика
SELECT 
  '8. ФИНАЛЬНАЯ СТАТИСТИКА' as section,
  'Total connections' as check_name,
  COUNT(*)::text as result
FROM user_connections;

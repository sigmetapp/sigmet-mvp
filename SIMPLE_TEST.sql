-- Простой тест - покажет проблему
-- Выполните в Supabase SQL Editor

-- 1. Есть ли посты с mentions?
SELECT 
  'Есть ли посты с @ упоминаниями?' as question,
  CASE 
    WHEN COUNT(*) > 0 THEN format('✅ ДА: %s постов', COUNT(*)::text)
    ELSE '❌ НЕТ'
  END as answer
FROM posts
WHERE text ~ '@[a-zA-Z0-9_]+'

UNION ALL

-- 2. Есть ли пользователи с username?
SELECT 
  'Есть ли пользователи с username?',
  CASE 
    WHEN COUNT(*) >= 2 THEN format('✅ ДА: %s пользователей', COUNT(*)::text)
    WHEN COUNT(*) = 1 THEN '⚠️ Только 1 (нужно минимум 2)'
    ELSE '❌ НЕТ'
  END
FROM profiles
WHERE username IS NOT NULL AND username != ''

UNION ALL

-- 3. Показать пример поста с mention
SELECT 
  'Пример поста с mention',
  COALESCE(
    format('ID: %s, Текст: %s', id::text, SUBSTRING(text, 1, 60)),
    'Нет постов с mentions'
  )
FROM posts
WHERE text ~ '@[a-zA-Z0-9_]+'
LIMIT 1

UNION ALL

-- 4. Показать примеры username
SELECT 
  'Примеры username в profiles',
  format('%s пользователей: %s...', 
    COUNT(*)::text,
    string_agg(username, ', ' ORDER BY created_at DESC LIMIT 3)
  )
FROM profiles
WHERE username IS NOT NULL AND username != ''

UNION ALL

-- 5. Извлечь username из постов и проверить совпадения
SELECT 
  'Username из постов vs profiles',
  COALESCE(
    format('Упомянуто: %s, Найдено в profiles: %s', 
      mu.username_lower,
      CASE WHEN pr.user_id IS NOT NULL THEN '✅' ELSE '❌' END
    ),
    'Нет постов с mentions'
  )
FROM (
  SELECT DISTINCT
    (regexp_matches(LOWER(text), '@([a-z0-9_]+)', 'g'))[1] as username_lower
  FROM posts
  WHERE text ~ '@[a-zA-Z0-9_]+'
  LIMIT 1
) mu
LEFT JOIN profiles pr ON LOWER(TRIM(pr.username)) = LOWER(TRIM(mu.username_lower))

UNION ALL

-- 6. Попробовать создать connection вручную
SELECT 
  'Тест прямой вставки',
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM profiles 
      WHERE username IS NOT NULL AND username != ''
      LIMIT 1
    ) THEN 'Попытка вставки...'
    ELSE 'Нет пользователей для теста'
  END
FROM (SELECT 1) t;

-- Попробовать вставить connection вручную
DO $$
DECLARE
  user1_id uuid;
  user2_id uuid;
  test_post_id bigint := 333333;
  insert_result text;
BEGIN
  -- Получить двух пользователей
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
    RAISE NOTICE 'Нет двух разных пользователей для теста';
    RETURN;
  END IF;
  
  -- Попробовать вставить
  BEGIN
    INSERT INTO public.user_connections (user_id, connected_user_id, post_id, connection_type)
    VALUES (user1_id, user2_id, test_post_id, 'they_mentioned_me')
    ON CONFLICT DO NOTHING;
    
    INSERT INTO public.user_connections (user_id, connected_user_id, post_id, connection_type)
    VALUES (user2_id, user1_id, test_post_id, 'i_mentioned_them')
    ON CONFLICT DO NOTHING;
    
    RAISE NOTICE '✅ Прямая вставка УСПЕШНА!';
    
    -- Проверить результат
    DECLARE
      count_result int;
    BEGIN
      SELECT COUNT(*) INTO count_result
      FROM user_connections
      WHERE post_id = test_post_id;
      
      RAISE NOTICE 'Создано connections: %', count_result;
    END;
    
    -- Очистить
    DELETE FROM user_connections WHERE post_id = test_post_id;
    
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE '❌ Прямая вставка ОШИБКА: %', SQLERRM;
  END;
END $$;

-- Показать финальный результат
SELECT 
  'ФИНАЛЬНЫЙ РЕЗУЛЬТАТ' as question,
  format('Connections: %s', COUNT(*)::text) as answer
FROM user_connections;

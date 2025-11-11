-- Проверка количества connections у пользователя

-- 1. Общее количество connections для конкретного пользователя
-- Замените 'user-id-here' на реальный user_id
SELECT 
  user_id,
  COUNT(*) as total_connections,
  COUNT(DISTINCT connected_user_id) as unique_connected_users,
  COUNT(CASE WHEN connection_type = 'they_mentioned_me' THEN 1 END) as they_mentioned_me_count,
  COUNT(CASE WHEN connection_type = 'i_mentioned_them' THEN 1 END) as i_mentioned_them_count
FROM user_connections
WHERE user_id = 'user-id-here'  -- Замените на нужный user_id
GROUP BY user_id;

-- 2. Детальный список всех connections пользователя
SELECT 
  uc.id,
  uc.user_id,
  uc.connected_user_id,
  p.username as connected_username,
  p.full_name as connected_full_name,
  uc.connection_type,
  uc.post_id,
  posts.text as post_text,
  uc.created_at
FROM user_connections uc
LEFT JOIN profiles p ON p.user_id = uc.connected_user_id
LEFT JOIN posts ON posts.id = uc.post_id
WHERE uc.user_id = 'user-id-here'  -- Замените на нужный user_id
ORDER BY uc.created_at DESC;

-- 3. Проверка connections по username (если знаете username)
SELECT 
  uc.user_id,
  p1.username as my_username,
  COUNT(*) as total_connections,
  COUNT(DISTINCT uc.connected_user_id) as unique_connections
FROM user_connections uc
JOIN profiles p1 ON p1.user_id = uc.user_id
WHERE p1.username = 'username-here'  -- Замените на нужный username
GROUP BY uc.user_id, p1.username;

-- 4. Топ пользователей по количеству connections
SELECT 
  uc.user_id,
  p.username,
  p.full_name,
  COUNT(*) as total_connections,
  COUNT(DISTINCT uc.connected_user_id) as unique_connections
FROM user_connections uc
LEFT JOIN profiles p ON p.user_id = uc.user_id
GROUP BY uc.user_id, p.username, p.full_name
ORDER BY total_connections DESC
LIMIT 20;

-- 5. Проверка connections для текущего пользователя (если знаете email)
-- Сначала найдите user_id по email:
-- SELECT id FROM auth.users WHERE email = 'email@example.com';

-- Затем используйте этот user_id в запросе 1 или 2

-- 6. Проверка, есть ли connections для конкретного поста
SELECT 
  uc.*,
  p.username as connected_username
FROM user_connections uc
LEFT JOIN profiles p ON p.user_id = uc.connected_user_id
WHERE uc.post_id = 55  -- ID поста из ошибки
ORDER BY uc.created_at DESC;

-- 7. Общая статистика по connections
SELECT 
  COUNT(*) as total_connections,
  COUNT(DISTINCT user_id) as users_with_connections,
  COUNT(DISTINCT connected_user_id) as unique_connected_users,
  COUNT(DISTINCT post_id) as posts_with_mentions
FROM user_connections;

-- Проверка непрочитанных сообщений
-- Замените YOUR_USER_ID на ваш user_id

-- 1. Проверка last_read_at для всех тредов пользователя
SELECT 
  tp.thread_id,
  tp.last_read_at,
  tp.last_read_message_id,
  COUNT(m.id) as total_messages,
  COUNT(CASE WHEN m.sender_id != tp.user_id AND m.deleted_at IS NULL THEN 1 END) as messages_from_others,
  COUNT(CASE 
    WHEN m.sender_id != tp.user_id 
    AND m.deleted_at IS NULL 
    AND (tp.last_read_at IS NULL OR m.created_at > tp.last_read_at)
    THEN 1 
  END) as unread_count
FROM dms_thread_participants tp
LEFT JOIN dms_messages m ON m.thread_id = tp.thread_id
WHERE tp.user_id = 'YOUR_USER_ID'  -- Замените на ваш user_id
GROUP BY tp.thread_id, tp.last_read_at, tp.last_read_message_id
ORDER BY unread_count DESC;

-- 2. Проверка работы функции dms_list_partners
-- Замените YOUR_USER_ID на ваш user_id
SELECT 
  thread_id,
  partner_id,
  unread_count,
  last_read_at,
  last_read_message_id
FROM dms_list_partners('YOUR_USER_ID'::uuid, 100, 0)  -- Замените на ваш user_id
WHERE unread_count > 0
ORDER BY unread_count DESC;

-- 3. Проверка последних сообщений в тредах
SELECT 
  tp.thread_id,
  tp.last_read_at,
  MAX(m.created_at) as last_message_created_at,
  COUNT(CASE 
    WHEN m.sender_id != tp.user_id 
    AND m.deleted_at IS NULL 
    AND (tp.last_read_at IS NULL OR m.created_at > tp.last_read_at)
    THEN 1 
  END) as calculated_unread
FROM dms_thread_participants tp
LEFT JOIN dms_messages m ON m.thread_id = tp.thread_id
WHERE tp.user_id = 'YOUR_USER_ID'  -- Замените на ваш user_id
GROUP BY tp.thread_id, tp.last_read_at
HAVING COUNT(CASE 
    WHEN m.sender_id != tp.user_id 
    AND m.deleted_at IS NULL 
    AND (tp.last_read_at IS NULL OR m.created_at > tp.last_read_at)
    THEN 1 
  END) > 0
ORDER BY calculated_unread DESC;

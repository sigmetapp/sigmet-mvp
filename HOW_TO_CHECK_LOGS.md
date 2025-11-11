# Как проверить логи в Supabase

## Где смотреть логи:

### 1. **Postgres Logs (логи БД) - ОСНОВНОЙ СПОСОБ**
- Зайдите в [Supabase Dashboard](https://app.supabase.com)
- Выберите ваш проект
- В левом меню найдите **Logs** (или **Logs & Monitoring**)
- Выберите **Postgres Logs**
- Там будут все `RAISE NOTICE` сообщения из функций
- **Важно**: Логи могут быть с задержкой в несколько секунд

### Альтернативный способ (если Postgres Logs не показывает):
- Перейдите в **Database** → **Logs** (если доступно)
- Или используйте SQL Editor для выполнения диагностических запросов

### 2. **API Logs (логи API)**
- **Logs** → **API Logs**
- Показывает запросы к API endpoints

### 3. **Database Logs (через SQL)**
Можно также проверить логи через SQL:
```sql
-- Проверить последние ошибки (если есть таблица для логов)
SELECT * FROM pg_stat_statements 
ORDER BY calls DESC 
LIMIT 10;
```

## Как проверить работу функции:

### Вариант 1: Через SQL Editor в Supabase

1. Откройте **SQL Editor** в Supabase Dashboard
2. Выполните файл `TEST_CONNECTIONS.sql` (я его создал)
3. Это покажет:
   - Есть ли посты с mentions
   - Есть ли пользователи с username
   - Работают ли функции и триггеры

### Вариант 2: Простой тест вручную

Выполните этот запрос (замените значения на реальные):

```sql
-- 1. Найдите два разных user_id с username
SELECT user_id, username 
FROM profiles 
WHERE username IS NOT NULL AND username != ''
LIMIT 2;

-- 2. Используйте эти значения в тесте:
DO $$
DECLARE
  test_user_id uuid := 'первый-user-id';
  test_username text := 'username-второго-пользователя';
  test_post_id bigint := 999999;
  result_count int;
BEGIN
  -- Вызвать функцию
  PERFORM public.extract_mentions_from_post(
    format('Test @%s mention', test_username),
    test_user_id,
    test_post_id
  );
  
  -- Проверить результат
  SELECT COUNT(*) INTO result_count
  FROM user_connections
  WHERE post_id = test_post_id;
  
  RAISE NOTICE '=== TEST RESULT ===';
  RAISE NOTICE 'Connections created: %', result_count;
  
  -- Показать созданные connections
  IF result_count > 0 THEN
    RAISE NOTICE 'SUCCESS: Connections were created!';
    SELECT * FROM user_connections WHERE post_id = test_post_id;
  ELSE
    RAISE NOTICE 'ERROR: No connections created!';
  END IF;
  
  -- Очистить тестовые данные
  DELETE FROM user_connections WHERE post_id = test_post_id;
END $$;
```

### Вариант 3: Проверить через создание реального поста

1. Создайте пост через UI с текстом `@username` (где username - реальный username другого пользователя)
2. Проверьте, создался ли connection:
```sql
SELECT * FROM user_connections ORDER BY created_at DESC LIMIT 5;
```

## 🚀 БЫСТРАЯ ДИАГНОСТИКА (РЕКОМЕНДУЕТСЯ):

Я создал файл `DIAGNOSE_CONNECTIONS.sql` - это полный диагностический скрипт.

**Как использовать:**
1. Откройте **Supabase Dashboard** → **SQL Editor**
2. Скопируйте содержимое файла `DIAGNOSE_CONNECTIONS.sql`
3. Вставьте в SQL Editor
4. Нажмите **Run** (или Ctrl+Enter)
5. **Смотрите результаты в двух местах:**
   - **В результатах запроса** (таблицы с данными)
   - **В Postgres Logs** (NOTICE сообщения с детальной информацией)

Скрипт покажет:
- ✅ Количество постов с mentions
- ✅ Количество пользователей с username
- ✅ Тест функции на реальных данных
- ✅ Проверку RLS политик
- ✅ Проверку триггера
- ✅ Обработку реального поста
- ✅ Детальные логи каждого шага

**Где смотреть логи от скрипта:**
- После выполнения скрипта перейдите в **Logs** → **Postgres Logs**
- Найдите записи с `NOTICE` - там будет вся диагностическая информация
- Ищите строки с `===` - это разделители секций

## Что проверить если connections не создаются:

1. **Есть ли посты с mentions?**
```sql
SELECT COUNT(*) FROM posts WHERE text ~ '@[a-zA-Z0-9_]+';
```

2. **Есть ли пользователи с username?**
```sql
SELECT COUNT(*) FROM profiles WHERE username IS NOT NULL;
```

3. **Работает ли триггер?**
```sql
SELECT tgname, tgenabled FROM pg_trigger WHERE tgname = 'post_connections_trigger';
```

4. **Есть ли ошибки в функции?**
- Проверьте Postgres Logs в Dashboard
- Или выполните `DIAGNOSE_CONNECTIONS.sql` - он покажет все ошибки

## Быстрая диагностика:

Выполните этот запрос для полной диагностики:

```sql
-- Полная диагностика
SELECT 
  'Posts with mentions' as check_name,
  COUNT(*) as count
FROM posts
WHERE text ~ '@[a-zA-Z0-9_]+' OR text ~ '/u/[a-zA-Z0-9_]+'

UNION ALL

SELECT 
  'Users with username',
  COUNT(*)
FROM profiles
WHERE username IS NOT NULL AND username != ''

UNION ALL

SELECT 
  'Current connections',
  COUNT(*)
FROM user_connections

UNION ALL

SELECT 
  'Trigger exists',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'post_connections_trigger'
  ) THEN 1 ELSE 0 END;
```

Это покажет все необходимые данные для диагностики.

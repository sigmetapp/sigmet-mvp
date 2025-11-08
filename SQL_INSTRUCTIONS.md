# Инструкции по применению SQL миграции

## 📋 Что нужно сделать

### Вариант 1: Через Supabase Dashboard (рекомендуется)

1. Откройте **Supabase Dashboard** → ваш проект
2. Перейдите в **SQL Editor**
3. Скопируйте содержимое файла `APPLY_MIGRATION_166.sql`
4. Вставьте в SQL Editor
5. Нажмите **Run** (или F5)

### Вариант 2: Через Supabase CLI

```bash
# Если используете Supabase CLI
supabase migration up
```

### Вариант 3: Пошаговое выполнение

Если нужно выполнить по частям:

#### Шаг 1: Откатить старую версию (если была)

```sql
BEGIN;

DROP FUNCTION IF EXISTS public.dms_list_partners_optimized(UUID, INTEGER, INTEGER);

COMMIT;
```

#### Шаг 2: Создать индексы

```sql
BEGIN;

CREATE INDEX IF NOT EXISTS idx_dms_messages_thread_sequence 
ON dms_messages(thread_id, sequence_number);

CREATE INDEX IF NOT EXISTS idx_dms_thread_participants_user_thread 
ON dms_thread_participants(user_id, thread_id);

CREATE INDEX IF NOT EXISTS idx_dms_message_receipts_message_user 
ON dms_message_receipts(message_id, user_id);

CREATE INDEX IF NOT EXISTS idx_dms_threads_last_message_at 
ON dms_threads(last_message_at DESC NULLS LAST);

COMMIT;
```

#### Шаг 3: Создать оптимизированную функцию

Скопируйте функцию из файла `APPLY_MIGRATION_166.sql` (начинается с `CREATE OR REPLACE FUNCTION dms_list_partners_optimized`)

---

## ✅ Проверка после применения

### 1. Проверить, что функция создана

```sql
SELECT 
  proname as function_name,
  pg_get_function_arguments(oid) as arguments
FROM pg_proc 
WHERE proname = 'dms_list_partners_optimized';
```

Должна вернуться одна строка с функцией.

### 2. Проверить, что индексы созданы

```sql
SELECT 
  indexname,
  tablename
FROM pg_indexes 
WHERE tablename LIKE 'dms_%' 
  AND indexname LIKE 'idx_dms_%'
ORDER BY tablename, indexname;
```

Должны быть созданы 4 индекса:
- `idx_dms_messages_thread_sequence`
- `idx_dms_thread_participants_user_thread`
- `idx_dms_message_receipts_message_user`
- `idx_dms_threads_last_message_at`

### 3. Проверить работу функции

```sql
-- Замените 'your-user-id' на реальный UUID пользователя
SELECT * FROM dms_list_partners_optimized('your-user-id'::uuid, 20, 0);
```

Должна вернуться таблица с партнерами без ошибок.

---

## ⚠️ Если возникли ошибки

### Ошибка: "function already exists"

```sql
-- Удалить функцию и создать заново
DROP FUNCTION IF EXISTS public.dms_list_partners_optimized(UUID, INTEGER, INTEGER);
-- Затем выполнить CREATE OR REPLACE FUNCTION из миграции
```

### Ошибка: "index already exists"

Это нормально - `CREATE INDEX IF NOT EXISTS` не создаст дубликат.

### Ошибка: "operator does not exist: uuid = bigint"

Убедитесь, что функция использует правильные типы данных:
- `thread_id` должен быть `BIGINT` в таблицах
- `thread_id` должен возвращаться как `TEXT` в функции
- Все JOIN'ы должны использовать правильные типы

---

## 🔄 Откат (если нужно)

Если нужно откатить изменения:

```sql
BEGIN;

-- Удалить функцию
DROP FUNCTION IF EXISTS public.dms_list_partners_optimized(UUID, INTEGER, INTEGER);

-- Удалить индексы (опционально - они полезны, можно оставить)
-- DROP INDEX IF EXISTS idx_dms_messages_thread_sequence;
-- DROP INDEX IF EXISTS idx_dms_thread_participants_user_thread;
-- DROP INDEX IF EXISTS idx_dms_message_receipts_message_user;
-- DROP INDEX IF EXISTS idx_dms_threads_last_message_at;

COMMIT;
```

**Примечание:** Индексы лучше оставить - они ускоряют запросы и не мешают работе.

---

## 📝 После применения

После успешного применения миграции:

1. ✅ Диалоги должны открываться без ошибок
2. ✅ Запросы должны работать быстрее
3. ✅ API endpoint автоматически использует оптимизированную функцию
4. ✅ Fallback на оригинальную функцию работает, если оптимизированная недоступна

---

## 🆘 Поддержка

Если возникли проблемы:
1. Проверьте логи в Supabase Dashboard → Logs
2. Проверьте, что все типы данных правильные
3. Убедитесь, что функция имеет правильную сигнатуру (совпадает с оригиналом)

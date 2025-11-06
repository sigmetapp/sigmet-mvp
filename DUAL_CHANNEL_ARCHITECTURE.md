# Dual-Channel Messaging Architecture

## Overview

Система личных сообщений перестроена на двухканальную архитектуру:
- **Мгновенный WebSocket канал** для быстрой доставки (message_ack < 100ms)
- **Асинхронная запись в БД** через BullMQ с дедупликацией

## Архитектура

### Компоненты

1. **WebSocket Gateway** (`lib/dm/gateway.ts`)
   - Обрабатывает `send_message` события
   - Сразу вещает `message_ack` в комнату (оба клиента)
   - Кладет задачу в BullMQ очередь `persistMessage`

2. **BullMQ Worker** (`lib/dm/messageWorker.ts`)
   - Обрабатывает задачи из очереди `persistMessage`
   - Делает `INSERT ... ON CONFLICT DO NOTHING` по уникальному ключу `(conversation_id, client_msg_id)`
   - После успеха вещает `message_persisted` с `dbMessageId` и `dbCreatedAt`

3. **Клиент** (`hooks/useWebSocketDm.ts`, `lib/dm/websocket.ts`)
   - Генерирует `clientMsgId` (UUID v4) при отправке
   - Рисует local-echo карточку со статусом `sending`
   - На `message_ack` → статус `sent`
   - На `message_persisted` → статус `persisted`, обновляет `created_at`
   - Фильтрует входящие WS-ивенты по `clientMsgId`, чтобы не дублировать собственное сообщение

## Схема БД

```sql
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  sender_id uuid not null,
  recipient_id uuid not null,
  client_msg_id uuid not null,
  body text not null,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create unique index messages_conv_client_uidx
  on messages (conversation_id, client_msg_id);
```

## Протокол WebSocket

### События от клиента

- `send_message`: `{ type: 'send_message', thread_id, body, attachments, client_msg_id }`

### События от сервера

- `message_ack`: `{ type: 'message_ack', conversation_id, client_msg_id, timestamp }`
  - Вещается сразу после получения `send_message` (< 100ms)
  - Получают оба клиента в комнате

- `message_persisted`: `{ type: 'message_persisted', conversation_id, client_msg_id, db_message_id, db_created_at }`
  - Вещается после успешной записи в БД
  - Получают оба клиента в комнате

## Состояния доставки

- `sending`: Сообщение отправлено, ждем `message_ack`
- `sent`: Получен `message_ack`, сообщение доставлено в комнату
- `persisted`: Получен `message_persisted`, сообщение записано в БД

## Настройка

### Переменные окружения

```bash
REDIS_URL=redis://localhost:6379
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

### Запуск

1. Запустить Redis
2. Запустить сервер: `npm run dev:server`
3. Воркер BullMQ запускается автоматически вместе с сервером

## Тесты

- `tests/dual-channel-dedup.spec.ts`: Юнит-тест на дедупликацию
- `tests/dual-channel-integration.spec.ts`: Интеграционный тест (два клиента, проверка ack < 100ms и persisted)

## Миграция

Миграция создает новую таблицу `messages` параллельно со старой `dms_messages` для обратной совместимости.

```bash
# Применить миграцию
supabase migration up
```

## Примечания

- `conversation_id` генерируется из `thread_id` детерминированно
- В production рекомендуется использовать UUID v5 или таблицу маппинга
- Старая система `dms_messages` продолжает работать параллельно для обратной совместимости

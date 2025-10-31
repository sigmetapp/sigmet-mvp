# Логика отображения статуса онлайн

## Условия для отображения статуса онлайн

Статус онлайн показывается на странице профиля пользователя (`/u/[slug]`) при выполнении всех следующих условий:

### 1. Настройка приватности пользователя (`show_online_status`)

- **Расположение**: Колонка `profiles.show_online_status` (boolean, default: `true`)
- **Условие**: `profile.show_online_status !== false`
- **Если `false`**: Показывается "Private online" вместо статуса онлайн/офлайн
- **Если `true` или `null`**: Проверяется фактический статус присутствия

**Файлы:**
- `app/(auth)/u/[slug]/page.tsx:103` - проверка настройки
- `app/(auth)/u/[slug]/page.tsx:552-576` - отображение статуса
- `supabase/migrations/111_add_show_online_status.sql` - миграция

### 2. Трекинг присутствия пользователя (Presence Tracking)

Пользователь должен быть помечен как онлайн через Supabase Realtime Presence:

- **Компонент**: `OnlineStatusTracker` (`components/OnlineStatusTracker.tsx`)
- **Расположение**: Монтируется в `app/(auth)/layout.tsx:20`
- **Действие**: Когда пользователь открывает страницу, вызывается `setOnline(userId, true)`
- **Функция**: `lib/dm/presence.ts:50` - `setOnline()`

**Процесс:**
1. При монтировании компонента получается `userId` текущего пользователя
2. Вызывается `setOnline(user.id, true)`
3. Создается/используется Realtime канал `presence:${userId}`
4. Отправляется presence payload: `{ online: true, typing: false, updated_at: ... }`

### 3. Подписка на Presence канал просматривающего пользователя

На странице профиля (`app/(auth)/u/[slug]/page.tsx`) происходит:

- **Канал**: `presence:${profile.user_id}` (для просматриваемого пользователя)
- **События**: `sync`, `join`, `leave`
- **Проверка**: Есть ли presence с `online: true`

**Логика проверки** (строки 98-158):
```typescript
// 1. Проверка show_online_status
if (!showStatus) {
  setIsOnline(null); // "Private online"
  return;
}

// 2. Подписка на канал
const channel = supabase.channel(`presence:${profile.user_id}`);

// 3. Обработка событий presence
channel.on('presence', { event: 'sync' }, () => {
  const state = channel.presenceState();
  const hasOnline = Object.keys(state).length > 0 && 
    Object.values(state).some((presences: any[]) => 
      presences.some((p: any) => p.online === true)
    );
  setIsOnline(hasOnline);
});

// 4. Начальная проверка
const state = await getPresenceMap(profile.user_id);
```

### 4. Отображение статуса

**Логика отображения** (строки 552-576):
```typescript
const showStatus = profile.show_online_status !== false;
if (!showStatus) {
  return <span>Private online</span>;
}
if (isOnline === true) {
  return <span>Online</span>;
}
if (isOnline === false) {
  return <span>Offline</span>;
}
// isOnline === null - ничего не показывается
```

## Возможные причины, почему статус не показывается

1. **`show_online_status = false`** в профиле пользователя
2. **Пользователь не залогинен** - `OnlineStatusTracker` не может установить статус
3. **Supabase Realtime не подключен** - проблемы с соединением
4. **Пользователь закрыл страницу** - presence автоматически убирается при unmount
5. **Проблемы с подпиской на канал** - ошибки при subscribe
6. **Неправильный `user_id`** - несоответствие ID в профиле и в auth

## Отладка

Для проверки статуса онлайн нужно:

1. Проверить `profiles.show_online_status` для пользователя AlexM
2. Убедиться, что пользователь AlexM залогинен и `OnlineStatusTracker` работает
3. Проверить наличие presence в Supabase Realtime
4. Проверить успешность подписки на канал на странице профиля

## Добавлено логирование

Для диагностики проблемы добавлено логирование в следующих местах:

- `components/OnlineStatusTracker.tsx` - логи при установке статуса онлайн
- `lib/dm/presence.ts` - логи создания каналов, подписки и трекинга
- `app/(auth)/u/[slug]/page.tsx` - логи подписки на канал и проверки presence

Все логи начинаются с префикса `[Online Status]` или `[presence.*]` для удобной фильтрации в консоли браузера.

При открытии страницы профиля `/u/AlexM` в консоли браузера должны появиться логи, которые покажут:
1. Значение `show_online_status` для профиля
2. Процесс подписки на presence канал
3. Результаты проверки presence состояния
4. Любые ошибки при работе с presence

## Краткая сводка условий

**Статус онлайн показывается только если:**
1. ✅ `profile.show_online_status !== false` (не отключена настройка приватности)
2. ✅ Пользователь залогинен и `OnlineStatusTracker` установил его статус как онлайн
3. ✅ Просматривающий пользователь успешно подписался на канал `presence:${userId}`
4. ✅ В presence канале есть данные с `online: true`

**Если статус не показывается, проверьте:**
- Откройте консоль браузера на странице `/u/AlexM`
- Найдите логи с префиксом `[Online Status]` или `[presence`
- Проверьте, какие из вышеперечисленных условий не выполняются

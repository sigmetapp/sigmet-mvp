# Логика отображения статуса онлайн

## Стандарты определения статуса онлайн

**Пользователь считается онлайн, если выполняется ОДНО из условий:**

1. **Наличие Presence** (real-time подключение через Supabase Realtime)
2. **Активность в последние 5 минут** (поле `last_activity_at` в таблице `profiles`)

Активность автоматически обновляется при:
- Монтировании компонента `OnlineStatusTracker` (пользователь открыл страницу)
- Пользовательских действиях (клики, нажатия клавиш, прокрутка) - обновление не чаще 1 раза в минуту
- Периодическом обновлении каждые 2 минуты (если вкладка открыта)
- При явном вызове `setOnline(userId, true)`

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
- **Функция**: `lib/dm/presence.ts:60` - `setOnline()`

**Процесс:**
1. При монтировании компонента получается `userId` текущего пользователя
2. Вызывается `setOnline(user.id, true)`
3. Создается/используется Realtime канал `presence:${userId}`
4. Отправляется presence payload: `{ online: true, typing: false, updated_at: ... }`
5. **Обновляется `last_activity_at` в таблице `profiles`** - это позволяет определить онлайн статус даже без presence

**Автоматическое обновление активности:**
- При монтировании компонента
- Периодически каждые 2 минуты (если вкладка открыта)
- При пользовательских действиях: клики, нажатия клавиш, прокрутка (не чаще 1 раза в минуту)
- При возврате вкладки (visibilitychange)

### 3. Подписка на Presence канал и проверка активности

На странице профиля (`app/(auth)/u/[slug]/page.tsx`) происходит:

- **Канал**: `presence:${profile.user_id}` (для просматриваемого пользователя)
- **События**: `sync`, `join`, `leave`
- **Проверка**: Есть ли presence с `online: true` ИЛИ активность в последние 5 минут

**Логика проверки** (строки 104-258):
```typescript
// 1. Проверка show_online_status
if (!showStatus) {
  setIsOnline(null); // "Private online"
  return;
}

// 2. Функция проверки статуса
const checkOnlineStatus = async (): Promise<boolean> => {
  // Проверка presence (real-time)
  let hasPresence = false;
  const state = await getPresenceMap(profile.user_id);
  hasPresence = Object.keys(state).length > 0 && 
    Object.values(state).some((presences: any[]) => 
      presences.some((p: any) => p.online === true)
    );
  
  // Проверка активности (последние 5 минут)
  let isRecentlyActive = false;
  if (profile.last_activity_at) {
    const lastActivity = new Date(profile.last_activity_at);
    const now = new Date();
    const minutesSinceActivity = (now.getTime() - lastActivity.getTime()) / (1000 * 60);
    isRecentlyActive = minutesSinceActivity <= 5;
  }
  
  // Онлайн если: presence ИЛИ активность в последние 5 минут
  return hasPresence || isRecentlyActive;
};

// 3. Подписка на канал для real-time обновлений
const channel = supabase.channel(`presence:${profile.user_id}`);
channel.on('presence', { event: 'sync' }, async () => {
  const isOnline = await checkOnlineStatus();
  setIsOnline(isOnline);
});

// 4. Периодическая проверка каждые 30 секунд для обновления статуса
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

## База данных

Для отслеживания активности добавлено поле в таблицу `profiles`:
- **Колонка**: `last_activity_at` (timestamptz)
- **Миграция**: `supabase/migrations/113_add_last_activity_at.sql`
- **Обновление**: Автоматически обновляется при вызове `setOnline(userId, true)`
- **Индекс**: Создан индекс для эффективных запросов

## Возможные причины, почему статус не показывается

1. **`show_online_status = false`** в профиле пользователя - показывается "Private online"
2. **Пользователь не залогинен** - `OnlineStatusTracker` не может установить статус
3. **Активность более 5 минут назад** - даже если пользователь был онлайн ранее
4. **Supabase Realtime не подключен** - проблемы с соединением (но статус все равно определяется по активности)
5. **Пользователь закрыл страницу** - presence автоматически убирается при unmount, но `last_activity_at` остается
6. **Проблемы с подпиской на канал** - ошибки при subscribe (но статус определяется по активности)
7. **Неправильный `user_id`** - несоответствие ID в профиле и в auth

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
2. ✅ **ОДНО из условий:**
   - В presence канале есть данные с `online: true` (real-time подключение)
   - **ИЛИ** `last_activity_at` в пределах последних 5 минут (активность пользователя)

**Логика определения статуса:**
```typescript
const isOnline = hasPresence || isRecentlyActive;
```

где:
- `hasPresence` = наличие real-time presence в Supabase Realtime
- `isRecentlyActive` = `last_activity_at` был обновлен в последние 5 минут

**Если статус не показывается, проверьте:**
- Откройте консоль браузера на странице `/u/AlexM`
- Найдите логи с префиксом `[Online Status]` или `[presence`
- Проверьте значение `last_activity_at` в профиле пользователя
- Проверьте, обновляется ли активность при действиях пользователя
- Убедитесь, что прошло не более 5 минут с последней активности

# Логика работы Trust Flow

## Общая схема

Trust Flow (TF) - это показатель доверия, который рассчитывается на основе пушей (положительных и отрицательных оценок) от других пользователей.

**Важно:** Trust Flow - это НЕ Social Weight (SW). Это два разных показателя.

## Где считается Trust Flow

### 1. Расчет в TypeScript (на сервере)
- **Файл:** `lib/trustFlow.ts`
- **Функция:** `calculateTrustFlowForUser(userId: string)`
- **Формула:** `TF = BASE_TRUST_FLOW (5.0) + contributions от пушей`

### 2. Сохранение в базе данных
- **Кэш:** `profiles.trust_flow` - хранит текущее значение TF для быстрого доступа
- **История:** `trust_flow_history` - хранит все изменения TF с метаданными

### 3. Отображение на странице
- **API:** `/api/users/${userId}/trust-flow`
- **Страница:** `app/(auth)/u/[slug]/page.tsx`
- API читает из кэша или пересчитывает при необходимости

## Формула расчета веса пуша

Вес пуша зависит от разницы Trust Flow между пользователем, который делает пуш, и пользователем, которому делают пуш:

1. **Если у пушера TF на 20% ниже** → вес = **1.5**
2. **Если TF в пределах ±20%** → вес = **2.0**
3. **Если у пушера TF на 20% выше** → вес = **2.5**

## Защита от повторных пушей

Каждый последующий пуш от одного пользователя к другому в течение **30 календарных дней** имеет вес на **33% меньше**:
- Первый пуш: 100% веса
- Второй пуш: 67% веса (33% снижение)
- Третий пуш: 44.89% веса (еще 33% снижение)
- И так далее...

## Change History (История изменений)

История изменений показывает:
1. **Trust Pushes** - все пуши от других пользователей
2. **Profile Changes** - изменения профиля
3. **Trust Flow Changes** - изменения самого Trust Flow (из таблицы `trust_flow_history`)

### Как работает история Trust Flow

1. При расчете TF вызывается `saveTrustFlowToCache()`
2. Эта функция вызывает SQL функцию `update_user_trust_flow()`
3. SQL функция:
   - Обновляет `profiles.trust_flow` (кэш)
   - Записывает изменение в `trust_flow_history` (только если значение изменилось)

### Почему может не показываться история

1. **Нет записей в `trust_flow_history`** - возможно, функция `update_user_trust_flow()` не вызывается или не работает
2. **Ошибка при загрузке** - проверьте консоль браузера на ошибки
3. **RLS политики** - убедитесь, что пользователь может читать `trust_flow_history`

## Отладка

### Проверка в консоли браузера

При открытии Change History должны быть логи:
```
[Change History] Loading history for user: ...
[Change History] Pushes result: { data: X, error: ... }
[Change History] Profile changes result: { data: X, error: ... }
[Change History] TF history result: { data: X, error: ..., items: [...] }
[Change History] Mapped items: { feedback: X, changes: X, tfChanges: X }
[Change History] Total items after sorting: X
```

### Проверка в базе данных

```sql
-- Проверить кэш TF
SELECT user_id, trust_flow FROM profiles WHERE user_id = '...';

-- Проверить историю TF
SELECT * FROM trust_flow_history WHERE user_id = '...' ORDER BY created_at DESC;

-- Проверить пуши
SELECT * FROM trust_pushes WHERE to_user_id = '...' ORDER BY created_at DESC;
```

## Важные моменты

1. **Trust Flow рассчитывается на сервере** (в TypeScript), не в базе данных
2. **Результат сохраняется в кэш** для быстрого доступа
3. **История записывается автоматически** при каждом изменении TF
4. **Change History показывает** все три типа изменений: пуши, изменения профиля, изменения TF

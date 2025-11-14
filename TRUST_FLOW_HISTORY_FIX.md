# Новая логика расчета Trust Flow

## Изменения в логике расчета

### Старая логика (удалена):
- Effective Weight = `weight / (1 + repeatCount)`
- Weight зависел от активности пользователя (посты, комментарии, SW) и возраста аккаунта
- Repeat count считался по всем пушам от пользователя

### Новая логика:
- **Базовое значение** зависит от Trust Flow пользователя, который делает push:
  - TF < 10: базовое значение = **1.5**
  - TF >= 10 и < 40: базовое значение = **2.0**
  - TF >= 40: базовое значение = **2.5**
- **Effective Weight** = базовое значение × 0.67^repeatCount
  - Первый push (repeatCount = 0): базовое значение × 0.67^0 = базовое значение
  - Второй push (repeatCount = 1): базовое значение × 0.67^1 = базовое значение × 0.67 (на 33% меньше)
  - Третий push (repeatCount = 2): базовое значение × 0.67^2 = базовое значение × 0.4489 (еще на 33% меньше)
- **30-дневный период**: Repeat count считается только для пушей в течение 30 календарных дней. Если прошло больше 30 дней, следующий push считается первым снова.

## Проблема (исправлена ранее)

В истории изменений (Change history) отображались неверные значения для повторных пушей. Значения пересчитывались заново при загрузке истории, а не использовались те, что были на момент создания push.

### Пример проблемы из логов:

```
Push 1: Weight:1.50, Repeat Count:0, Effective Weight:1.5000, Contribution:+1.5000
Push 2: Weight:0.10, Repeat Count:1, Effective Weight:0.0500, Contribution:+0.0500
Push 3: Weight:0.10, Repeat Count:2, Effective Weight:0.0333, Contribution:+0.0333
Push 4: Weight:0.10, Repeat Count:3, Effective Weight:0.0250, Contribution:+0.0250
```

**Проблема:** Если вес пользователя изменился со временем (например, у него появились новые посты/комментарии), то при загрузке истории значения пересчитывались с новым весом, что давало неверные результаты.

## Причина

1. При отображении истории код пересчитывал TF details заново на момент загрузки
2. Использовались текущие значения веса пользователя, а не те, что были на момент создания push
3. Метаданные (weight, repeatCount, effectiveWeight, contribution) не сохранялись в `trust_flow_history.metadata`

## Решение

### 1. Создана функция `calculatePushDetails()`

Функция вычисляет детали конкретного push (weight, repeatCount, effectiveWeight, contribution) на момент его создания.

**Файл:** `lib/trustFlow.ts`

```typescript
export async function calculatePushDetails(
  pushId: number,
  fromUserId: string,
  toUserId: string
): Promise<{
  weight: number;
  repeatCount: number;
  effectiveWeight: number;
  contribution: number;
} | null>
```

### 2. Модифицирована функция `calculateAndSaveTrustFlow()`

Теперь при расчете TF, если передан `pushId`, функция автоматически вычисляет и сохраняет метаданные для этого push в `trust_flow_history.metadata`.

**Изменения:**
- Если `pushId` передан, вычисляются детали push
- Метаданные сохраняются в `trust_flow_history.metadata` через `saveTrustFlowToCache()`

### 3. Обновлен API endpoint `/api/users/[id]/trust-flow`

Теперь принимает параметр `pushId` из query string и передает его в `calculateAndSaveTrustFlow()`.

**Изменения:**
- Добавлен параметр `pushId` в query string
- `pushId` передается в `calculateAndSaveTrustFlow()`

### 4. Обновлен код создания push в `page.tsx`

При создании push и пересчете TF теперь передается `pushId` в API запрос.

**Изменения:**
```typescript
const res = await fetch(`/api/users/${profile.user_id}/trust-flow?recalculate=true&pushId=${insertData.id}`, {
  // ...
});
```

### 5. Обновлено отображение истории в `page.tsx`

Теперь при загрузке истории:
1. Загружаются сохраненные метаданные из `trust_flow_history`
2. Создается map из `push_id` к метаданным
3. При отображении используются сохраненные метаданные, если они есть
4. Если метаданных нет (для старых пушей), используется пересчет как fallback

**Изменения:**
- Добавлена загрузка `trust_flow_history` с метаданными
- Создается `savedMetadataMap` для быстрого доступа к сохраненным метаданным
- Приоритет отдается сохраненным метаданным, пересчет используется только как fallback

## Примеры расчетов

### Пример 1: Пользователь с TF = 5.0 (базовое значение = 1.5)

**Push 1 (в течение 30 дней):**
- baseWeight = 1.5
- repeatCount = 0
- effectiveWeight = 1.5 × 0.67^0 = 1.5 ✓

**Push 2 (в течение 30 дней):**
- baseWeight = 1.5
- repeatCount = 1
- effectiveWeight = 1.5 × 0.67^1 = 1.005 ≈ 1.01 ✓

**Push 3 (в течение 30 дней):**
- baseWeight = 1.5
- repeatCount = 2
- effectiveWeight = 1.5 × 0.67^2 = 0.673 ≈ 0.67 ✓

### Пример 2: Пользователь с TF = 25.0 (базовое значение = 2.0)

**Push 1 (в течение 30 дней):**
- baseWeight = 2.0
- repeatCount = 0
- effectiveWeight = 2.0 × 0.67^0 = 2.0 ✓

**Push 2 (в течение 30 дней):**
- baseWeight = 2.0
- repeatCount = 1
- effectiveWeight = 2.0 × 0.67^1 = 1.34 ✓

**Push 3 (в течение 30 дней):**
- baseWeight = 2.0
- repeatCount = 2
- effectiveWeight = 2.0 × 0.67^2 = 0.898 ≈ 0.90 ✓

### Пример 3: Пользователь с TF = 50.0 (базовое значение = 2.5)

**Push 1 (в течение 30 дней):**
- baseWeight = 2.5
- repeatCount = 0
- effectiveWeight = 2.5 × 0.67^0 = 2.5 ✓

**Push 2 (в течение 30 дней):**
- baseWeight = 2.5
- repeatCount = 1
- effectiveWeight = 2.5 × 0.67^1 = 1.675 ≈ 1.68 ✓

**Push 3 (в течение 30 дней):**
- baseWeight = 2.5
- repeatCount = 2
- effectiveWeight = 2.5 × 0.67^2 = 1.122 ≈ 1.12 ✓

### Пример 4: Push после 30 дней

Если последний push был 35 дней назад, следующий push считается первым снова:
- baseWeight = (зависит от текущего TF пользователя)
- repeatCount = 0 (считается первым, так как прошло больше 30 дней)
- effectiveWeight = baseWeight × 0.67^0 = baseWeight

## Что влияет на значения

1. **Base Weight (базовое значение):**
   - Зависит от **Trust Flow пользователя, который делает push** (fromUserId)
   - TF < 10: базовое значение = **1.5**
   - TF >= 10 и < 40: базовое значение = **2.0**
   - TF >= 40: базовое значение = **2.5**

2. **Repeat Count:**
   - Количество пушей от этого пользователя к целевому пользователю **в течение 30 календарных дней** ДО текущего push
   - Если прошло больше 30 дней, следующий push считается первым (repeatCount = 0)

3. **Effective Weight:**
   - Формула: `baseWeight × 0.67^repeatCount`
   - Каждый повторный push в течение 30 дней на 33% меньше предыдущего

4. **Contribution:**
   - Для positive push: `+effectiveWeight`
   - Для negative push: `-effectiveWeight`

## Результат

Теперь в истории изменений отображаются правильные значения, которые были на момент создания push, а не пересчитанные с текущими значениями веса пользователя.

Для старых пушей (созданных до этого исправления) значения будут пересчитываться при загрузке истории, но для новых пушей будут использоваться сохраненные метаданные.

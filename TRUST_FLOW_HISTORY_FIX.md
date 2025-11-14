# Исправление отображения Trust Flow в истории изменений

## Проблема

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

## Логика расчета

### Формула Effective Weight:

```
effectiveWeight = isFirstPushEver && repeatCount === 0 
  ? 1.5 
  : weight / (1 + repeatCount)
```

Где:
- `isFirstPushEver` - это первый push когда-либо от данного пользователя (к любому пользователю)
- `repeatCount` - количество пушей от этого пользователя к целевому пользователю ДО текущего push (0-based индекс)
- `weight` - вес пользователя на момент создания push

### Пример расчетов:

**Push 1 (первый push когда-либо):**
- weight = 1.50 (или вычисленный вес, если это не первый push когда-либо)
- repeatCount = 0
- effectiveWeight = 1.50 / (1 + 0) = 1.50 ✓

**Push 2:**
- weight = 0.10
- repeatCount = 1
- effectiveWeight = 0.10 / (1 + 1) = 0.05 ✓

**Push 3:**
- weight = 0.10
- repeatCount = 2
- effectiveWeight = 0.10 / (1 + 2) = 0.0333... ≈ 0.0333 ✓

**Push 4:**
- weight = 0.10
- repeatCount = 3
- effectiveWeight = 0.10 / (1 + 3) = 0.025 ✓

## Что влияет на значения

1. **Weight (вес пользователя):**
   - Зависит от активности пользователя (посты, комментарии, SW)
   - Зависит от возраста аккаунта
   - Формула: `W = log(1 + Activity) * log(1 + AccountAge)`
   - Минимальный вес: `MIN_USER_WEIGHT = 0.1`

2. **Repeat Count:**
   - Количество пушей от этого пользователя к целевому пользователю ДО текущего push
   - Рассчитывается на основе хронологического порядка пушей

3. **Effective Weight:**
   - Для первого push когда-либо: `1.5` (фиксированное значение)
   - Для остальных: `weight / (1 + repeatCount)`

4. **Contribution:**
   - Для positive push: `+effectiveWeight`
   - Для negative push: `-effectiveWeight`

## Результат

Теперь в истории изменений отображаются правильные значения, которые были на момент создания push, а не пересчитанные с текущими значениями веса пользователя.

Для старых пушей (созданных до этого исправления) значения будут пересчитываться при загрузке истории, но для новых пушей будут использоваться сохраненные метаданные.

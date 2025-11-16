# 🚀 Рекомендации по оптимизации производительности

## 📋 Краткое резюме

Сайт **sigmet.app** имеет серьезные проблемы с производительностью:
- **FCP (First Contentful Paint)**: 2.5-3.5 секунды (цель: <1.8s)
- **LCP (Largest Contentful Paint)**: 3.5-5 секунд (цель: <2.5s)
- **TTI (Time to Interactive)**: 4-6 секунд (цель: <3.8s)
- **Bundle size**: 800KB-1.2MB (цель: <500KB)

**Основные проблемы:**
1. Отсутствие code splitting
2. Синхронная загрузка тяжелых библиотек
3. Большие компоненты без разделения
4. Множественные запросы к Supabase при загрузке
5. Отсутствие оптимизации изображений

---

## 🎯 План действий (по приоритетам)

### ⚡ Неделя 1: Критические исправления (8-10 часов работы)

#### 1. PostHogInit - динамический импорт (15 минут)

**Файл:** `app/layout.tsx`

**Было:**
```tsx
import PostHogInit from "@/components/PostHogInit";
// ...
<PostHogInit />
```

**Стало:**
```tsx
import dynamic from 'next/dynamic';

const PostHogInit = dynamic(() => import("@/components/PostHogInit"), {
  ssr: false
});
// ...
<PostHogInit />
```

**Ожидаемый результат:** FCP -200ms, TTI -300ms, Bundle -50KB

---

#### 2. EmojiPicker - динамический импорт (30 минут)

**Файл:** `components/EmojiPicker.tsx`

**Было:**
```tsx
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';
```

**Стало:**
```tsx
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Smile } from 'lucide-react';
import dynamic from 'next/dynamic';

const EmojiPickerContent = dynamic(() => import('./EmojiPickerContent'), {
  ssr: false,
  loading: () => <Smile className="h-5 w-5" />
});

// ... остальной код компонента
```

**Создать:** `components/EmojiPickerContent.tsx` с логикой загрузки данных

**Ожидаемый результат:** Bundle -250KB, FCP -300ms, TTI -400ms

---

#### 3. framer-motion - динамический импорт (1-2 часа)

**Стратегия:** Заменить синхронные импорты на динамические в компонентах:
- `components/PostCard.tsx`
- `components/PostActionMenu.tsx`
- `components/Button.tsx`
- `components/PostReactions.tsx`
- `components/badges/BadgeCard.tsx`
- `components/PostCommentsBadge.tsx`

**Пример для PostCard:**
```tsx
import dynamic from 'next/dynamic';

const MotionDiv = dynamic(
  () => import('framer-motion').then(mod => ({ default: mod.motion.div })),
  { ssr: false }
);
```

**Альтернатива:** Использовать CSS transitions для простых анимаций

**Ожидаемый результат:** Bundle -50KB, FCP -100ms, TTI -150ms

---

#### 4. PostFeed - code splitting (4-6 часов)

**Файл:** `components/PostFeed.tsx`

**План:**
1. Разбить на компоненты:
   - `PostComposer.tsx` - форма создания поста
   - `PostList.tsx` - список постов
   - `PostFilters.tsx` - фильтры

2. Использовать динамические импорты:
```tsx
const PostComposer = dynamic(() => import('./PostComposer'), {
  ssr: false,
  loading: () => <PostComposerSkeleton />
});

const PostList = dynamic(() => import('./PostList'), {
  ssr: false
});
```

3. Уменьшить начальную загрузку:
```tsx
const initialLimit = enableLazyLoad ? 10 : 15; // было 50
```

**Ожидаемый результат:** Bundle -150KB, FCP -500ms, TTI -1000ms

---

### 📈 Неделя 2: Важные оптимизации (8-12 часов работы)

#### 5. Header - серверный компонент (1-2 часа)

**Файл:** `components/Header.tsx`

**Создать:** `components/HeaderClient.tsx` для клиентской логики
**Создать:** `components/HeaderServer.tsx` для получения user на сервере

**Ожидаемый результат:** FCP -100ms, TTI -150ms

---

#### 6. SiteSettingsProvider - кеширование (1-2 часа)

**Файл:** `components/SiteSettingsContext.tsx`

**Использовать React Cache:**
```tsx
import { cache } from 'react';

const getSiteSettings = cache(async () => {
  const { data } = await supabase.from("site_settings")...
  return data;
});
```

**Ожидаемый результат:** FCP -200ms, TTI -300ms

---

#### 7. Оптимизация изображений (2-3 часа)

**Заменить все `<img>` на `next/image`:**

```tsx
import Image from 'next/image';

// Было:
<img src={avatar} alt="avatar" />

// Стало:
<Image 
  src={avatar} 
  alt="avatar"
  width={64}
  height={64}
  loading="lazy"
  placeholder="blur"
/>
```

**Файлы для изменения:**
- `components/Header.tsx`
- `components/PostFeed.tsx`
- `components/AvatarWithBadge.tsx`
- `app/(auth)/profile/page.tsx`

**Ожидаемый результат:** LCP -500ms, Bandwidth -200KB

---

#### 8. Виртуализация списков (4-6 часов)

**Установить:**
```bash
npm install react-window
```

**Использовать в PostFeed:**
```tsx
import { FixedSizeList } from 'react-window';

<FixedSizeList
  height={600}
  itemCount={posts.length}
  itemSize={200}
  width="100%"
>
  {({ index, style }) => (
    <div style={style}>
      <PostCard post={posts[index]} />
    </div>
  )}
</FixedSizeList>
```

**Ожидаемый результат:** TTI -1000ms, Memory -50MB

---

### 🔧 Неделя 3: Дополнительные улучшения (5-7 часов работы)

#### 9. SupabaseAuthSync - динамический импорт (15 минут)

**Файл:** `app/layout.tsx`

```tsx
const SupabaseAuthSync = dynamic(() => import("@/components/SupabaseAuthSync"), {
  ssr: false
});
```

**Ожидаемый результат:** FCP -50ms, TTI -100ms

---

#### 10. CountryCitySelect - динамический импорт (15 минут)

**Файл:** `app/(auth)/profile/page.tsx`

```tsx
const CountryCitySelect = dynamic(() => import("@/components/CountryCitySelect"), {
  ssr: false
});
```

**Ожидаемый результат:** Bundle -10KB, FCP -50ms

---

#### 11. Preload критических ресурсов (30 минут)

**Файл:** `app/layout.tsx`

```tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preload" href="/fonts/main.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href={logo_url} as="image" />
      </head>
      <body>
        {/* ... */}
      </body>
    </html>
  );
}
```

**Ожидаемый результат:** FCP -100ms, LCP -200ms

---

#### 12. Service Worker (4-6 часов)

**Установить Workbox:**
```bash
npm install workbox-webpack-plugin
```

**Настроить кеширование:**
- Статические ресурсы (JS, CSS, изображения)
- API запросы (с стратегией NetworkFirst)
- Offline fallback

**Ожидаемый результат:** Повторные загрузки -500ms, Offline поддержка

---

## 📊 Ожидаемые результаты

### После Недели 1 (Критические исправления):
- ✅ FCP: **-30-40%** (2.5-3.5s → 1.5-2s)
- ✅ LCP: **-20-30%** (3.5-5s → 2.5-3.5s)
- ✅ TTI: **-40-50%** (4-6s → 2-3s)
- ✅ Bundle: **-25-30%** (800KB-1.2MB → 600-800KB)

### После Недели 2 (Важные оптимизации):
- ✅ FCP: **-50-60%** (2.5-3.5s → 1-1.5s)
- ✅ LCP: **-40-50%** (3.5-5s → 2-2.5s)
- ✅ TTI: **-60-70%** (4-6s → 1.5-2s)
- ✅ Bundle: **-35-40%** (800KB-1.2MB → 500-700KB)

### После всех оптимизаций:
- ✅ FCP: **-60-70%** (2.5-3.5s → 0.8-1.2s)
- ✅ LCP: **-50-60%** (3.5-5s → 1.5-2.5s)
- ✅ TTI: **-70-80%** (4-6s → 1-1.5s)
- ✅ Bundle: **-40-50%** (800KB-1.2MB → 400-600KB)

---

## 🛠️ Инструменты для мониторинга

### 1. Bundle Analyzer
```bash
npm install @next/bundle-analyzer
```

**next.config.js:**
```js
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

module.exports = withBundleAnalyzer(nextConfig);
```

**Запуск:**
```bash
ANALYZE=true npm run build
```

### 2. Lighthouse CI
```bash
npm install -g @lhci/cli
```

**lighthouserc.js:**
```js
module.exports = {
  ci: {
    collect: {
      url: ['http://localhost:3000'],
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.8 }],
        'categories:accessibility': ['error', { minScore: 0.9 }],
      },
    },
  },
};
```

### 3. Web Vitals
Уже установлен: `@vercel/speed-insights`

---

## ✅ Чеклист выполнения

### Неделя 1
- [ ] PostHogInit → dynamic import
- [ ] EmojiPicker → dynamic import
- [ ] framer-motion → dynamic import
- [ ] PostFeed → code splitting
- [ ] Тестирование изменений
- [ ] Проверка метрик

### Неделя 2
- [ ] Header → server component
- [ ] SiteSettingsProvider → кеширование
- [ ] Изображения → next/image
- [ ] Виртуализация списков
- [ ] Тестирование изменений
- [ ] Проверка метрик

### Неделя 3
- [ ] SupabaseAuthSync → dynamic import
- [ ] CountryCitySelect → dynamic import
- [ ] Preload ресурсов
- [ ] Service worker
- [ ] Финальное тестирование
- [ ] Документация изменений

---

## 🎓 Дополнительные рекомендации

### 1. Оптимизация Supabase запросов
- Использовать batch запросы где возможно
- Кешировать часто используемые данные
- Использовать индексы в базе данных

### 2. Оптимизация CSS
- Удалить неиспользуемые стили
- Использовать CSS modules для tree-shaking
- Минифицировать CSS в production

### 3. Оптимизация шрифтов
- Использовать `font-display: swap`
- Preload критических шрифтов
- Использовать variable fonts где возможно

### 4. Мониторинг производительности
- Настроить Web Vitals tracking
- Настроить error tracking
- Регулярно проверять метрики

---

## 📚 Полезные ссылки

- [Next.js Performance](https://nextjs.org/docs/app/building-your-application/optimizing)
- [Web Vitals](https://web.dev/vitals/)
- [React Performance](https://react.dev/learn/render-and-commit)
- [Bundle Analyzer](https://www.npmjs.com/package/@next/bundle-analyzer)

---

## 📝 Примечания

1. **Тестирование:** После каждого изменения проверять метрики производительности
2. **Мониторинг:** Настроить автоматический мониторинг в production
3. **Документация:** Обновлять документацию при изменениях
4. **Регрессии:** Проверять что оптимизации не ломают функциональность

---

**Дата создания:** 2025-01-27
**Версия:** 1.0
**Статус:** Готово к реализации

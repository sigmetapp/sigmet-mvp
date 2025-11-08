# Предложения по оптимизации загрузки /feed

## Анализ текущей реализации

### Текущие проблемы

1. **Большой компонент PostFeed** (1775+ строк)
   - Все логика в одном файле
   - Сложно оптимизировать отдельные части
   - Большой bundle size

2. **Множественные последовательные запросы к Supabase**
   - Загрузка постов
   - Загрузка профилей авторов (отдельный запрос)
   - Загрузка SW scores (отдельный запрос)
   - Загрузка лайков (отдельный запрос)
   - Загрузка реакций (отдельный запрос)
   - Загрузка growth statuses (отдельный запрос)
   - Загрузка комментариев (по требованию)
   - Загрузка направлений (directions)

3. **Lazy loading отключен**
   - `enableLazyLoad={false}` на странице feed
   - Загружается 50 постов сразу
   - Медленная первоначальная загрузка

4. **Отсутствие кеширования**
   - Каждый раз загружаются все данные заново
   - Нет оптимистичных обновлений
   - Нет инвалидации кеша

5. **Неоптимизированные рендеры**
   - PostCard не мемоизирован
   - Множественные ре-рендеры при изменении состояния
   - Нет виртуализации списка

6. **Синхронная загрузка тяжелых компонентов**
   - EmojiPicker загружается сразу
   - PostComposer загружается сразу
   - Все модальные окна в bundle

---

## Предложения по оптимизации

### 🔴 Критичные (высокий приоритет)

#### 1. Включить lazy loading с пагинацией

**Текущий код:**
```tsx
// app/(auth)/feed/page.tsx
<PostFeed
  enableLazyLoad={false}  // ❌ Отключено
  // ...
/>
```

**Оптимизация:**
```tsx
// app/(auth)/feed/page.tsx
<PostFeed
  enableLazyLoad={true}  // ✅ Включено
  // ...
/>
```

**Выигрыш:**
- Первоначальная загрузка: 10 постов вместо 50
- Уменьшение времени загрузки на 60-80%
- Меньше данных для обработки

---

#### 2. Объединить запросы к Supabase (batch loading)

**Текущий код:**
```tsx
// components/PostFeed.tsx
const loadFeed = useCallback(async (...) => {
  // 1. Загрузка постов
  const { data } = await supabase.from("posts").select("*")...
  
  // 2. Загрузка профилей (отдельный запрос)
  const { data: profs } = await supabase
    .from("profiles")
    .select("user_id, username, full_name, avatar_url")
    .in("user_id", userIds);
  
  // 3. Загрузка SW scores (отдельный запрос)
  const { data: swData } = await supabase
    .from("sw_scores")
    .select("user_id, total")
    .in("user_id", userIds);
}, []);
```

**Оптимизация - вариант 1 (RPC функция):**
```sql
-- supabase/migrations/xxx_feed_data_rpc.sql
CREATE OR REPLACE FUNCTION get_feed_data(
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0,
  p_filter_type TEXT DEFAULT 'all',
  p_direction_id TEXT DEFAULT NULL,
  p_user_id_filter TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'posts', (
      SELECT json_agg(json_build_object(
        'id', p.id,
        'user_id', p.user_id,
        'body', p.body,
        'image_url', p.image_url,
        'video_url', p.video_url,
        'category', p.category,
        'created_at', p.created_at,
        'views', p.views,
        'likes_count', p.likes_count
      ))
      FROM posts p
      WHERE (p_filter_type = 'all' OR ...)
      ORDER BY p.created_at DESC
      LIMIT p_limit OFFSET p_offset
    ),
    'profiles', (
      SELECT json_agg(json_build_object(
        'user_id', pr.user_id,
        'username', pr.username,
        'full_name', pr.full_name,
        'avatar_url', pr.avatar_url
      ))
      FROM profiles pr
      WHERE pr.user_id IN (
        SELECT DISTINCT user_id FROM posts ...
      )
    ),
    'sw_scores', (
      SELECT json_agg(json_build_object(
        'user_id', sw.user_id,
        'total', sw.total
      ))
      FROM sw_scores sw
      WHERE sw.user_id IN (...)
    )
  ) INTO result;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;
```

```tsx
// components/PostFeed.tsx
const loadFeed = useCallback(async (...) => {
  const { data, error } = await supabase.rpc('get_feed_data', {
    p_limit: limit,
    p_offset: offset,
    p_filter_type: filterType,
    p_direction_id: directionId,
    p_user_id_filter: filterUserId
  });
  
  if (data) {
    setPosts(data.posts);
    setProfilesByUserId(data.profiles);
    setSwScoresByUserId(data.sw_scores);
  }
}, []);
```

**Оптимизация - вариант 2 (параллельные запросы):**
```tsx
// components/PostFeed.tsx
const loadFeed = useCallback(async (...) => {
  // Загружаем посты
  const postsQuery = supabase.from("posts").select("*")...
  
  // Параллельно загружаем профили и SW scores
  const [postsResult, profilesResult, swScoresResult] = await Promise.all([
    postsQuery,
    userIds.length > 0 ? supabase
      .from("profiles")
      .select("user_id, username, full_name, avatar_url")
      .in("user_id", userIds) : Promise.resolve({ data: null }),
    userIds.length > 0 ? supabase
      .from("sw_scores")
      .select("user_id, total")
      .in("user_id", userIds) : Promise.resolve({ data: null })
  ]);
  
  // Обрабатываем результаты
  if (postsResult.data) {
    setPosts(postsResult.data);
  }
  if (profilesResult.data) {
    setProfilesByUserId(/* ... */);
  }
  if (swScoresResult.data) {
    setSwScoresByUserId(/* ... */);
  }
}, []);
```

**Выигрыш:**
- Уменьшение количества запросов с 3+ до 1 (RPC) или параллельное выполнение
- Сокращение времени загрузки на 40-60%
- Меньше нагрузка на базу данных

---

#### 3. Мемоизация PostCard с React.memo

**Текущий код:**
```tsx
// components/PostCard.tsx
export default function PostCard({ post, ... }) {
  // Нет мемоизации
}
```

**Оптимизация:**
```tsx
// components/PostCard.tsx
import React from 'react';

const PostCard = React.memo(function PostCard({ post, ... }) {
  // ...
}, (prevProps, nextProps) => {
  // Кастомная функция сравнения
  return (
    prevProps.post.id === nextProps.post.id &&
    prevProps.post.commentsCount === nextProps.post.commentsCount &&
    prevProps.post.content === nextProps.post.content &&
    prevProps.disableNavigation === nextProps.disableNavigation
  );
});

export default PostCard;
```

**Выигрыш:**
- Уменьшение ре-рендеров на 70-90%
- Улучшение производительности скроллинга

---

#### 4. Оптимизация загрузки реакций и лайков

**Текущий код:**
```tsx
// Загружаются отдельно для каждого поста
useEffect(() => {
  if (posts.length === 0) return;
  const ids = posts.map((p) => p.id);
  const { data } = await supabase
    .from("post_reactions")
    .select("post_id, kind, user_id")
    .in("post_id", ids);
  // ...
}, [posts]);
```

**Оптимизация:**
```tsx
// Загружаем реакции вместе с постами через JOIN или RPC
// Или используем один запрос для всех постов
const loadReactions = useCallback(async (postIds: number[]) => {
  if (postIds.length === 0) return;
  
  // Batch запрос для всех постов сразу
  const { data } = await supabase
    .from("post_reactions")
    .select("post_id, kind, user_id")
    .in("post_id", postIds);
  
  // Группируем по post_id
  const reactionsByPost = postIds.reduce((acc, id) => {
    acc[id] = { inspire: 0, respect: 0, relate: 0, support: 0, celebrate: 0 };
    return acc;
  }, {});
  
  if (data) {
    data.forEach(r => {
      const postId = r.post_id;
      const kind = r.kind;
      if (reactionsByPost[postId] && reactionsByPost[postId][kind] !== undefined) {
        reactionsByPost[postId][kind]++;
      }
    });
  }
  
  setReactionsByPostId(prev => ({ ...prev, ...reactionsByPost }));
}, []);
```

**Выигрыш:**
- Один запрос вместо множества
- Уменьшение времени загрузки на 30-50%

---

### 🟡 Важные (средний приоритет)

#### 5. Виртуализация списка постов

**Проблема:** При большом количестве постов рендерятся все элементы DOM

**Решение:**
```tsx
// components/PostFeed.tsx
import { useVirtualizer } from '@tanstack/react-virtual';

export default function PostFeed({ ... }) {
  const parentRef = useRef<HTMLDivElement>(null);
  
  const virtualizer = useVirtualizer({
    count: posts.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 300, // Примерная высота поста
    overscan: 5, // Рендерим 5 дополнительных элементов
  });
  
  return (
    <div ref={parentRef} className="h-screen overflow-auto">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const post = posts[virtualItem.index];
          return (
            <div
              key={virtualItem.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <PostCard post={post} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

**Выигрыш:**
- Рендерится только видимые посты + overscan
- Улучшение производительности при большом количестве постов
- Плавный скроллинг

---

#### 6. Динамический импорт тяжелых компонентов

**Текущий код:**
```tsx
// components/PostFeed.tsx
import EmojiPicker from "@/components/EmojiPicker";
import PostReportModal from "@/components/PostReportModal";
import ViewsChart from "@/components/ViewsChart";
// Все загружаются сразу
```

**Оптимизация:**
```tsx
// components/PostFeed.tsx
import dynamic from 'next/dynamic';

const EmojiPicker = dynamic(() => import("@/components/EmojiPicker"), {
  ssr: false,
  loading: () => <div className="animate-pulse h-8 w-8 bg-gray-200 rounded" />
});

const PostReportModal = dynamic(() => import("@/components/PostReportModal"), {
  ssr: false,
});

const ViewsChart = dynamic(() => import("@/components/ViewsChart"), {
  ssr: false,
});
```

**Выигрыш:**
- Уменьшение initial bundle size на 100-200KB
- Быстрее первоначальная загрузка

---

#### 7. Кеширование данных с React Query или SWR

**Проблема:** Каждый раз загружаются данные заново

**Решение:**
```tsx
// lib/hooks/useFeed.ts
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';

export function useFeed(filterType, directionId, limit = 10) {
  return useInfiniteQuery({
    queryKey: ['feed', filterType, directionId],
    queryFn: async ({ pageParam = 0 }) => {
      const { data, error } = await supabase
        .from("posts")
        .select("*")
        .order("created_at", { ascending: false })
        .range(pageParam, pageParam + limit - 1);
      
      if (error) throw error;
      return data;
    },
    getNextPageParam: (lastPage, pages) => {
      if (lastPage.length < limit) return undefined;
      return pages.length * limit;
    },
    staleTime: 30000, // 30 секунд
    cacheTime: 300000, // 5 минут
  });
}

// components/PostFeed.tsx
import { useFeed } from '@/lib/hooks/useFeed';

export default function PostFeed({ ... }) {
  const { data, fetchNextPage, hasNextPage, isFetching } = useFeed(
    activeFilter,
    activeDirection,
    10
  );
  
  const posts = data?.pages.flat() ?? [];
  
  // ...
}
```

**Выигрыш:**
- Кеширование данных
- Автоматическая инвалидация
- Оптимистичные обновления
- Retry логика

---

#### 8. Оптимизация загрузки изображений

**Текущий код:**
```tsx
<img 
  src={p.image_url} 
  loading="lazy" 
  className="..."
/>
```

**Оптимизация:**
```tsx
// Использовать next/image для оптимизации
import Image from 'next/image';

<Image
  src={p.image_url}
  alt="post image"
  width={800}
  height={600}
  loading="lazy"
  placeholder="blur"
  blurDataURL="data:image/jpeg;base64,..."
  className="..."
/>
```

**Выигрыш:**
- Автоматическая оптимизация изображений
- Lazy loading с placeholder
- Уменьшение размера изображений

---

### 🟢 Желательные (низкий приоритет)

#### 9. Разбить PostFeed на более мелкие компоненты

**Текущий код:**
```tsx
// components/PostFeed.tsx (1775 строк)
export default function PostFeed({ ... }) {
  // Весь код в одном компоненте
}
```

**Оптимизация:**
```tsx
// components/PostFeed/PostFeed.tsx
import PostComposer from './PostComposer';
import PostList from './PostList';
import PostFilters from './PostFilters';

export default function PostFeed({ ... }) {
  return (
    <div>
      <PostFilters />
      <PostComposer />
      <PostList />
    </div>
  );
}

// components/PostFeed/PostComposer.tsx
export default function PostComposer({ ... }) {
  // Логика создания поста
}

// components/PostFeed/PostList.tsx
export default function PostList({ ... }) {
  // Логика отображения списка постов
}
```

**Выигрыш:**
- Code splitting
- Легче поддерживать
- Лучшая производительность

---

#### 10. Prefetch данных на сервере

**Решение:**
```tsx
// app/(auth)/feed/page.tsx
import { createServerClient } from '@/lib/supabaseServer';

export default async function FeedPage() {
  const supabase = createServerClient();
  
  // Prefetch посты на сервере
  const { data: initialPosts } = await supabase
    .from("posts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(10);
  
  return (
    <PostFeed initialPosts={initialPosts} />
  );
}
```

**Выигрыш:**
- Данные загружаются на сервере
- Быстрее первоначальный рендер
- Меньше запросов на клиенте

---

#### 11. Оптимизация useEffect зависимостей

**Текущий код:**
```tsx
useEffect(() => {
  // Загружается при каждом изменении posts
  if (posts.length === 0) return;
  // ...
}, [posts]); // ❌ Зависит от всего массива posts
```

**Оптимизация:**
```tsx
const postIds = useMemo(() => posts.map(p => p.id), [posts]);

useEffect(() => {
  if (postIds.length === 0) return;
  // ...
}, [postIds]); // ✅ Зависит только от ID постов
```

**Выигрыш:**
- Меньше ненужных ре-рендеров
- Более предсказуемое поведение

---

#### 12. Debounce для фильтров

**Проблема:** При быстром переключении фильтров делается много запросов

**Решение:**
```tsx
import { useDebouncedCallback } from 'use-debounce';

const debouncedLoadFeed = useDebouncedCallback(
  (filterType, directionId) => {
    loadFeed(directionId, filterType, 0, limit);
  },
  300 // 300ms задержка
);

useEffect(() => {
  debouncedLoadFeed(activeFilter, activeDirection);
}, [activeFilter, activeDirection]);
```

**Выигрыш:**
- Меньше запросов к БД
- Лучший UX

---

## Приоритизация внедрения

### Фаза 1 (Быстрые победы - 1-2 дня)
1. ✅ Включить lazy loading
2. ✅ Мемоизация PostCard
3. ✅ Параллельные запросы к Supabase
4. ✅ Динамический импорт тяжелых компонентов

**Ожидаемый выигрыш:** 40-60% улучшение времени загрузки

### Фаза 2 (Средний приоритет - 3-5 дней)
5. ✅ Объединение запросов через RPC
6. ✅ Кеширование с React Query
7. ✅ Оптимизация изображений
8. ✅ Debounce для фильтров

**Ожидаемый выигрыш:** Еще 20-30% улучшение

### Фаза 3 (Долгосрочные - 1-2 недели)
9. ✅ Виртуализация списка
10. ✅ Разбиение на компоненты
11. ✅ Prefetch на сервере
12. ✅ Оптимизация useEffect

**Ожидаемый выигрыш:** Плавный скроллинг, лучшая архитектура

---

## Метрики для измерения

1. **First Contentful Paint (FCP)**
   - Цель: < 1.5s
   - Текущее: ~2-3s

2. **Largest Contentful Paint (LCP)**
   - Цель: < 2.5s
   - Текущее: ~3-4s

3. **Time to Interactive (TTI)**
   - Цель: < 3.5s
   - Текущее: ~5-6s

4. **Total Blocking Time (TBT)**
   - Цель: < 200ms
   - Текущее: ~500-800ms

5. **Bundle Size**
   - Цель: < 200KB (initial)
   - Текущее: ~300-400KB

---

## Инструменты для мониторинга

```bash
# Bundle analyzer
npm install --save-dev @next/bundle-analyzer

# React DevTools Profiler
# Встроен в Chrome DevTools

# Web Vitals
npm install web-vitals
```

---

## Заключение

Реализация предложенных оптимизаций позволит:
- ⚡ Ускорить загрузку feed на 60-80%
- 📦 Уменьшить bundle size на 20-30%
- 🎯 Улучшить UX и производительность
- 🔧 Упростить поддержку кода

Рекомендуется начать с Фазы 1 для быстрого эффекта, затем постепенно внедрять остальные оптимизации.

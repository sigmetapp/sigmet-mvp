# Примеры оптимизаций для улучшения производительности

## 1. Оптимизация PostHogInit (Критично)

### Текущий код:
```tsx
// app/layout.tsx
import PostHogInit from "@/components/PostHogInit";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PostHogInit />
        {/* ... */}
      </body>
    </html>
  );
}
```

### Оптимизированный код:
```tsx
// app/layout.tsx
import dynamic from 'next/dynamic';

const PostHogInit = dynamic(() => import("@/components/PostHogInit"), {
  ssr: false, // Аналитика не нужна на сервере
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PostHogInit />
        {/* ... */}
      </body>
    </html>
  );
}
```

**Выигрыш:** Аналитика не блокирует первоначальный рендер, загружается асинхронно

---

## 2. Оптимизация EmojiPicker (Критично)

### Текущий код:
```tsx
// components/EmojiPicker.tsx
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';

export default function EmojiPicker({ onEmojiSelect, ... }) {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <div>
      <button onClick={() => setIsOpen(!isOpen)}>...</button>
      {isOpen && (
        <Picker data={data} ... />
      )}
    </div>
  );
}
```

### Оптимизированный код:
```tsx
// components/EmojiPicker.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Smile } from 'lucide-react';
import dynamic from 'next/dynamic';

// Динамический импорт тяжелого пикера
const EmojiPickerCore = dynamic(
  () => import('@emoji-mart/react').then((mod) => mod.default),
  { 
    ssr: false,
    loading: () => <div className="w-[352px] h-[435px] bg-white/10 rounded-lg animate-pulse" />
  }
);

// Динамический импорт данных
const loadEmojiData = () => import('@emoji-mart/data').then((mod) => mod.default);

export default function EmojiPicker({ onEmojiSelect, ... }) {
  const [isOpen, setIsOpen] = useState(false);
  const [emojiData, setEmojiData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && !emojiData && !loading) {
      setLoading(true);
      loadEmojiData().then((data) => {
        setEmojiData(data);
        setLoading(false);
      });
    }
  }, [isOpen, emojiData, loading]);

  return (
    <div>
      <button onClick={() => setIsOpen(!isOpen)}>...</button>
      {isOpen && emojiData && (
        <EmojiPickerCore data={emojiData} ... />
      )}
    </div>
  );
}
```

**Выигрыш:** Эмодзи-данные (~200KB) загружаются только при открытии пикера, не блокируют первоначальный рендер

---

## 3. Оптимизация CountryCitySelect (Критично)

### Текущий код:
```tsx
// components/CountryCitySelect.tsx
import { Country, City } from "country-state-city";

export default function CountryCitySelect({ value, onChange }) {
  const countries = useMemo(() => Country.getAllCountries(), []);
  
  useEffect(() => {
    if (!open || allCities) return;
    const list = City.getAllCities()?.slice(0) || []; // Загружает ВСЕ города
    // ...
  }, [open, allCities]);
}
```

### Оптимизированный код:
```tsx
// components/CountryCitySelect.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from 'next/dynamic';

// Динамический импорт библиотеки
const loadCountryStateCity = async () => {
  const mod = await import("country-state-city");
  return { Country: mod.Country, City: mod.City };
};

export default function CountryCitySelect({ value, onChange }) {
  const [countryStateCity, setCountryStateCity] = useState<{
    Country: typeof import('country-state-city').Country;
    City: typeof import('country-state-city').City;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  // Загружаем библиотеку только при открытии
  useEffect(() => {
    if (open && !countryStateCity && !loading) {
      setLoading(true);
      loadCountryStateCity().then((lib) => {
        setCountryStateCity(lib);
        setLoading(false);
      });
    }
  }, [open, countryStateCity, loading]);

  const countries = useMemo(() => {
    if (!countryStateCity) return [];
    return countryStateCity.Country.getAllCountries();
  }, [countryStateCity]);

  // Ленивая загрузка городов с debounce
  useEffect(() => {
    if (!open || !countryStateCity || allCities) return;
    
    // Debounce для поиска - загружаем только если есть запрос
    const timeoutId = setTimeout(() => {
      if (query.trim().length >= 2) { // Загружаем только если есть поисковый запрос
        const list = countryStateCity.City.getAllCities()?.slice(0) || [];
        // ...
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [open, query, countryStateCity, allCities]);
}
```

**Выигрыш:** Библиотека (~200KB+) загружается только при открытии, города загружаются только при поиске

---

## 4. Оптимизация framer-motion компонентов

### Текущий код:
```tsx
// components/PostCard.tsx
import { AnimatePresence, motion } from 'framer-motion';

export default function PostCard({ post, ... }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      // ...
    >
      {/* ... */}
    </motion.div>
  );
}
```

### Оптимизированный код (вариант 1 - динамический импорт):
```tsx
// components/PostCard.tsx
import dynamic from 'next/dynamic';
import { useState } from 'react';

const MotionDiv = dynamic(
  () => import('framer-motion').then((mod) => mod.motion.div),
  { ssr: false }
);

export default function PostCard({ post, ... }) {
  return (
    <MotionDiv
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      // ...
    >
      {/* ... */}
    </MotionDiv>
  );
}
```

### Оптимизированный код (вариант 2 - легкая альтернатива):
```tsx
// components/PostCard.tsx
// Для простых анимаций используем CSS transitions вместо framer-motion
import { useState } from 'react';

export default function PostCard({ post, ... }) {
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div
      className={`transition-opacity duration-300 ${
        mounted ? 'opacity-100' : 'opacity-0'
      }`}
      // ...
    >
      {/* ... */}
    </div>
  );
}
```

**Выигрыш:** framer-motion (~50KB) не загружается синхронно, или заменяется на легкие CSS анимации

---

## 5. Оптимизация PostFeed (разбиение на компоненты)

### Текущий код:
```tsx
// components/PostFeed.tsx (1292+ строк)
export default function PostFeed({ ... }) {
  // Весь код в одном компоненте
  // Composer, список постов, фильтры - все вместе
}
```

### Оптимизированный код:
```tsx
// components/PostFeed.tsx
import dynamic from 'next/dynamic';

// Разбиваем на отдельные компоненты
const PostComposer = dynamic(() => import('./PostComposer'), {
  ssr: false,
  loading: () => <div className="animate-pulse h-32 bg-white/10 rounded-lg" />
});

const PostList = dynamic(() => import('./PostList'));

export default function PostFeed({ showComposer, ... }) {
  return (
    <div>
      {showComposer && <PostComposer />}
      <PostList {...props} />
    </div>
  );
}
```

**Выигрыш:** Code splitting - компоненты загружаются по требованию

---

## 6. Оптимизация Header (серверный компонент)

### Текущий код:
```tsx
// components/Header.tsx (client component)
'use client';
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function Header() {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    // ...
  }, []);
}
```

### Оптимизированный код:
```tsx
// components/Header.tsx (server component)
import { getServerSession } from '@/lib/auth/getServerSession';
import HeaderClient from './HeaderClient';

export default async function Header() {
  const { user } = await getServerSession();
  return <HeaderClient initialUser={user} />;
}

// components/HeaderClient.tsx (client component)
'use client';
export default function HeaderClient({ initialUser }) {
  // Используем initialUser, обновляем только при изменении
  const [user, setUser] = useState(initialUser);
  // ...
}
```

**Выигрыш:** Нет блокирующего запроса при загрузке, данные получаем на сервере

---

## 7. Оптимизация SiteSettingsProvider

### Текущий код:
```tsx
// components/SiteSettingsContext.tsx
'use client';
export function SiteSettingsProvider({ children }) {
  useEffect(() => {
    const { data, error } = await supabase
      .from("site_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    // ...
  }, []);
}
```

### Оптимизированный код (вариант 1 - серверный компонент):
```tsx
// app/layout.tsx
import { getServerSession } from '@/lib/auth/getServerSession';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { SiteSettingsProvider } from '@/components/SiteSettingsContext';

export default async function RootLayout({ children }) {
  const { data } = await supabaseAdmin()
    .from("site_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
    
  const settings = {
    site_name: data?.site_name ?? null,
    logo_url: data?.logo_url ?? null,
    // ...
  };

  return (
    <SiteSettingsProvider initialSettings={settings}>
      {children}
    </SiteSettingsProvider>
  );
}
```

### Оптимизированный код (вариант 2 - кеширование):
```tsx
// components/SiteSettingsContext.tsx
'use client';
import { useMemo } from 'react';

// Кеш для настроек (можно использовать React Query или SWR)
const settingsCache = new Map();

export function SiteSettingsProvider({ children }) {
  const [settings, setSettings] = useState(() => {
    // Пытаемся получить из кеша
    if (settingsCache.has('settings')) {
      return settingsCache.get('settings');
    }
    return { site_name: null, logo_url: null };
  });

  useEffect(() => {
    if (settingsCache.has('settings')) return;
    
    // Загружаем только если нет в кеше
    supabase.from("site_settings")...
      .then(({ data }) => {
        const cached = { ... };
        settingsCache.set('settings', cached);
        setSettings(cached);
      });
  }, []);
}
```

**Выигрыш:** Нет запроса к БД при каждом рендере, используем серверный компонент или кеш

---

## Рекомендации по внедрению

1. **Начните с критичных проблем** (PostHogInit, EmojiPicker, CountryCitySelect)
2. **Тестируйте каждое изменение** - проверяйте bundle size и метрики производительности
3. **Используйте React DevTools Profiler** для измерения улучшений
4. **Добавьте метрики** - Web Vitals для мониторинга
5. **Постепенное внедрение** - не делайте все сразу, тестируйте по одному изменению

## Инструменты для проверки

```bash
# Анализ bundle size
npm install --save-dev @next/bundle-analyzer

# В next.config.js
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

# Запуск
ANALYZE=true npm run build
```

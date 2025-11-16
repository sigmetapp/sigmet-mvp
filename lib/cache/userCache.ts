/**
 * User Cache - кеширование данных пользователя
 * Использует localStorage для персистентности и memory cache для быстрого доступа
 */

type User = {
  id: string;
  email?: string;
  [key: string]: any;
};

interface CachedUser {
  user: User | null;
  timestamp: number;
}

const CACHE_KEY = 'sigmet_user_cache';
const TTL = 5 * 60 * 1000; // 5 минут

// Memory cache для быстрого доступа
let memoryCache: CachedUser | null = null;

export const userCache = {
  /**
   * Получить пользователя из кеша
   */
  get(): User | null {
    // Сначала проверяем memory cache
    if (memoryCache && Date.now() - memoryCache.timestamp < TTL) {
      return memoryCache.user;
    }

    // Затем проверяем localStorage
    if (typeof window === 'undefined') return null;

    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (!cached) return null;

      const parsed: CachedUser = JSON.parse(cached);
      const age = Date.now() - parsed.timestamp;

      if (age < TTL) {
        // Обновляем memory cache
        memoryCache = parsed;
        return parsed.user;
      } else {
        // Кеш устарел, удаляем
        localStorage.removeItem(CACHE_KEY);
        memoryCache = null;
      }
    } catch (error) {
      console.warn('Failed to read user cache:', error);
      localStorage.removeItem(CACHE_KEY);
    }

    return null;
  },

  /**
   * Сохранить пользователя в кеш
   */
  set(user: User | null): void {
    const cached: CachedUser = {
      user,
      timestamp: Date.now(),
    };

    // Обновляем memory cache
    memoryCache = cached;

    // Сохраняем в localStorage
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(cached));
      } catch (error) {
        console.warn('Failed to save user cache:', error);
      }
    }
  },

  /**
   * Инвалидировать кеш (при logout или изменении данных)
   */
  invalidate(): void {
    memoryCache = null;
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(CACHE_KEY);
      } catch (error) {
        console.warn('Failed to invalidate user cache:', error);
      }
    }
  },

  /**
   * Проверить, есть ли валидный кеш
   */
  hasValidCache(): boolean {
    return userCache.get() !== null;
  },
};

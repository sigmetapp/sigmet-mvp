/**
 * Directions Cache - кеширование направлений роста
 * Использует sessionStorage для персистентности в рамках сессии
 */

type Direction = {
  id: string;
  slug: string;
  title: string;
  emoji: string;
};

interface CachedDirections {
  directions: Direction[];
  timestamp: number;
}

const CACHE_KEY = 'sigmet_directions_cache';
const TTL = 30 * 60 * 1000; // 30 минут

export const directionsCache = {
  /**
   * Получить направления из кеша
   */
  get(): Direction[] | null {
    if (typeof window === 'undefined') return null;

    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (!cached) return null;

      const parsed: CachedDirections = JSON.parse(cached);
      const age = Date.now() - parsed.timestamp;

      if (age < TTL) {
        return parsed.directions;
      } else {
        // Кеш устарел, удаляем
        sessionStorage.removeItem(CACHE_KEY);
      }
    } catch (error) {
      console.warn('Failed to read directions cache:', error);
      sessionStorage.removeItem(CACHE_KEY);
    }

    return null;
  },

  /**
   * Сохранить направления в кеш
   */
  set(directions: Direction[]): void {
    if (typeof window === 'undefined') return;

    const cached: CachedDirections = {
      directions,
      timestamp: Date.now(),
    };

    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(cached));
    } catch (error) {
      console.warn('Failed to save directions cache:', error);
    }
  },

  /**
   * Инвалидировать кеш
   */
  invalidate(): void {
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.removeItem(CACHE_KEY);
      } catch (error) {
        console.warn('Failed to invalidate directions cache:', error);
      }
    }
  },

  /**
   * Проверить, есть ли валидный кеш
   */
  hasValidCache(): boolean {
    return directionsCache.get() !== null;
  },
};

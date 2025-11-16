/**
 * Profile Cache - кеширование профилей пользователей
 * Использует memory cache (Map) для активной сессии и localStorage для персистентности
 */

type Profile = {
  user_id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  [key: string]: any;
};

interface CachedProfile {
  profile: Profile;
  timestamp: number;
}

const CACHE_KEY_PREFIX = 'sigmet_profile_';
const MAX_LOCAL_STORAGE_PROFILES = 50; // Максимум профилей в localStorage
const TTL = 10 * 60 * 1000; // 10 минут

// Memory cache для быстрого доступа (Map<userId, CachedProfile>)
const memoryCache = new Map<string, CachedProfile>();

// LRU список для управления localStorage (храним только userId)
let lruList: string[] = [];

/**
 * Загрузить LRU список из localStorage
 */
function loadLRUList(): void {
  if (typeof window === 'undefined') return;
  try {
    const stored = localStorage.getItem('sigmet_profile_lru');
    if (stored) {
      lruList = JSON.parse(stored);
    }
  } catch (error) {
    console.warn('Failed to load LRU list:', error);
    lruList = [];
  }
}

/**
 * Сохранить LRU список в localStorage
 */
function saveLRUList(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('sigmet_profile_lru', JSON.stringify(lruList));
  } catch (error) {
    console.warn('Failed to save LRU list:', error);
  }
}

/**
 * Обновить LRU список (переместить userId в начало)
 */
function updateLRU(userId: string): void {
  const index = lruList.indexOf(userId);
  if (index > -1) {
    lruList.splice(index, 1);
  }
  lruList.unshift(userId);

  // Ограничиваем размер списка
  if (lruList.length > MAX_LOCAL_STORAGE_PROFILES) {
    const removed = lruList.pop();
    if (removed) {
      localStorage.removeItem(`${CACHE_KEY_PREFIX}${removed}`);
    }
  }

  saveLRUList();
}

// Загружаем LRU список при инициализации
if (typeof window !== 'undefined') {
  loadLRUList();
}

export const profileCache = {
  /**
   * Получить профиль из кеша
   */
  get(userId: string): Profile | null {
    if (!userId) return null;

    // Сначала проверяем memory cache
    const memoryCached = memoryCache.get(userId);
    if (memoryCached && Date.now() - memoryCached.timestamp < TTL) {
      return memoryCached.profile;
    }

    // Затем проверяем localStorage
    if (typeof window === 'undefined') return null;

    try {
      const cached = localStorage.getItem(`${CACHE_KEY_PREFIX}${userId}`);
      if (!cached) return null;

      const parsed: CachedProfile = JSON.parse(cached);
      const age = Date.now() - parsed.timestamp;

      if (age < TTL) {
        // Обновляем memory cache
        memoryCache.set(userId, parsed);
        updateLRU(userId);
        return parsed.profile;
      } else {
        // Кеш устарел, удаляем
        localStorage.removeItem(`${CACHE_KEY_PREFIX}${userId}`);
        const index = lruList.indexOf(userId);
        if (index > -1) {
          lruList.splice(index, 1);
          saveLRUList();
        }
      }
    } catch (error) {
      console.warn(`Failed to read profile cache for ${userId}:`, error);
      localStorage.removeItem(`${CACHE_KEY_PREFIX}${userId}`);
    }

    return null;
  },

  /**
   * Сохранить профиль в кеш
   */
  set(userId: string, profile: Profile): void {
    if (!userId) return;

    const cached: CachedProfile = {
      profile,
      timestamp: Date.now(),
    };

    // Обновляем memory cache
    memoryCache.set(userId, cached);

    // Сохраняем в localStorage
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(`${CACHE_KEY_PREFIX}${userId}`, JSON.stringify(cached));
        updateLRU(userId);
      } catch (error) {
        console.warn(`Failed to save profile cache for ${userId}:`, error);
        // Если localStorage переполнен, удаляем старые записи
        if (error instanceof DOMException && error.name === 'QuotaExceededError') {
          // Удаляем последние 10 записей из LRU
          const toRemove = lruList.slice(-10);
          toRemove.forEach((id) => {
            localStorage.removeItem(`${CACHE_KEY_PREFIX}${id}`);
          });
          lruList = lruList.slice(0, -10);
          saveLRUList();
          // Пытаемся сохранить снова
          try {
            localStorage.setItem(`${CACHE_KEY_PREFIX}${userId}`, JSON.stringify(cached));
            updateLRU(userId);
          } catch (retryError) {
            console.warn('Failed to save profile cache after cleanup:', retryError);
          }
        }
      }
    }
  },

  /**
   * Batch получение профилей (сначала из кеша, затем запрос недостающих)
   */
  batchGet(userIds: string[]): Map<string, Profile> {
    const result = new Map<string, Profile>();
    const missing: string[] = [];

    // Получаем из кеша все доступные
    for (const userId of userIds) {
      const cached = profileCache.get(userId);
      if (cached) {
        result.set(userId, cached);
      } else {
        missing.push(userId);
      }
    }

    return result;
  },

  /**
   * Batch сохранение профилей
   */
  batchSet(profiles: Profile[]): void {
    for (const profile of profiles) {
      if (profile.user_id) {
        profileCache.set(profile.user_id, profile);
      }
    }
  },

  /**
   * Инвалидировать кеш для конкретного пользователя
   */
  invalidate(userId: string): void {
    memoryCache.delete(userId);
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(`${CACHE_KEY_PREFIX}${userId}`);
        const index = lruList.indexOf(userId);
        if (index > -1) {
          lruList.splice(index, 1);
          saveLRUList();
        }
      } catch (error) {
        console.warn(`Failed to invalidate profile cache for ${userId}:`, error);
      }
    }
  },

  /**
   * Очистить весь кеш
   */
  clear(): void {
    memoryCache.clear();
    if (typeof window !== 'undefined') {
      try {
        // Удаляем все профили из localStorage
        lruList.forEach((userId) => {
          localStorage.removeItem(`${CACHE_KEY_PREFIX}${userId}`);
        });
        lruList = [];
        saveLRUList();
      } catch (error) {
        console.warn('Failed to clear profile cache:', error);
      }
    }
  },
};

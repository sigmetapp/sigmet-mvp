/**
 * IndexedDB cache for DM messages and partners
 * Provides better performance and larger storage capacity than sessionStorage
 */

const DB_NAME = 'dms-cache';
const DB_VERSION = 1;

interface DmDB extends IDBDatabase {
  messages: IDBObjectStore;
  partners: IDBObjectStore;
}

interface CacheOptions {
  maxMessages?: number;
  maxPartners?: number;
}

const DEFAULT_OPTIONS: Required<CacheOptions> = {
  maxMessages: 1000,
  maxPartners: 200,
};

/**
 * Open IndexedDB database
 */
async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Messages store
      if (!db.objectStoreNames.contains('messages')) {
        const messagesStore = db.createObjectStore('messages', { keyPath: 'id' });
        messagesStore.createIndex('thread_id', 'thread_id', { unique: false });
        messagesStore.createIndex('created_at', 'created_at', { unique: false });
        messagesStore.createIndex('sequence_number', 'sequence_number', { unique: false });
      }

      // Partners store
      if (!db.objectStoreNames.contains('partners')) {
        const partnersStore = db.createObjectStore('partners', { keyPath: 'user_id' });
        partnersStore.createIndex('last_message_at', 'last_message_at', { unique: false });
      }
    };
  });
}

/**
 * Cache messages for a thread
 */
export async function cacheMessages(
  threadId: string,
  messages: any[],
  options: CacheOptions = {}
): Promise<void> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return;
  }

  try {
    const db = await openDB();
    const tx = db.transaction('messages', 'readwrite');
    const store = tx.objectStore('messages');

    // Remove old messages for this thread
    const index = store.index('thread_id');
    const range = IDBKeyRange.only(threadId);
    const deleteRequest = index.openKeyCursor(range);
    
    deleteRequest.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        store.delete(cursor.primaryKey);
        cursor.continue();
      }
    };

      // Add new messages
      const { maxMessages } = { ...DEFAULT_OPTIONS, ...options };
      const messagesToCache = messages.slice(-maxMessages);

      for (const msg of messagesToCache) {
        const rawId = (msg as { id?: unknown }).id;
        const idString =
          typeof rawId === 'string' && rawId.trim().length > 0
            ? rawId
            : typeof rawId === 'number' && Number.isFinite(rawId)
              ? String(rawId)
              : null;

        if (!idString) {
          continue;
        }

        await new Promise<void>((resolve, reject) => {
          const payload = { ...msg, id: idString, thread_id: threadId };
          const request = store.put(payload);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
      }

      await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    db.close();
  } catch (error) {
    console.warn('Failed to cache messages in IndexedDB:', error);
  }
}

/**
 * Get cached messages for a thread
 */
export async function getCachedMessages(threadId: string): Promise<any[]> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return [];
  }

  try {
    const db = await openDB();
    const tx = db.transaction('messages', 'readonly');
    const store = tx.objectStore('messages');
    const index = store.index('thread_id');
    const range = IDBKeyRange.only(threadId);

    return new Promise((resolve, reject) => {
      const messages: any[] = [];
      const request = index.openCursor(range);

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          messages.push(cursor.value);
          cursor.continue();
        } else {
          // Sort by created_at
          messages.sort((a, b) => {
            const timeA = new Date(a.created_at).getTime();
            const timeB = new Date(b.created_at).getTime();
            return timeA - timeB;
          });
          resolve(messages);
        }
      };

      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn('Failed to get cached messages from IndexedDB:', error);
    return [];
  }
}

/**
 * Cache partners list
 */
export async function cachePartners(
  userId: string,
  partners: any[],
  options: CacheOptions = {}
): Promise<void> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return;
  }

  try {
    const db = await openDB();
    const tx = db.transaction('partners', 'readwrite');
    const store = tx.objectStore('partners');

    // Clear old partners for this user
    const allPartners = await new Promise<any[]>((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    // Remove old entries
    for (const partner of allPartners) {
      if (partner.user_id && !partners.some(p => p.user_id === partner.user_id)) {
        store.delete(partner.user_id);
      }
    }

    // Add/update partners
    const { maxPartners } = { ...DEFAULT_OPTIONS, ...options };
    const partnersToCache = partners.slice(0, maxPartners);

    for (const partner of partnersToCache) {
      await new Promise<void>((resolve, reject) => {
        const request = store.put({ ...partner, cached_at: Date.now() });
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    db.close();
  } catch (error) {
    console.warn('Failed to cache partners in IndexedDB:', error);
  }
}

/**
 * Get cached partners list
 */
export async function getCachedPartners(userId: string): Promise<any[]> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return [];
  }

  try {
    const db = await openDB();
    const tx = db.transaction('partners', 'readonly');
    const store = tx.objectStore('partners');

    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const partners = request.result || [];
        // Sort by last_message_at
        partners.sort((a, b) => {
          const timeA = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
          const timeB = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
          return timeB - timeA;
        });
        resolve(partners);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn('Failed to get cached partners from IndexedDB:', error);
    return [];
  }
}

/**
 * Clear cache for a thread
 */
export async function clearThreadCache(threadId: string): Promise<void> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return;
  }

  try {
    const db = await openDB();
    const tx = db.transaction('messages', 'readwrite');
    const store = tx.objectStore('messages');
    const index = store.index('thread_id');
    const range = IDBKeyRange.only(threadId);

    return new Promise((resolve, reject) => {
      const request = index.openKeyCursor(range);
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          store.delete(cursor.primaryKey);
          cursor.continue();
        } else {
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn('Failed to clear thread cache:', error);
  }
}

/**
 * Clear all cache
 */
export async function clearAllCache(): Promise<void> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return;
  }

  try {
    const db = await openDB();
    const tx = db.transaction(['messages', 'partners'], 'readwrite');
    
    await Promise.all([
      new Promise<void>((resolve, reject) => {
        const request = tx.objectStore('messages').clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      }),
      new Promise<void>((resolve, reject) => {
        const request = tx.objectStore('partners').clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      }),
    ]);

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    db.close();
  } catch (error) {
    console.warn('Failed to clear cache:', error);
  }
}

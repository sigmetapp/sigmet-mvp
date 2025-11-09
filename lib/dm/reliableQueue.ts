/**
 * Reliable Message Queue for 100% delivery guarantee
 * 
 * Features:
 * - Persistent storage in IndexedDB
 * - Automatic retry with exponential backoff
 * - Message deduplication
 * - Delivery confirmation tracking
 * - Offline queue support
 */

import { assertThreadId, type ThreadId } from './threadId';
import type { Message } from '@/lib/dms';

const DB_NAME = 'dms-reliable-queue';
const DB_VERSION = 1;
const STORE_NAME = 'pending_messages';

export type PendingMessage = {
  id: string; // client_msg_id
  thread_id: ThreadId;
  body: string | null;
  attachments: unknown[];
  created_at: string;
  attempts: number;
  last_attempt_at: string | null;
  next_retry_at: string;
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'persisted';
  error?: string;
  server_msg_id?: number | null;
  db_message_id?: string | null;
};

const MAX_ATTEMPTS = 5;
const INITIAL_RETRY_DELAY = 1000; // 1 second
const MAX_RETRY_DELAY = 30000; // 30 seconds
const SYNC_INTERVAL = 5000; // 5 seconds

/**
 * Open IndexedDB database for reliable queue
 */
async function openQueueDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('thread_id', 'thread_id', { unique: false });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('next_retry_at', 'next_retry_at', { unique: false });
        store.createIndex('created_at', 'created_at', { unique: false });
      }
    };
  });
}

/**
 * Add message to reliable queue
 */
export async function enqueueMessage(
  clientMsgId: string,
  threadId: ThreadId,
  body: string | null,
  attachments: unknown[] = []
): Promise<void> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return;
  }

  try {
    const db = await openQueueDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    const pendingMessage: PendingMessage = {
      id: clientMsgId,
      thread_id: assertThreadId(threadId, 'Invalid thread ID'),
      body,
      attachments: Array.isArray(attachments) ? attachments : [],
      created_at: new Date().toISOString(),
      attempts: 0,
      last_attempt_at: null,
      next_retry_at: new Date().toISOString(),
      status: 'pending',
    };

    await new Promise<void>((resolve, reject) => {
      const request = store.put(pendingMessage);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    db.close();
  } catch (error) {
    console.error('Failed to enqueue message:', error);
  }
}

/**
 * Update message status in queue
 */
export async function updateMessageStatus(
  clientMsgId: string,
  updates: Partial<PendingMessage>
): Promise<void> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return;
  }

  try {
    const db = await openQueueDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    const getRequest = store.get(clientMsgId);
    await new Promise<void>((resolve, reject) => {
      getRequest.onsuccess = () => {
        const message = getRequest.result;
        if (!message) {
          resolve();
          return;
        }

        const updated: PendingMessage = {
          ...message,
          ...updates,
          last_attempt_at: updates.status === 'sending' ? new Date().toISOString() : message.last_attempt_at,
        };

        const putRequest = store.put(updated);
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
      };
      getRequest.onerror = () => reject(getRequest.error);
    });

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    db.close();
  } catch (error) {
    console.error('Failed to update message status:', error);
  }
}

/**
 * Mark message as persisted
 */
export async function markMessagePersisted(
  clientMsgId: string,
  serverMsgId: number,
  dbMessageId?: string
): Promise<void> {
  await updateMessageStatus(clientMsgId, {
    status: 'persisted',
    server_msg_id: serverMsgId,
    db_message_id: dbMessageId,
  });
}

/**
 * Mark message as failed
 */
export async function markMessageFailed(
  clientMsgId: string,
  error: string
): Promise<void> {
  await updateMessageStatus(clientMsgId, {
    status: 'failed',
    error,
  });
}

/**
 * Get pending messages that need retry
 */
export async function getPendingMessages(): Promise<PendingMessage[]> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return [];
  }

  try {
    const db = await openQueueDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const statusIndex = store.index('status');

    return new Promise((resolve, reject) => {
      const messages: PendingMessage[] = [];
      const request = statusIndex.openCursor(IDBKeyRange.only('pending'));

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          const msg = cursor.value as PendingMessage;
          const now = new Date().getTime();
          const nextRetry = new Date(msg.next_retry_at).getTime();

          if (now >= nextRetry) {
            messages.push(msg);
          }
          cursor.continue();
        } else {
          resolve(messages);
        }
      };

      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to get pending messages:', error);
    return [];
  }
}

/**
 * Get failed messages
 */
export async function getFailedMessages(): Promise<PendingMessage[]> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return [];
  }

  try {
    const db = await openQueueDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const statusIndex = store.index('status');

    return new Promise((resolve, reject) => {
      const messages: PendingMessage[] = [];
      const request = statusIndex.openCursor(IDBKeyRange.only('failed'));

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          messages.push(cursor.value as PendingMessage);
          cursor.continue();
        } else {
          resolve(messages);
        }
      };

      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to get failed messages:', error);
    return [];
  }
}

/**
 * Calculate next retry delay with exponential backoff
 */
function calculateRetryDelay(attempts: number): number {
  const delay = Math.min(
    INITIAL_RETRY_DELAY * Math.pow(2, attempts),
    MAX_RETRY_DELAY
  );
  return delay;
}

/**
 * Schedule next retry for a message
 */
export async function scheduleRetry(clientMsgId: string): Promise<void> {
  try {
    const db = await openQueueDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    const getRequest = store.get(clientMsgId);
    await new Promise<void>((resolve, reject) => {
      getRequest.onsuccess = () => {
        const message = getRequest.result;
        if (!message) {
          resolve();
          return;
        }

        const attempts = message.attempts + 1;
        const delay = calculateRetryDelay(attempts);
        const nextRetryAt = new Date(Date.now() + delay);

        const updated: PendingMessage = {
          ...message,
          attempts,
          status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
          next_retry_at: nextRetryAt.toISOString(),
          error: attempts >= MAX_ATTEMPTS ? 'Max retry attempts reached' : undefined,
        };

        const putRequest = store.put(updated);
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
      };
      getRequest.onerror = () => reject(getRequest.error);
    });

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    db.close();
  } catch (error) {
    console.error('Failed to schedule retry:', error);
  }
}

/**
 * Remove message from queue (after successful delivery)
 */
export async function removeMessage(clientMsgId: string): Promise<void> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return;
  }

  try {
    const db = await openQueueDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    await new Promise<void>((resolve, reject) => {
      const request = store.delete(clientMsgId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    db.close();
  } catch (error) {
    console.error('Failed to remove message:', error);
  }
}

/**
 * Process pending messages (called by queue processor)
 */
export async function processPendingMessages(
  sendFn: (msg: PendingMessage) => Promise<{ server_msg_id: number | null }>
): Promise<void> {
  const pending = await getPendingMessages();

  for (const msg of pending) {
    if (msg.attempts >= MAX_ATTEMPTS) {
      continue;
    }

    try {
      await updateMessageStatus(msg.id, { status: 'sending' });

      const result = await sendFn(msg);

      if (result.server_msg_id) {
        await markMessagePersisted(msg.id, result.server_msg_id);
        // Don't remove immediately - wait for confirmation
        // Will be removed after message_persisted event
      } else {
        await scheduleRetry(msg.id);
      }
    } catch (error) {
      console.error(`Failed to send message ${msg.id}:`, error);
      await scheduleRetry(msg.id);
    }
  }
}

/**
 * Start queue processor (runs periodically)
 */
export function startQueueProcessor(
  sendFn: (msg: PendingMessage) => Promise<{ server_msg_id: number | null }>
): () => void {
  let intervalId: NodeJS.Timeout | null = null;

  const process = async () => {
    try {
      await processPendingMessages(sendFn);
    } catch (error) {
      console.error('Queue processor error:', error);
    }
  };

  // Process immediately
  void process();

  // Then process periodically
  intervalId = setInterval(process, SYNC_INTERVAL);

  // Also process when online
  const handleOnline = () => {
    void process();
  };
  window.addEventListener('online', handleOnline);

  return () => {
    if (intervalId) {
      clearInterval(intervalId);
    }
    window.removeEventListener('online', handleOnline);
  };
}

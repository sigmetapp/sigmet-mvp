/**
 * Outbox manager using IndexedDB for offline message queuing
 * Uses idb-keyval for simple key-value storage
 */

import { get, set, del, keys, clear } from 'idb-keyval';
import type { OutboxItem } from './types';

const OUTBOX_PREFIX = 'chat:outbox:';

/**
 * Get outbox key for a conversation
 */
function getOutboxKey(threadId: string): string {
  return `${OUTBOX_PREFIX}${threadId}`;
}

/**
 * Get all outbox items for a conversation
 */
export async function getOutboxItems(threadId: string): Promise<OutboxItem[]> {
  const key = getOutboxKey(threadId);
  const items = await get<OutboxItem[]>(key);
  return items || [];
}

/**
 * Add an item to the outbox
 */
export async function addOutboxItem(threadId: string, item: OutboxItem): Promise<void> {
  const key = getOutboxKey(threadId);
  const items = await getOutboxItems(threadId);
  items.push(item);
  await set(key, items);
}

/**
 * Remove an item from the outbox by clientGeneratedId
 */
export async function removeOutboxItem(threadId: string, clientGeneratedId: string): Promise<void> {
  const key = getOutboxKey(threadId);
  const items = await getOutboxItems(threadId);
  const filtered = items.filter(item => item.clientGeneratedId !== clientGeneratedId);
  if (filtered.length === items.length) {
    return; // Item not found
  }
  await set(key, filtered);
}

/**
 * Update an outbox item (e.g., increment attempts, update nextRetryAt)
 */
export async function updateOutboxItem(
  threadId: string,
  clientGeneratedId: string,
  updates: Partial<OutboxItem>
): Promise<void> {
  const key = getOutboxKey(threadId);
  const items = await getOutboxItems(threadId);
  const index = items.findIndex(item => item.clientGeneratedId === clientGeneratedId);
  if (index === -1) {
    return; // Item not found
  }
  items[index] = { ...items[index], ...updates };
  await set(key, items);
}

/**
 * Get all outbox items ready for retry (nextRetryAt <= now)
 */
export async function getReadyOutboxItems(threadId: string): Promise<OutboxItem[]> {
  const items = await getOutboxItems(threadId);
  const now = Date.now();
  return items.filter(item => item.nextRetryAt <= now);
}

/**
 * Clear all outbox items for a conversation
 */
export async function clearOutbox(threadId: string): Promise<void> {
  const key = getOutboxKey(threadId);
  await del(key);
}

/**
 * Get all conversation IDs that have outbox items
 */
export async function getAllOutboxThreadIds(): Promise<string[]> {
  const allKeys = await keys();
  const threadIds = new Set<string>();
  
  for (const key of allKeys) {
    if (typeof key === 'string' && key.startsWith(OUTBOX_PREFIX)) {
      const threadId = key.slice(OUTBOX_PREFIX.length);
      threadIds.add(threadId);
    }
  }
  
  return Array.from(threadIds);
}

/**
 * Calculate next retry time with exponential backoff and jitter
 * base: 500ms, cap: 10s
 */
export function calculateNextRetry(attempts: number): number {
  const base = 500; // 500ms
  const cap = 10000; // 10s
  const jitter = Math.random() * 0.3; // 0-30% jitter
  
  const delay = Math.min(base * Math.pow(2, attempts) * (1 + jitter), cap);
  return Date.now() + delay;
}

/**
 * Tuple cursor utilities for stable ordering
 * Uses (created_at, id) as a stable ordering key
 */

import type { MessageCursor } from './types';

/**
 * Compare two cursors: returns -1 if a < b, 0 if equal, 1 if a > b
 */
export function compareTuples(a: MessageCursor, b: MessageCursor): number {
  const timeA = new Date(a.createdAt).getTime();
  const timeB = new Date(b.createdAt).getTime();
  
  if (timeA !== timeB) {
    return timeA - timeB;
  }
  
  // Tie-breaker: compare IDs as strings (they should be numeric but we compare as strings for safety)
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

/**
 * Get the cursor for the next message after the given cursor
 * This is used for pagination queries
 */
export function nextAfterTuple(cursor: MessageCursor): MessageCursor {
  // Return the same cursor - the query will use > comparison
  return cursor;
}

/**
 * Check if a cursor is valid (has both createdAt and id)
 */
export function isValidCursor(cursor: MessageCursor | null | undefined): cursor is MessageCursor {
  return cursor !== null && cursor !== undefined && 
         typeof cursor.createdAt === 'string' && 
         typeof cursor.id === 'string' &&
         cursor.createdAt.length > 0 &&
         cursor.id.length > 0;
}

/**
 * Create a cursor from a message
 */
export function messageToCursor(message: { created_at: string; id: string | number }): MessageCursor {
  return {
    createdAt: message.created_at,
    id: String(message.id),
  };
}

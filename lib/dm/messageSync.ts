/**
 * Message Synchronization System
 * 
 * Features:
 * - Periodic sync to catch missed messages
 * - Gap detection and filling
 * - Sequence number tracking
 * - Last message ID tracking
 */

import { assertThreadId, type ThreadId } from './threadId';
import type { Message } from '@/lib/dms';
import { supabase } from '@/lib/supabaseClient';

const SYNC_INTERVAL = 10000; // 10 seconds
const MAX_GAP_SIZE = 100; // Maximum gap to fill in one sync

export type SyncState = {
  thread_id: ThreadId;
  last_message_id: number | null;
  last_sequence_number: number | null;
  last_sync_at: string;
};

const syncStates = new Map<ThreadId, SyncState>();

/**
 * Get sync state for a thread
 */
export function getSyncState(threadId: ThreadId): SyncState | null {
  const normalizedThreadId = assertThreadId(threadId, 'Invalid thread ID');
  return syncStates.get(normalizedThreadId) || null;
}

/**
 * Update sync state for a thread
 */
export function updateSyncState(
  threadId: ThreadId,
  updates: Partial<SyncState>
): void {
  const normalizedThreadId = assertThreadId(threadId, 'Invalid thread ID');
  const current = syncStates.get(normalizedThreadId) || {
    thread_id: normalizedThreadId,
    last_message_id: null,
    last_sequence_number: null,
    last_sync_at: new Date().toISOString(),
  };

  syncStates.set(normalizedThreadId, {
    ...current,
    ...updates,
    last_sync_at: new Date().toISOString(),
  });
}

/**
 * Sync messages for a thread
 * Returns messages that were missed
 */
export async function syncThreadMessages(
  threadId: ThreadId,
  lastMessageId: number | null = null
): Promise<Message[]> {
  const normalizedThreadId = assertThreadId(threadId, 'Invalid thread ID');
  const state = getSyncState(normalizedThreadId);
  const fromId = lastMessageId ?? state?.last_message_id ?? null;

  try {
    // Query for messages after the last known message
    let query = supabase
      .from('dms_messages')
      .select('*')
      .eq('thread_id', normalizedThreadId)
      .order('id', { ascending: true })
      .limit(MAX_GAP_SIZE);

    if (fromId !== null) {
      query = query.gt('id', fromId);
    }

    const { data: messages, error } = await query;

    if (error) {
      console.error('Error syncing messages:', error);
      return [];
    }

    if (!messages || messages.length === 0) {
      return [];
    }

    // Update sync state
    const lastMsg = messages[messages.length - 1];
    const lastMsgId = typeof lastMsg.id === 'string' ? parseInt(lastMsg.id, 10) : Number(lastMsg.id);
    const lastSeqNum = lastMsg.sequence_number
      ? (typeof lastMsg.sequence_number === 'string'
          ? parseInt(lastMsg.sequence_number, 10)
          : Number(lastMsg.sequence_number))
      : null;

    updateSyncState(normalizedThreadId, {
      last_message_id: lastMsgId,
      last_sequence_number: lastSeqNum,
    });

    // Convert to Message format
    const formattedMessages: Message[] = messages.map((msg: any) => ({
      id: typeof msg.id === 'string' ? parseInt(msg.id, 10) : Number(msg.id),
      thread_id: normalizedThreadId,
      sender_id: msg.sender_id,
      kind: msg.kind || 'text',
      body: msg.body,
      attachments: Array.isArray(msg.attachments) ? msg.attachments : [],
      created_at: msg.created_at,
      edited_at: msg.edited_at || null,
      deleted_at: msg.deleted_at || null,
      sequence_number:
        msg.sequence_number === null || msg.sequence_number === undefined
          ? null
          : typeof msg.sequence_number === 'string'
            ? parseInt(msg.sequence_number, 10)
            : Number(msg.sequence_number),
      client_msg_id: msg.client_msg_id ?? null,
      reply_to_message_id: msg.reply_to_message_id
        ? typeof msg.reply_to_message_id === 'string'
          ? parseInt(msg.reply_to_message_id, 10)
          : Number(msg.reply_to_message_id)
        : null,
    }));

    return formattedMessages;
  } catch (error) {
    console.error('Error in syncThreadMessages:', error);
    return [];
  }
}

/**
 * Detect gaps in message sequence
 */
export async function detectGaps(
  threadId: ThreadId,
  knownMessageIds: number[]
): Promise<Array<{ start: number; end: number }>> {
  const normalizedThreadId = assertThreadId(threadId, 'Invalid thread ID');

  if (knownMessageIds.length === 0) {
    return [];
  }

  try {
    const minId = Math.min(...knownMessageIds);
    const maxId = Math.max(...knownMessageIds);

    // Get all message IDs in the range
    const { data: allMessages, error } = await supabase
      .from('dms_messages')
      .select('id')
      .eq('thread_id', normalizedThreadId)
      .gte('id', minId)
      .lte('id', maxId)
      .order('id', { ascending: true });

    if (error || !allMessages) {
      return [];
    }

    const allIds = new Set(
      allMessages.map((msg: any) =>
        typeof msg.id === 'string' ? parseInt(msg.id, 10) : Number(msg.id)
      )
    );
    const knownIds = new Set(knownMessageIds);

    // Find gaps
    const gaps: Array<{ start: number; end: number }> = [];
    let gapStart: number | null = null;

    for (let id = minId; id <= maxId; id++) {
      const exists = allIds.has(id);
      const known = knownIds.has(id);

      if (exists && !known) {
        // Missing message
        if (gapStart === null) {
          gapStart = id;
        }
      } else {
        // Gap ended
        if (gapStart !== null) {
          gaps.push({ start: gapStart, end: id - 1 });
          gapStart = null;
        }
      }
    }

    // Handle gap at the end
    if (gapStart !== null) {
      gaps.push({ start: gapStart, end: maxId });
    }

    return gaps;
  } catch (error) {
    console.error('Error detecting gaps:', error);
    return [];
  }
}

/**
 * Fill gaps in message sequence
 */
export async function fillGaps(
  threadId: ThreadId,
  gaps: Array<{ start: number; end: number }>
): Promise<Message[]> {
  const normalizedThreadId = assertThreadId(threadId, 'Invalid thread ID');
  const allMessages: Message[] = [];

  for (const gap of gaps) {
    try {
      const { data: messages, error } = await supabase
        .from('dms_messages')
        .select('*')
        .eq('thread_id', normalizedThreadId)
        .gte('id', gap.start)
        .lte('id', gap.end)
        .order('id', { ascending: true });

      if (error || !messages) {
        continue;
      }

      const formatted: Message[] = messages.map((msg: any) => ({
        id: typeof msg.id === 'string' ? parseInt(msg.id, 10) : Number(msg.id),
        thread_id: normalizedThreadId,
        sender_id: msg.sender_id,
        kind: msg.kind || 'text',
        body: msg.body,
        attachments: Array.isArray(msg.attachments) ? msg.attachments : [],
        created_at: msg.created_at,
        edited_at: msg.edited_at || null,
        deleted_at: msg.deleted_at || null,
        sequence_number:
          msg.sequence_number === null || msg.sequence_number === undefined
            ? null
            : typeof msg.sequence_number === 'string'
              ? parseInt(msg.sequence_number, 10)
              : Number(msg.sequence_number),
        client_msg_id: msg.client_msg_id ?? null,
        reply_to_message_id: msg.reply_to_message_id
          ? typeof msg.reply_to_message_id === 'string'
            ? parseInt(msg.reply_to_message_id, 10)
            : Number(msg.reply_to_message_id)
          : null,
      }));

      allMessages.push(...formatted);
    } catch (error) {
      console.error(`Error filling gap ${gap.start}-${gap.end}:`, error);
    }
  }

  return allMessages;
}

/**
 * Start periodic sync for a thread
 * Optionally accepts a function to get the latest message ID dynamically
 */
export function startPeriodicSync(
  threadId: ThreadId,
  onMessages: (messages: Message[]) => void,
  getLastMessageId?: () => number | null
): () => void {
  const normalizedThreadId = assertThreadId(threadId, 'Invalid thread ID');

  const sync = async () => {
    try {
      // Use dynamic getter if provided, otherwise fall back to sync state
      const lastMessageId = getLastMessageId 
        ? getLastMessageId() 
        : (getSyncState(normalizedThreadId)?.last_message_id ?? null);
      
      const messages = await syncThreadMessages(normalizedThreadId, lastMessageId);

      if (messages.length > 0) {
        onMessages(messages);
      }
    } catch (error) {
      console.error('Periodic sync error:', error);
    }
  };

  // Sync immediately
  void sync();

  // Then sync periodically
  const intervalId = setInterval(sync, SYNC_INTERVAL);

  return () => {
    clearInterval(intervalId);
  };
}

/**
 * Clear sync state for a thread
 */
export function clearSyncState(threadId: ThreadId): void {
  const normalizedThreadId = assertThreadId(threadId, 'Invalid thread ID');
  syncStates.delete(normalizedThreadId);
}

import { supabase } from '@/lib/supabaseClient';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

// Maintains a single active channel per thread on the client side
let activeThreadId: number | null = null;
let activeChannel: RealtimeChannel | null = null;

export type MessageChange = {
  type: 'message.insert' | 'message.update';
  payload: RealtimePostgresChangesPayload<any>;
};

export type ReceiptUpdate = {
  type: 'receipt.update';
  payload: RealtimePostgresChangesPayload<any>;
};

export type TypingEvent = {
  userId?: string;
  threadId?: number;
  typing: boolean;
  ts?: string;
};

function ensureChannel(threadId: number): RealtimeChannel {
  if (activeChannel && activeThreadId === threadId) return activeChannel;

  // Clean up previous channel if switching threads
  if (activeChannel) {
    try { void supabase.removeChannel(activeChannel); } catch {}
  }

  activeThreadId = threadId;
  activeChannel = supabase.channel(`dms_thread:${threadId}`);
  return activeChannel;
}

/** Open (or switch to) the realtime channel for a thread. */
export function openThreadChannel(threadId: number): RealtimeChannel {
  return ensureChannel(threadId);
}

/**
 * Subscribe to thread events:
 * - message.insert (INSERT on public.dms_messages filtered by thread)
 * - message.update (UPDATE on public.dms_messages filtered by thread)
 * - receipt.update (UPDATE on public.dms_message_receipts, best-effort filter)
 * - typing (broadcast event on the same channel)
 */
export async function subscribe(
  onMessage?: (change: MessageChange) => void,
  onReceipt?: (change: ReceiptUpdate) => void,
  onTyping?: (evt: TypingEvent) => void
): Promise<void> {
  if (!activeChannel || activeThreadId == null) {
    throw new Error('Thread channel is not open. Call openThreadChannel(threadId) first.');
  }

  // Postgres changes for messages in this thread
  activeChannel = activeChannel
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'dms_messages',
      filter: `thread_id=eq.${activeThreadId}`,
    }, (payload) => {
      onMessage?.({ type: 'message.insert', payload });
    })
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'dms_messages',
      filter: `thread_id=eq.${activeThreadId}`,
    }, (payload) => {
      onMessage?.({ type: 'message.update', payload });
    })
    // Best-effort: receipts do not contain thread_id; listen to read transitions
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'dms_message_receipts',
      filter: 'status=eq.read',
    }, (payload) => {
      onReceipt?.({ type: 'receipt.update', payload });
    })
    // Broadcast typing indicators
    .on('broadcast', { event: 'typing' }, (payload: any) => {
      const evt: TypingEvent = {
        userId: payload?.payload?.userId,
        threadId: payload?.payload?.threadId,
        typing: Boolean(payload?.payload?.typing),
        ts: payload?.payload?.ts,
      };
      onTyping?.(evt);
    });

  await activeChannel.subscribe();
}

/** Send a typing indicator via broadcast on the current thread channel. */
export async function sendTyping(isTyping: boolean, opts?: { userId?: string }): Promise<void> {
  if (!activeChannel || activeThreadId == null) return;
  const payload: TypingEvent = {
    userId: opts?.userId,
    threadId: activeThreadId,
    typing: isTyping,
    ts: new Date().toISOString(),
  };
  await activeChannel.send({ type: 'broadcast', event: 'typing', payload });
}

/** Unsubscribe from and remove the current thread channel. */
export async function unsubscribe(): Promise<void> {
  if (!activeChannel) return;
  try {
    await activeChannel.unsubscribe();
  } finally {
    try { void supabase.removeChannel(activeChannel); } catch {}
    activeChannel = null;
    activeThreadId = null;
  }
}

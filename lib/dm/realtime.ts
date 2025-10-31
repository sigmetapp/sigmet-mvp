import { supabase } from '@/lib/supabaseClient';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

// Channel management for threads
let activeChannels = new Map<number, RealtimeChannel>();

export type MessageChange = {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  payload: RealtimePostgresChangesPayload<any>;
};

export type TypingEvent = {
  userId: string;
  typing: boolean;
};

/**
 * Get or create a channel for a thread
 */
export function getThreadChannel(threadId: number): RealtimeChannel {
  let channel = activeChannels.get(threadId);
  
  if (!channel) {
    channel = supabase
      .channel(`thread:${threadId}`, {
        config: {
          broadcast: { self: true },
        },
      });
    activeChannels.set(threadId, channel);
  }
  
  return channel;
}

/**
 * Subscribe to thread changes (messages, receipts, typing)
 */
export async function subscribeToThread(
  threadId: number,
  callbacks: {
    onMessage?: (change: MessageChange) => void;
    onTyping?: (event: TypingEvent) => void;
  }
): Promise<() => void> {
  const channel = getThreadChannel(threadId);
  
  // Subscribe to message changes
  if (callbacks.onMessage) {
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'dms_messages',
        filter: `thread_id=eq.${threadId}`,
      },
      (payload) => {
        callbacks.onMessage?.({
          type: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
          payload,
        });
      }
    );
  }
  
  // Subscribe to typing indicators via broadcast
  if (callbacks.onTyping) {
    channel.on('broadcast', { event: 'typing' }, (payload) => {
      const { userId, typing } = payload.payload || {};
      if (userId) {
        callbacks.onTyping?.({ userId, typing });
      }
    });
  }
  
  await channel.subscribe();
  
  // Return unsubscribe function
  return async () => {
    await channel.unsubscribe();
    activeChannels.delete(threadId);
  };
}

/**
 * Send typing indicator
 */
export async function sendTypingIndicator(
  threadId: number,
  userId: string,
  typing: boolean
): Promise<void> {
  const channel = getThreadChannel(threadId);
  await channel.send({
    type: 'broadcast',
    event: 'typing',
    payload: { userId, typing },
  });
}

/**
 * Clean up all channels
 */
export async function cleanupChannels(): Promise<void> {
  for (const [threadId, channel] of activeChannels) {
    await channel.unsubscribe();
  }
  activeChannels.clear();
}

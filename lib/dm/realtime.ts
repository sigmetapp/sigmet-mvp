import { supabase } from '@/lib/supabaseClient';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { assertThreadId, type ThreadId } from '@/lib/dm/threadId';

// Channel management for threads
let activeChannels = new Map<ThreadId, RealtimeChannel>();

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
export function getThreadChannel(threadId: ThreadId): RealtimeChannel {
  const normalizedThreadId = assertThreadId(threadId, 'Invalid thread ID for realtime channel');
  let channel = activeChannels.get(normalizedThreadId);
  
  if (!channel) {
    channel = supabase
      .channel(`thread:${normalizedThreadId}`, {
        config: {
          broadcast: { self: true },
        },
      });
    activeChannels.set(normalizedThreadId, channel);
  }
  
  return channel;
}

/**
 * Subscribe to thread changes (messages, receipts, typing)
 */
export async function subscribeToThread(
  threadId: ThreadId,
  callbacks: {
    onMessage?: (change: MessageChange) => void;
    onTyping?: (event: TypingEvent) => void;
  }
): Promise<() => void> {
  const normalizedThreadId = assertThreadId(threadId, 'Invalid thread ID for subscription');
  const channel = getThreadChannel(normalizedThreadId);

  // Subscribe to message changes
  if (callbacks.onMessage) {
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'dms_messages',
        filter: `thread_id=eq.${normalizedThreadId}`,
      },
      (payload) => {
        callbacks.onMessage?.({
          type: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
          payload,
        });
      }
    );

    channel.on('broadcast', { event: 'message' }, (payload) => {
      try {
        const data = payload.payload as { type?: string; message?: any } | undefined;
        if (!data || data.type !== 'message' || !data.message) {
          return;
        }

        const message = data.message;
        if (message.thread_id && message.thread_id !== normalizedThreadId) {
          return;
        }

        const syntheticPayload: RealtimePostgresChangesPayload<any> = {
          eventType: 'INSERT',
          schema: 'public',
          table: 'dms_messages',
          commit_timestamp: new Date().toISOString(),
          new: message,
          old: null,
          errors: [],
        };

        callbacks.onMessage?.({
          type: 'INSERT',
          payload: syntheticPayload,
        });
      } catch (error) {
        console.error('Error handling broadcast DM message:', error);
      }
    });
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
  
  try {
    const status = await channel.subscribe();
    if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR') {
      console.log(`Subscribed to thread ${normalizedThreadId}, status:`, status);
    }
  } catch (error) {
    console.error('Error subscribing to thread:', error);
    throw error;
  }
  
  // Return unsubscribe function
  return async () => {
    try {
      await channel.unsubscribe();
      activeChannels.delete(normalizedThreadId);
    } catch (error) {
      console.error('Error unsubscribing from thread:', error);
    }
  };
}

/**
 * Send typing indicator
 */
export async function sendTypingIndicator(
  threadId: ThreadId,
  userId: string,
  typing: boolean
): Promise<void> {
  try {
    const normalizedThreadId = assertThreadId(threadId, 'Invalid thread ID for typing indicator');
    const channel = getThreadChannel(normalizedThreadId);
    
    // Ensure channel is subscribed
    const state = (channel as any).state;
    if (state !== 'joined' && state !== 'joining') {
      await channel.subscribe();
    }
    
    await channel.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId, typing },
    });
  } catch (error) {
    console.error('Error sending typing indicator:', error);
    // Don't throw - typing indicator failures are not critical
  }
}

/**
 * Clean up all channels
 */
export async function cleanupChannels(): Promise<void> {
  for (const [threadId, channel] of activeChannels) {
    try {
      await channel.unsubscribe();
    } catch (error) {
      console.error(`Error unsubscribing from thread ${threadId}:`, error);
    }
  }
  activeChannels.clear();
}

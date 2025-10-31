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
  
  try {
    const status = await channel.subscribe();
    if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR') {
      console.log(`Subscribed to thread ${threadId}, status:`, status);
    }
  } catch (error) {
    console.error('Error subscribing to thread:', error);
    throw error;
  }
  
  // Return unsubscribe function
  return async () => {
    try {
      await channel.unsubscribe();
      activeChannels.delete(threadId);
    } catch (error) {
      console.error('Error unsubscribing from thread:', error);
    }
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
  try {
    const channel = getThreadChannel(threadId);
    
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

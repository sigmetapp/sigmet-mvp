import { supabase } from '@/lib/supabaseClient';
import type { RealtimeChannel } from '@supabase/supabase-js';

// Presence channels by user ID
const presenceChannels = new Map<string, RealtimeChannel>();

/**
 * Get or create presence channel for a user
 */
function getPresenceChannel(userId: string): RealtimeChannel {
  let channel = presenceChannels.get(userId);
  
  if (!channel) {
    channel = supabase.channel(`presence:${userId}`, {
      config: {
        presence: {
          key: userId,
        },
      },
    });
    presenceChannels.set(userId, channel);
  }
  
  return channel;
}

/**
 * Set user online/offline status
 */
export async function setPresenceStatus(userId: string, online: boolean): Promise<void> {
  const channel = getPresenceChannel(userId);
  
  // Ensure subscribed
  const state = (channel as any).state;
  if (state !== 'joined' && state !== 'joining') {
    await channel.subscribe();
  }
  
  if (online) {
    await channel.track({
      online: true,
      last_seen: new Date().toISOString(),
    });
  } else {
    await channel.untrack();
  }
}

/**
 * Subscribe to presence changes for multiple users
 */
export async function subscribeToPresence(
  userIds: string[],
  onPresenceChange: (userId: string, online: boolean) => void
): Promise<() => void> {
  const channels: RealtimeChannel[] = [];
  const cleanupMap = new Map<string, () => void>();
  
  for (const userId of userIds) {
    const channel = getPresenceChannel(userId);
    
    // Subscribe to presence sync
    const syncHandler = () => {
      const state = channel.presenceState();
      const presence = state[userId]?.[0];
      onPresenceChange(userId, !!presence);
    };
    
    // Subscribe to presence join/leave
    const joinHandler = ({ key }: { key: string }) => {
      if (key === userId) {
        onPresenceChange(userId, true);
      }
    };
    
    const leaveHandler = ({ key }: { key: string }) => {
      if (key === userId) {
        onPresenceChange(userId, false);
      }
    };
    
    channel.on('presence', { event: 'sync' }, syncHandler);
    channel.on('presence', { event: 'join' }, joinHandler);
    channel.on('presence', { event: 'leave' }, leaveHandler);
    
    await channel.subscribe();
    channels.push(channel);
    
    // Store cleanup function
    cleanupMap.set(userId, () => {
      channel.off('presence', { event: 'sync' }, syncHandler);
      channel.off('presence', { event: 'join' }, joinHandler);
      channel.off('presence', { event: 'leave' }, leaveHandler);
    });
  }
  
  // Return unsubscribe function
  return async () => {
    for (const channel of channels) {
      await channel.unsubscribe();
    }
    for (const cleanup of cleanupMap.values()) {
      cleanup();
    }
  };
}

/**
 * Get current presence state for a user
 */
export function getPresenceState(userId: string): boolean {
  const channel = presenceChannels.get(userId);
  if (!channel) return false;
  
  const state = channel.presenceState();
  return !!state[userId]?.[0];
}

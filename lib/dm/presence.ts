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
  try {
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
  } catch (error) {
    console.error('Error setting presence status:', error);
    // Don't throw - presence failures are not critical
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
    try {
      const channel = getPresenceChannel(userId);
      
      // Subscribe to presence sync
      const syncHandler = () => {
        try {
          const state = channel.presenceState();
          const presence = state[userId]?.[0];
          onPresenceChange(userId, !!presence);
        } catch (error) {
          console.error(`Error in presence sync handler for ${userId}:`, error);
        }
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
        try {
          channel.off('presence', { event: 'sync' }, syncHandler);
          channel.off('presence', { event: 'join' }, joinHandler);
          channel.off('presence', { event: 'leave' }, leaveHandler);
        } catch (error) {
          console.error(`Error cleaning up presence handlers for ${userId}:`, error);
        }
      });
    } catch (error) {
      console.error(`Error setting up presence for ${userId}:`, error);
    }
  }
  
  // Return unsubscribe function
  return async () => {
    for (const channel of channels) {
      try {
        await channel.unsubscribe();
      } catch (error) {
        console.error('Error unsubscribing from presence channel:', error);
      }
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
  try {
    const channel = presenceChannels.get(userId);
    if (!channel) return false;
    
    const state = channel.presenceState();
    return !!state[userId]?.[0];
  } catch (error) {
    console.error(`Error getting presence state for ${userId}:`, error);
    return false;
  }
}

/**
 * Get presence map for a user (for initial check)
 */
export async function getPresenceMap(userId: string): Promise<Record<string, any[]>> {
  try {
    const channel = getPresenceChannel(userId);
    
    // Ensure subscribed
    const state = (channel as any).state;
    if (state !== 'joined' && state !== 'joining') {
      await channel.subscribe();
      // Wait a bit for sync to complete
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    return channel.presenceState();
  } catch (error) {
    console.error(`Error getting presence map for ${userId}:`, error);
    return {};
  }
}

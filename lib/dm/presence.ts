import { supabase } from '@/lib/supabaseClient';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface PresenceEntry {
  channel: RealtimeChannel;
  listeners: Map<string, (online: boolean) => void>;
  subscribed: boolean;
  subscribePromise: Promise<void> | null;
  refCount: number;
  online: boolean;
}

const presenceEntries = new Map<string, PresenceEntry>();
let listenerIdCounter = 0;

function nextListenerId(): string {
  listenerIdCounter += 1;
  return `presence-listener-${listenerIdCounter}`;
}

function getOrCreateEntry(userId: string): PresenceEntry {
  let entry = presenceEntries.get(userId);

  if (!entry) {
    const channel = supabase.channel(`presence:${userId}`, {
      config: {
        presence: {
          key: userId,
        },
      },
    });

    entry = {
      channel,
      listeners: new Map(),
      subscribed: false,
      subscribePromise: null,
      refCount: 0,
      online: false,
    };

    channel.on('presence', { event: 'sync' }, () => {
      updatePresenceStateFromChannel(userId);
    });

    channel.on('presence', { event: 'join' }, ({ key }: { key: string }) => {
      if (key === userId) {
        setEntryOnline(userId, true);
      }
    });

    channel.on('presence', { event: 'leave' }, ({ key }: { key: string }) => {
      if (key === userId) {
        updatePresenceStateFromChannel(userId);
      }
    });

    presenceEntries.set(userId, entry);
  }

  return entry;
}

function setEntryOnline(userId: string, online: boolean): void {
  const entry = presenceEntries.get(userId);
  if (!entry || entry.online === online) {
    return;
  }

  entry.online = online;

  for (const listener of entry.listeners.values()) {
    try {
      listener(online);
    } catch (error) {
      console.error(`Error notifying presence listener for ${userId}:`, error);
    }
  }
}

function updatePresenceStateFromChannel(userId: string): void {
  const entry = presenceEntries.get(userId);
  if (!entry) {
    return;
  }

  try {
    const state = entry.channel.presenceState();
    const online = Array.isArray(state[userId]) && state[userId].length > 0;
    setEntryOnline(userId, online);
  } catch (error) {
    console.error(`Error reading presence state for ${userId}:`, error);
  }
}

async function ensureSubscribed(entry: PresenceEntry, userId: string): Promise<void> {
  if (entry.subscribed) {
    return;
  }

  if (entry.subscribePromise) {
    await entry.subscribePromise;
    return;
  }

    entry.subscribePromise = new Promise<void>((resolve) => {
      let settled = false;

      entry.channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          entry.subscribed = true;
          settled = true;
          updatePresenceStateFromChannel(userId);
          resolve();
          return;
        }

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          if (!settled) {
            settled = true;
            console.warn(`[presence] Channel for ${userId} ${status.toLowerCase()}, falling back to polling.`);
            resolve();
          }
          entry.subscribed = false;
          entry.subscribePromise = null;
          setEntryOnline(userId, false);
        } else if (status === 'CLOSED') {
          if (!settled) {
            settled = true;
            resolve();
          }
          entry.subscribed = false;
          entry.subscribePromise = null;
          setEntryOnline(userId, false);
        }
      });
    })
      .finally(() => {
        entry.subscribePromise = null;
      });

  await entry.subscribePromise;
}

/**
 * Set user online/offline status
 */
export async function setPresenceStatus(userId: string, online: boolean): Promise<void> {
  try {
    const entry = getOrCreateEntry(userId);
    await ensureSubscribed(entry, userId);

    if (online) {
      await entry.channel.track({
        online: true,
        last_seen: new Date().toISOString(),
      });
      setEntryOnline(userId, true);
    } else {
      await entry.channel.untrack();
      setEntryOnline(userId, false);
    }
  } catch (error) {
    console.error('Error setting presence status:', error);
    // Presence failures are non-critical
  }
}

/**
 * Subscribe to presence changes for multiple users
 */
export async function subscribeToPresence(
  userIds: string[],
  onPresenceChange: (userId: string, online: boolean) => void
): Promise<() => void> {
  const subscriptions: { userId: string; listenerId: string }[] = [];

  for (const userId of userIds) {
    try {
      const entry = getOrCreateEntry(userId);
      entry.refCount += 1;

      const listenerId = `${userId}:${nextListenerId()}`;
      const handler = (online: boolean) => {
        onPresenceChange(userId, online);
      };

      entry.listeners.set(listenerId, handler);
      subscriptions.push({ userId, listenerId });

      await ensureSubscribed(entry, userId);

      const state = entry.channel.presenceState();
      const online = Array.isArray(state[userId]) && state[userId].length > 0;
      entry.online = online;
      handler(online);
    } catch (error) {
      console.error(`Error setting up presence for ${userId}:`, error);
    }
  }

  return async () => {
    for (const { userId, listenerId } of subscriptions) {
      const entry = presenceEntries.get(userId);
      if (!entry) {
        continue;
      }

      entry.listeners.delete(listenerId);
      entry.refCount = Math.max(0, entry.refCount - 1);

      if (entry.refCount === 0 && entry.listeners.size === 0) {
        try {
          await entry.channel.unsubscribe();
        } catch (error) {
          console.error('Error unsubscribing from presence channel:', error);
        } finally {
          presenceEntries.delete(userId);
        }
      }
    }
  };
}

/**
 * Get current presence state for a user
 */
export function getPresenceState(userId: string): boolean {
  const entry = presenceEntries.get(userId);
  if (!entry) {
    return false;
  }

  try {
    const state = entry.channel.presenceState();
    return Array.isArray(state[userId]) && state[userId].length > 0;
  } catch (error) {
    console.error(`Error getting presence state for ${userId}:`, error);
    return entry.online;
  }
}

/**
 * Get presence map for a user
 */
export async function getPresenceMap(userId: string): Promise<Record<string, any[]>> {
  try {
    const entry = getOrCreateEntry(userId);
    await ensureSubscribed(entry, userId);
    return entry.channel.presenceState();
  } catch (error) {
    console.error(`Error getting presence map for ${userId}:`, error);
    return {};
  }
}

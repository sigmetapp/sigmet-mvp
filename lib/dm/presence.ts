import { supabase } from '@/lib/supabaseClient';
import type { RealtimeChannel } from '@supabase/supabase-js';

const channelsByUserId = new Map<string, RealtimeChannel>();
let cachedPresenceKey: string | null = null;

async function getPresenceKey(): Promise<string> {
  if (cachedPresenceKey) return cachedPresenceKey;
  try {
    const { data } = await supabase.auth.getUser();
    cachedPresenceKey = data.user?.id ?? `anon-${cryptoRandom()}`;
  } catch {
    cachedPresenceKey = `anon-${cryptoRandom()}`;
  }
  return cachedPresenceKey;
}

function cryptoRandom(): string {
  try {
    const bytes = new Uint8Array(8);
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    (globalThis.crypto || (globalThis as any).msCrypto).getRandomValues(bytes);
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return Math.random().toString(16).slice(2);
  }
}

async function getOrCreatePresenceChannel(userId: string): Promise<RealtimeChannel> {
  const existing = channelsByUserId.get(userId);
  if (existing) {
    console.log('[presence.getOrCreatePresenceChannel] Using existing channel for:', userId);
    return existing;
  }

  const key = await getPresenceKey();
  const channelName = `presence:${userId}`;
  console.log('[presence.getOrCreatePresenceChannel] Creating new channel:', channelName, 'with key:', key);
  const channel = supabase.channel(channelName, { config: { presence: { key } } });
  channelsByUserId.set(userId, channel);
  return channel;
}

async function ensureSubscribed(channel: RealtimeChannel): Promise<void> {
  // Subscribe if not already joined
  // RealtimeChannel has a state property but not typed; use as any to read
  const state = (channel as any).state as string | undefined;
  console.log('[presence.ensureSubscribed] Channel state:', state);
  if (state !== 'joined' && state !== 'joining') {
    console.log('[presence.ensureSubscribed] Subscribing to channel');
    const status = await channel.subscribe();
    console.log('[presence.ensureSubscribed] Subscription status:', status);
  } else {
    console.log('[presence.ensureSubscribed] Already subscribed or joining');
  }
}

/** Update the presence payload for a user channel to reflect online/offline. */
export async function setOnline(userId: string, online: boolean): Promise<void> {
  console.log('[presence.setOnline]', { userId, online });
  const channel = await getOrCreatePresenceChannel(userId);
  await ensureSubscribed(channel);
  if (online) {
    const payload = { online: true, typing: false, updated_at: new Date().toISOString() };
    console.log('[presence.setOnline] Tracking with payload:', payload);
    await channel.track(payload);
    console.log('[presence.setOnline] Successfully tracked');
  } else {
    console.log('[presence.setOnline] Untracking');
    try { await channel.untrack(); } catch (error) {
      console.error('[presence.setOnline] Error untracking:', error);
    }
  }
}

/** Update the typing flag in the presence payload for a user channel. */
export async function setTyping(userId: string, typing: boolean): Promise<void> {
  const channel = await getOrCreatePresenceChannel(userId);
  await ensureSubscribed(channel);
  await channel.track({ online: true, typing, updated_at: new Date().toISOString() });
}

/** Return the raw presence map for a user's presence channel. */
export async function getPresenceMap(userId: string): Promise<Record<string, any[]>> {
  console.log('[presence.getPresenceMap]', { userId });
  const channel = await getOrCreatePresenceChannel(userId);
  await ensureSubscribed(channel);
  const state = channel.presenceState();
  console.log('[presence.getPresenceMap] State:', state);
  return state;
}

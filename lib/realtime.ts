import { supabase } from '@/lib/supabaseClient';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useChatStore } from '@/store/chatStore';

type DeliveredPayload = {
  messageId: string;
  toUserId: string;
  deliveredAt: string;
};

type ReadPayload = {
  messageIds: string[];
  toUserId: string;
  readAt: string;
};

const channelCache = new Map<string, RealtimeChannel>();
const listenersAttached = new Set<string>();

function getChannel(dialogId: string): RealtimeChannel {
  const key = String(dialogId);
  const cached = channelCache.get(key);
  if (cached) {
    return cached;
  }
  const channel = supabase.channel(`realtime:dm:${key}`, {
    config: { broadcast: { self: false } },
  });
  channelCache.set(key, channel);
  return channel;
}

async function ensureSubscribed(channel: RealtimeChannel): Promise<void> {
  const state = (channel as { state?: string }).state;
  if (state === 'joined' || state === 'joining') {
    return;
  }
  await channel.subscribe().catch((error) => {
    console.error('[realtime] Failed to subscribe to DM channel', error);
  });
}

export async function subscribeToReceipts(
  dialogId: string,
  currentUserId: string
): Promise<RealtimeChannel> {
  const channel = getChannel(dialogId);
  const key = String(dialogId);

  if (!listenersAttached.has(key)) {
    channel.on('broadcast', { event: 'receipt:delivered' }, ({ payload }) => {
      const data = payload as DeliveredPayload | undefined;
      if (!data || data.toUserId !== currentUserId) {
        return;
      }
      useChatStore.getState().updateMessage(key, String(data.messageId), { status: 'delivered' });
    });

    channel.on('broadcast', { event: 'receipt:read' }, ({ payload }) => {
      const data = payload as ReadPayload | undefined;
      if (!data || data.toUserId !== currentUserId || !Array.isArray(data.messageIds)) {
        return;
      }
      const store = useChatStore.getState();
      for (const messageId of data.messageIds) {
        store.updateMessage(key, String(messageId), { status: 'read' });
      }
    });

    listenersAttached.add(key);
  }

  await ensureSubscribed(channel);
  return channel;
}

export async function sendDeliveredReceipt(
  dialogId: string,
  payload: DeliveredPayload
): Promise<void> {
  const channel = getChannel(dialogId);
  await ensureSubscribed(channel);
  await channel
    .send({
      type: 'broadcast',
      event: 'receipt:delivered',
      payload,
    })
    .catch((error) => {
      console.error('[realtime] Failed to broadcast delivered receipt', error);
    });
}

export async function sendReadReceipt(
  dialogId: string,
  payload: ReadPayload
): Promise<void> {
  const channel = getChannel(dialogId);
  await ensureSubscribed(channel);
  await channel
    .send({
      type: 'broadcast',
      event: 'receipt:read',
      payload,
    })
    .catch((error) => {
      console.error('[realtime] Failed to broadcast read receipt', error);
    });
}

export async function leaveDmChannel(dialogId: string): Promise<void> {
  const key = String(dialogId);
  const channel = channelCache.get(key);
  if (!channel) {
    return;
  }

  try {
    await channel.unsubscribe();
  } catch (error) {
    console.error('[realtime] Failed to unsubscribe from DM channel', error);
  } finally {
    channelCache.delete(key);
    listenersAttached.delete(key);
  }
}


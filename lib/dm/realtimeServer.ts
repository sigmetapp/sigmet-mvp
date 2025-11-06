import { createClient, type RealtimeChannel } from '@supabase/supabase-js';
import { assertThreadId, type ThreadId } from '@/lib/dm/threadId';

type BroadcastPayload = {
  type: 'message';
  message: Record<string, any>;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let supabaseServerClient: ReturnType<typeof createClient> | null = null;

function getServerClient() {
  if (!supabaseServerClient) {
    if (!supabaseUrl) {
      console.warn('[realtimeServer] NEXT_PUBLIC_SUPABASE_URL not configured; realtime broadcast disabled');
      return null;
    }

    const key = serviceRoleKey || anonKey;
    if (!key) {
      console.warn('[realtimeServer] No Supabase key configured; realtime broadcast disabled');
      return null;
    }

    supabaseServerClient = createClient(supabaseUrl, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      realtime: {
        params: {
          // Increased from 5 to 50 to allow faster message delivery
          // This should help reduce delays in real-time message delivery
          eventsPerSecond: 50,
        },
      },
    });
  }

  return supabaseServerClient;
}

async function withChannel<T>(channel: RealtimeChannel, fn: () => Promise<T>): Promise<T> {
  try {
    const status = await channel.subscribe();
    if (status !== 'SUBSCRIBED') {
      throw new Error(`Failed to subscribe to realtime channel (status: ${status})`);
    }

    const result = await fn();
    await channel.unsubscribe();
    return result;
  } catch (error) {
    await channel.unsubscribe().catch(() => undefined);
    throw error;
  } finally {
    const client = getServerClient();
    client?.removeChannel(channel);
  }
}

function sanitizeMessagePayload(message: Record<string, any>): Record<string, any> {
  const plain = JSON.parse(JSON.stringify(message));
  if (typeof plain.thread_id === 'string' || typeof plain.thread_id === 'number') {
    try {
      plain.thread_id = assertThreadId(plain.thread_id, 'Invalid thread id in broadcast payload');
    } catch {
      // Keep original if validation fails; downstream clients will guard
    }
  }

  if (!Array.isArray(plain.attachments)) {
    plain.attachments = [];
  }

  return plain;
}

export async function broadcastDmMessage(threadId: ThreadId, message: Record<string, any>): Promise<void> {
  const normalizedThreadId = assertThreadId(threadId, 'Invalid thread id for broadcast');
  const client = getServerClient();

  if (!client) {
    return;
  }

  const channel = client.channel(`thread:${normalizedThreadId}`, {
    config: {
      broadcast: {
        self: true,
      },
    },
  });

  const payload: BroadcastPayload = {
    type: 'message',
    message: sanitizeMessagePayload(message),
  };

  try {
    await withChannel(channel, async () => {
      const response = await channel.send({
        type: 'broadcast',
        event: 'message',
        payload,
      });

      if (response !== 'ok') {
        throw new Error(`Broadcast send failed with status: ${response}`);
      }
    });
  } catch (error) {
    console.error('Failed to broadcast DM message:', error);
  }
}

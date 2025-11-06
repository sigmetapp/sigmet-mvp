/**
 * Broker Client for HTTP API
 * 
 * Allows HTTP API routes to publish events to the WebSocket gateway
 * via Redis broker (if available) or Supabase realtime broadcast.
 */

import type { ThreadId } from './threadId';
import type { DeliveryStatus } from './broker';
import { broadcastDmMessage } from './realtimeServer';

type MessageEvent = {
  kind: 'message';
  origin: string;
  thread_id: ThreadId;
  server_msg_id: number;
  sequence_number: number | null;
  message: Record<string, any>;
};

let redisClient: any = null;
let brokerStream: string = 'dm:events';

/**
 * Initialize broker client with Redis (if available)
 */
export function initBrokerClient(redis?: any, stream?: string): void {
  redisClient = redis;
  if (stream) {
    brokerStream = stream;
  }
}

/**
 * Get or create Redis client for HTTP API
 */
async function getRedisClient(): Promise<any | null> {
  if (redisClient) {
    return redisClient;
  }

  // Try to create Redis client from environment
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    return null;
  }

  try {
    // Dynamic import to avoid requiring ioredis in all environments
    const Redis = (await import('ioredis')).default;
    redisClient = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: null,
    });
    
    await redisClient.connect();
    return redisClient;
  } catch (error) {
    console.error('Failed to create Redis client:', error);
    return null;
  }
}

/**
 * Publish message event to broker (Redis or Supabase fallback)
 */
export async function publishMessageEvent(
  threadId: ThreadId,
  message: Record<string, any>,
  serverMsgId: number,
  sequenceNumber: number | null = null
): Promise<void> {
  const event: MessageEvent = {
    kind: 'message',
    origin: 'http-api', // Identify events from HTTP API
    thread_id: threadId,
    server_msg_id: serverMsgId,
    sequence_number: sequenceNumber,
    message,
  };

  // Try Redis broker first (if available)
  const client = await getRedisClient();
  if (client) {
    try {
      await client.xadd(brokerStream, '*', 'event', JSON.stringify(event));
      // Don't return - also broadcast via Supabase for clients using Supabase fallback
    } catch (error) {
      console.error('Redis broker publish error:', error);
      // Fall through to Supabase broadcast
    }
  }

  // Always broadcast via Supabase realtime (for clients using Supabase fallback)
  // This ensures messages are delivered even if Redis is not available
  try {
    await broadcastDmMessage(threadId, {
      ...message,
      thread_id: threadId,
    });
  } catch (error) {
    console.error('Supabase broadcast error:', error);
  }
}

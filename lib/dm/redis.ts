/**
 * Redis Streams Integration for Scalable Event Routing
 * 
 * Provides horizontal scalability by using Redis Streams
 * to distribute events across multiple gateway instances.
 */

// Redis client type (can be ioredis, node-redis, etc.)
export type RedisClient = {
  xAdd: (stream: string, id: string, fields: Record<string, string>) => Promise<string>;
  xRead: (streams: Array<{ key: string; id: string }>, options?: { count?: number; block?: number }) => Promise<Array<{ name: string; messages: Array<{ id: string; fields: Record<string, string> }> }>> | null;
  xGroupCreate: (stream: string, group: string, id: string, options?: { mkstream?: boolean }) => Promise<void>;
  xReadGroup: (group: string, consumer: string, streams: Array<{ key: string; id: string }>, options?: { count?: number; block?: number }) => Promise<Array<{ name: string; messages: Array<{ id: string; fields: Record<string, string> }> }>> | null;
  xAck: (stream: string, group: string, id: string) => Promise<number>;
};

let redisClient: RedisClient | null = null;
let consumerGroup: string | null = null;
let consumerId: string | null = null;

/**
 * Initialize Redis client
 */
export function initRedis(client: RedisClient, group: string = 'gateway', consumer: string = `consumer-${Date.now()}`): void {
  redisClient = client;
  consumerGroup = group;
  consumerId = consumer;
}

/**
 * Publish event to Redis Stream
 */
export async function publishEvent(stream: string, event: Record<string, any>): Promise<string | null> {
  if (!redisClient) {
    return null;
  }

  try {
    const fields: Record<string, string> = {};
    for (const [key, value] of Object.entries(event)) {
      fields[key] = typeof value === 'string' ? value : JSON.stringify(value);
    }

    const id = await redisClient.xAdd(stream, '*', fields);
    return id;
  } catch (error) {
    console.error('Redis publish error:', error);
    return null;
  }
}

/**
 * Subscribe to Redis Stream and process events
 */
export async function subscribeToStream(
  stream: string,
  handler: (event: Record<string, any>) => Promise<void> | void
): Promise<() => void> {
  if (!redisClient || !consumerGroup || !consumerId) {
    throw new Error('Redis not initialized');
  }

  // Create consumer group if it doesn't exist
  try {
    await redisClient.xGroupCreate(stream, consumerGroup, '0', { mkstream: true });
  } catch (error: any) {
    // Group might already exist, ignore BUSYGROUP error
    if (!error.message?.includes('BUSYGROUP')) {
      console.error('Error creating consumer group:', error);
    }
  }

  let running = true;

  // Process messages
  const processMessages = async () => {
    while (running) {
      try {
        const result = await redisClient!.xReadGroup(
          consumerGroup!,
          consumerId!,
          [{ key: stream, id: '>' }],
          { count: 10, block: 1000 }
        );

        if (result && result.length > 0) {
          for (const streamData of result) {
            for (const message of streamData.messages) {
              try {
                const event: Record<string, any> = {};
                for (const [key, value] of Object.entries(message.fields)) {
                  try {
                    event[key] = JSON.parse(value);
                  } catch {
                    event[key] = value;
                  }
                }

                await handler(event);

                // Acknowledge message
                await redisClient!.xAck(stream, consumerGroup!, message.id);
              } catch (error) {
                console.error('Error processing message:', error);
                // Don't ack on error - will be retried
              }
            }
          }
        }
      } catch (error) {
        console.error('Error reading from stream:', error);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  };

  // Start processing
  processMessages().catch(console.error);

  // Return unsubscribe function
  return () => {
    running = false;
  };
}

/**
 * Get Redis client (for direct access if needed)
 */
export function getRedisClient(): RedisClient | null {
  return redisClient;
}

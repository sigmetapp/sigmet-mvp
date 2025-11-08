import type { ThreadId } from './threadId';

export type DeliveryStatus = 'sent' | 'delivered' | 'read';

export type GatewayBrokerEvent =
  | {
      kind: 'message';
      origin: string;
      thread_id: ThreadId;
      server_msg_id: number;
      sequence_number: number | null;
      message: Record<string, any>;
    }
  | {
      kind: 'ack';
      origin: string;
      thread_id: ThreadId;
      message_id: number;
      client_msg_id?: string | null;
      user_id: string;
      status: DeliveryStatus;
    }
  | {
      kind: 'typing';
      origin: string;
      thread_id: ThreadId;
      user_id: string;
      typing: boolean;
    }
  | {
      kind: 'presence';
      origin: string;
      thread_id: ThreadId;
      user_id: string;
      online: boolean;
    }
  | {
      kind: 'message_ack';
      origin: string;
      conversation_id: string;
      client_msg_id: string;
      timestamp: number;
    }
  | {
      kind: 'message_persisted';
      origin: string;
      conversation_id: string;
      client_msg_id: string;
      db_message_id: string;
      db_created_at: string;
    };

export interface GatewayBroker {
  publish(event: GatewayBrokerEvent): Promise<void>;
  subscribe(handler: (event: GatewayBrokerEvent) => Promise<void> | void): Promise<() => void>;
}

type RedisLikeClient = {
  xadd: (...args: any[]) => Promise<any>;
  xreadgroup: (...args: any[]) => Promise<any>;
  xgroup: (...args: any[]) => Promise<any>;
  xack: (...args: any[]) => Promise<any>;
};

export type RedisBrokerOptions = {
  stream?: string;
  group?: string;
  consumer?: string;
  blockMs?: number;
  batchSize?: number;
};

export function createRedisBroker(
  client: RedisLikeClient,
  {
    stream = 'dm:events',
    group = 'gateway',
    consumer = `gateway-${Math.random().toString(16).slice(2)}`,
    blockMs = 1000,
    batchSize = 50,
  }: RedisBrokerOptions = {}
): GatewayBroker {
  let running = false;
  let unsubscribeHandler: (() => void) | null = null;

  async function ensureGroupExists(): Promise<void> {
    try {
      await client.xgroup('CREATE', stream, group, '0', 'MKSTREAM');
    } catch (error: any) {
      // Ignore BUSYGROUP errors (group already exists)
      if (!error?.message?.includes('BUSYGROUP')) {
        throw error;
      }
    }
  }

  async function publish(event: GatewayBrokerEvent): Promise<void> {
    try {
      const payload = JSON.stringify(event);
      await client.xadd(stream, '*', 'event', payload);
    } catch (error) {
      console.error('Redis broker publish error:', error);
      throw error;
    }
  }

  async function subscribe(
    handler: (event: GatewayBrokerEvent) => Promise<void> | void
  ): Promise<() => void> {
    if (running) {
      // Already subscribed, return existing unsubscribe function
      return () => {
        if (unsubscribeHandler) {
          unsubscribeHandler();
          unsubscribeHandler = null;
        }
        running = false;
      };
    }

    running = true;

    await ensureGroupExists();

    const loop = async () => {
      while (running) {
        try {
          const response = await client.xreadgroup(
            'GROUP',
            group,
            consumer,
            'COUNT',
            String(batchSize),
            'BLOCK',
            String(blockMs),
            'STREAMS',
            stream,
            '>'
          );

          if (!response) {
            continue;
          }

          for (const [, messages] of response as any[]) {
            if (!Array.isArray(messages)) continue;

            for (const [id, fields] of messages) {
              try {
                const raw = fields?.event;
                if (!raw) {
                  await client.xack(stream, group, id);
                  continue;
                }

                const parsed: GatewayBrokerEvent = JSON.parse(raw);
                await handler(parsed);
                await client.xack(stream, group, id);
              } catch (err) {
                console.error('Redis broker handler error:', err);
                // Don't ack on error - will be retried
              }
            }
          }
        } catch (err) {
          console.error('Redis broker subscribe error:', err);
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
    };

    // Start processing loop
    const loopPromise = loop();
    
    unsubscribeHandler = () => {
      running = false;
    };

    // Handle loop errors
    loopPromise.catch((err) => {
      console.error('Redis broker loop error:', err);
      running = false;
    });

    return () => {
      running = false;
      if (unsubscribeHandler) {
        unsubscribeHandler();
        unsubscribeHandler = null;
      }
    };
  }

  return {
    publish,
    async subscribe(handler) {
      return subscribe(handler);
    },
  };
}

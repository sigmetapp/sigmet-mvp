/**
 * Custom Next.js Server with WebSocket Support
 * 
 * Run with: npm run dev:server
 * Or: node server.js (after building)
 */

import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import Redis from 'ioredis';
import { initGateway } from './lib/dm/gateway';
import { createRedisBroker, type GatewayBroker } from './lib/dm/broker';
import { createMessageWorker } from './lib/dm/messageWorker';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const redisUrl = process.env.REDIS_URL;
const redisStream = process.env.REDIS_STREAM || 'dm:events';
const redisGroup = process.env.REDIS_CONSUMER_GROUP || 'gateway';
let redisClient: Redis | null = null;
let gatewayBroker: GatewayBroker | null = null;
let messageWorker: ReturnType<typeof createMessageWorker> | null = null;

// Parse Redis URL for connection config
function parseRedisUrl(url: string | undefined): { host?: string; port?: number; password?: string } {
  if (!url) {
    return { host: 'localhost', port: 6379 };
  }
  
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parsed.port ? parseInt(parsed.port, 10) : 6379,
      password: parsed.password || undefined,
    };
  } catch {
    return { host: 'localhost', port: 6379 };
  }
}

const redisConfig = parseRedisUrl(redisUrl);

if (redisUrl) {
  redisClient = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: null,
  });

  redisClient.on('error', (err) => {
    console.error('Redis connection error:', err);
  });

  redisClient.on('connect', () => {
    console.log('[Redis] connected');
  });

  redisClient.on('reconnecting', () => {
    console.warn('[Redis] reconnecting...');
  });

  gatewayBroker = createRedisBroker(redisClient, {
    stream: redisStream,
    group: redisGroup,
    consumer: `gateway-${process.pid}`,
  });

  // Initialize message worker for async persistence
  try {
    messageWorker = createMessageWorker(redisConfig, gatewayBroker);
    console.log('[MessageWorker] Started');
  } catch (err) {
    console.error('[MessageWorker] Failed to start:', err);
  }

  process.on('exit', () => {
    if (messageWorker) {
      messageWorker.close();
    }
    if (redisClient) {
      redisClient.disconnect();
    }
  });
}

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  });

    // Initialize WebSocket gateway
    initGateway(server, {
      broker: gatewayBroker ?? undefined,
      logger: console,
      redis: redisConfig,
    });

    server.listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
      console.log(`> WebSocket gateway available on ws://${hostname}:${port}/api/ws`);
    });
}).catch((err) => {
  console.error('Error starting server:', err);
  process.exit(1);
});

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

  process.on('exit', () => {
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
    });

    server.listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
      console.log(`> WebSocket gateway available on ws://${hostname}:${port}/api/ws`);
    });
}).catch((err) => {
  console.error('Error starting server:', err);
  process.exit(1);
});

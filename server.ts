/**
 * Custom Next.js Server with WebSocket Support
 * 
 * Run with: npm run dev:server
 * Or: node server.js (after building)
 */

import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { initGateway } from './lib/dm/gateway';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

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
  initGateway(server);

  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> WebSocket gateway available on ws://${hostname}:${port}/api/ws`);
  });
}).catch((err) => {
  console.error('Error starting server:', err);
  process.exit(1);
});

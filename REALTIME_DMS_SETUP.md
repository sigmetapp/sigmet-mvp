# Real-time Dialog System Setup Guide

This document describes the new real-time dialog system implementation with WebSocket support, message ordering, deduplication, and offline/reconnect capabilities.

## Architecture Overview

The system consists of:

1. **WebSocket Gateway** (`lib/dm/gateway.ts`) - Handles persistent WebSocket connections
2. **WebSocket Client** (`lib/dm/websocket.ts`) - Client library with reconnect and offline support
3. **React Hook** (`hooks/useWebSocketDm.ts`) - React integration for real-time messaging
4. **Database Schema** - Enhanced with sequence numbers and deduplication fields
5. **Redis Integration** (`lib/dm/redis.ts`) - Optional Redis Streams for horizontal scaling

## Features

- ✅ Persistent WebSocket connections (<150ms latency)
- ✅ Bidirectional communication (send, receive, typing, presence)
- ✅ Optimistic message rendering with acknowledgments
- ✅ Automatic reconnection and offline support
- ✅ Message synchronization by `last_server_msg_id`
- ✅ Per-conversation message ordering
- ✅ Message deduplication via `client_msg_id`
- ✅ Typing indicators
- ✅ Presence events
- ✅ Redis Streams support for horizontal scaling

## Setup Instructions

### 1. Install Dependencies

```bash
npm install ws @types/ws
```

### 2. Run Database Migration

The migration `118_add_message_ordering_and_dedup.sql` adds:
- `sequence_number` column for per-thread ordering
- `client_msg_id` column for deduplication
- Trigger to auto-generate sequence numbers
- Backfill for existing messages

Run the migration:
```bash
# Using Supabase CLI
supabase migration up

# Or apply manually via Supabase dashboard
```

### 3. Start Custom Server

The WebSocket gateway requires a custom Next.js server. Update your `package.json`:

```json
{
  "scripts": {
    "dev:server": "ts-node server.ts",
    "start:server": "node server.js"
  }
}
```

Then run:
```bash
npm run dev:server
```

**Note:** For production deployments (e.g., Vercel), you may need to:
- Use a separate WebSocket service (e.g., Pusher, Ably, or a dedicated WebSocket server)
- Or use Server-Sent Events (SSE) as a fallback

### 4. Environment Variables

Ensure these are set:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 5. Optional: Redis Setup

For horizontal scaling, configure Redis Streams:

```typescript
import { initRedis } from '@/lib/dm/redis';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);
initRedis(redis, 'gateway', `consumer-${process.env.HOSTNAME || 'default'}`);
```

Then in `gateway.ts`, call `initRedis(redis)` after importing.

## Usage

### In React Components

```typescript
import { useWebSocketDm } from '@/hooks/useWebSocketDm';

function ChatWindow({ threadId }) {
  const {
    messages,
    isConnected,
    partnerTyping,
    partnerOnline,
    sendMessage,
    sendTyping,
  } = useWebSocketDm(threadId);

  // Send message
  const handleSend = async () => {
    await sendMessage(threadId, 'Hello!', []);
  };

  // Send typing indicator
  const handleTyping = () => {
    sendTyping(threadId, true);
  };

  return (
    <div>
      {messages.map(msg => (
        <div key={msg.id}>{msg.body}</div>
      ))}
      {partnerTyping && <div>Partner is typing...</div>}
    </div>
  );
}
```

### Direct WebSocket Client Usage

```typescript
import { getWebSocketClient } from '@/lib/dm/websocket';
import { supabase } from '@/lib/supabaseClient';

const wsClient = getWebSocketClient();

// Connect
const { data: { session } } = await supabase.auth.getSession();
await wsClient.connect(session.access_token);

// Subscribe to thread
wsClient.subscribe(threadId);

// Listen for events
wsClient.on('message', (event) => {
  console.log('New message:', event.message);
});

// Send message
await wsClient.sendMessage(threadId, 'Hello!', []);

// Send typing indicator
wsClient.sendTyping(threadId, true);
```

## Message Flow

1. **Client sends message:**
   - Creates optimistic message with `client_msg_id`
   - Sends via WebSocket
   - Server inserts message with `client_msg_id` and auto-generated `sequence_number`
   - Server broadcasts to all thread subscribers
   - Client receives server message and replaces optimistic message

2. **Reconnect/Offline:**
   - Client sends `sync` message with `last_server_msg_id`
   - Server returns all messages after that ID
   - Client merges with existing messages

3. **Deduplication:**
   - `client_msg_id` prevents duplicate messages
   - Unique index on `(thread_id, client_msg_id)` ensures no duplicates

## Performance

- **Latency:** <150ms for message delivery
- **Scalability:** Horizontal scaling via Redis Streams
- **Reliability:** Automatic reconnection with exponential backoff
- **Offline Support:** Message queue and sync on reconnect

## Troubleshooting

### WebSocket connection fails
- Check that custom server is running
- Verify WebSocket URL matches server configuration
- Check authentication token is valid

### Messages not syncing
- Verify `last_server_msg_id` is being tracked correctly
- Check database migration was applied
- Ensure `sequence_number` trigger is working

### Duplicate messages
- Verify `client_msg_id` is unique per message
- Check unique index on `(thread_id, client_msg_id)`

## Migration from Old System

The old system using Supabase Realtime is still available. To migrate:

1. Update components to use `useWebSocketDm` instead of `useDmRealtime`
2. Replace `sendMessage` calls with WebSocket `sendMessage`
3. Remove Supabase Realtime subscriptions
4. Update to use custom server for WebSocket support

## Production Deployment

For production, consider:

1. **Separate WebSocket Service:** Use a dedicated WebSocket service (Pusher, Ably, etc.)
2. **Load Balancing:** Use Redis Streams for multi-instance support
3. **Monitoring:** Add metrics for connection count, message latency, etc.
4. **Rate Limiting:** Implement per-user rate limits
5. **SSL/TLS:** Ensure WebSocket connections use WSS

## API Reference

See inline documentation in:
- `lib/dm/gateway.ts` - WebSocket gateway
- `lib/dm/websocket.ts` - WebSocket client
- `hooks/useWebSocketDm.ts` - React hook

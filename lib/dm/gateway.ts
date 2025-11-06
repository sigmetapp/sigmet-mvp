/**
 * WebSocket Gateway for Real-time Dialog System
 * 
 * Handles persistent WebSocket connections for:
 * - Message sending/receiving
 * - Typing indicators
 * - Presence events
 * - Message acknowledgments
 * - Reconnect and offline support
 */

import { Server as HTTPServer } from 'http';
import { Server as WebSocketServer, WebSocket } from 'ws';
import { createClient } from '@supabase/supabase-js';
import { assertThreadId, type ThreadId } from './threadId';

// Connection state
interface Connection {
  ws: WebSocket;
  userId: string;
  connectedAt: number;
  lastPing: number;
  subscribedThreads: Set<ThreadId>;
}

// Message types
export type GatewayMessage =
  | { type: 'ping' }
  | { type: 'pong' }
  | { type: 'auth'; token: string }
  | { type: 'subscribe'; thread_id: ThreadId }
  | { type: 'unsubscribe'; thread_id: ThreadId }
  | { type: 'send_message'; thread_id: ThreadId; body: string | null; attachments: unknown[]; client_msg_id: string }
  | { type: 'typing'; thread_id: ThreadId; typing: boolean }
  | { type: 'ack'; message_id: number; thread_id: ThreadId }
  | { type: 'sync'; thread_id: ThreadId; last_server_msg_id: number | null };

export type GatewayEvent =
  | { type: 'message'; thread_id: ThreadId; message: any; server_msg_id: number }
  | { type: 'typing'; thread_id: ThreadId; user_id: string; typing: boolean }
  | { type: 'presence'; thread_id: ThreadId; user_id: string; online: boolean }
  | { type: 'ack'; message_id: number; thread_id: ThreadId; status: 'delivered' | 'read' }
  | { type: 'error'; error: string; code?: string }
  | { type: 'connected' }
  | { type: 'sync_response'; thread_id: ThreadId; messages: any[]; last_server_msg_id: number | null };

// Supabase clients
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

let supabaseService: ReturnType<typeof createClient> | null = null;

function getSupabaseService() {
  if (!supabaseService) {
    supabaseService = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return supabaseService;
}

// Connection management
const connections = new Map<WebSocket, Connection>();
const userConnections = new Map<string, Set<WebSocket>>();
const threadSubscribers = new Map<ThreadId, Set<WebSocket>>();

// Redis client (optional - can use Redis Streams for horizontal scaling)
let redisClient: any = null;

export function initRedis(redis: any) {
  redisClient = redis;
}

// Send message to WebSocket
function send(ws: WebSocket, event: GatewayEvent) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(event));
  }
}

// Broadcast to thread subscribers
function broadcastToThread(threadId: ThreadId, event: GatewayEvent, exclude?: WebSocket) {
  const subscribers = threadSubscribers.get(threadId);
  if (!subscribers) return;

  const message = JSON.stringify(event);
  for (const ws of subscribers) {
    if (ws !== exclude && ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  }
}

// Authenticate user from token
async function authenticate(token: string): Promise<{ userId: string } | null> {
  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return null;
    
    return { userId: user.id };
  } catch {
    return null;
  }
}

// Handle message sending
async function handleSendMessage(
  conn: Connection,
  threadId: ThreadId,
  body: string | null,
  attachments: unknown[],
  clientMsgId: string
) {
  try {
    const supabase = getSupabaseService();
    
    // Verify membership
    const { data: membership } = await supabase
      .from('dms_thread_participants')
      .select('thread_id')
      .eq('thread_id', threadId)
      .eq('user_id', conn.userId)
      .maybeSingle();
    
    if (!membership) {
      send(conn.ws, { type: 'error', error: 'Forbidden', code: 'FORBIDDEN' });
      return;
    }

    // Insert message using RPC function to bypass RLS
    // Convert attachments to JSONB format
    const attachmentsJsonb = Array.isArray(attachments) && attachments.length > 0 
      ? JSON.parse(JSON.stringify(attachments))
      : [];
    
    const { data: message, error } = await supabase.rpc('insert_dms_message', {
      p_thread_id: threadId,
      p_sender_id: conn.userId,
      p_body: body || (attachmentsJsonb.length > 0 ? '\u200B' : null),
      p_kind: 'text',
      p_attachments: attachmentsJsonb,
      p_client_msg_id: clientMsgId || null,
    });

    if (error || !message) {
      // If RPC fails, try direct insert with service role (fallback)
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      
      if (serviceRoleKey) {
        const serviceClient = createClient(url, serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        
        const { data: fallbackMessage, error: fallbackError } = await serviceClient
          .from('dms_messages')
          .insert({
            thread_id: threadId,
            sender_id: conn.userId,
            kind: 'text',
            body: body || (attachmentsJsonb.length > 0 ? '\u200B' : null),
            attachments: attachmentsJsonb,
            client_msg_id: clientMsgId,
            sequence_number: null, // Will be set by trigger
          })
          .select('*')
          .single();

        if (fallbackError || !fallbackMessage) {
          send(conn.ws, { type: 'error', error: fallbackError?.message || error?.message || 'Failed to send message', code: 'SEND_FAILED' });
          return;
        }
        
        // Update client_msg_id if not set by function
        if (clientMsgId && !fallbackMessage.client_msg_id) {
          await serviceClient
            .from('dms_messages')
            .update({ client_msg_id: clientMsgId })
            .eq('id', fallbackMessage.id);
        }
        
        // Use fallback message
        const finalMessage = { ...fallbackMessage, client_msg_id: clientMsgId };
        
        // Update thread
        await serviceClient
          .from('dms_threads')
          .update({
            last_message_id: finalMessage.id,
            last_message_at: finalMessage.created_at,
          })
          .eq('id', threadId);

        // Broadcast to all subscribers
        const serverMsgId = typeof finalMessage.id === 'string' ? parseInt(finalMessage.id, 10) : Number(finalMessage.id);
        broadcastToThread(threadId, {
          type: 'message',
          thread_id: threadId,
          message: {
            ...finalMessage,
            id: serverMsgId,
            client_msg_id: clientMsgId,
          },
          server_msg_id: serverMsgId,
        });

        // Publish to Redis Streams if available
        if (redisClient) {
          try {
            await redisClient.xAdd(
              `thread:${threadId}`,
              '*',
              {
                type: 'message',
                message: JSON.stringify(finalMessage),
                server_msg_id: String(serverMsgId),
              }
            );
          } catch (redisErr) {
            console.error('Redis publish error:', redisErr);
          }
        }
        
        return;
      } else {
        send(conn.ws, { type: 'error', error: error?.message || 'Failed to send message', code: 'SEND_FAILED' });
        return;
      }
    }
    
    // Update client_msg_id if function doesn't support it (for backward compatibility)
    if (clientMsgId && !message.client_msg_id) {
      try {
        await supabase
          .from('dms_messages')
          .update({ client_msg_id: clientMsgId })
          .eq('id', message.id);
        message.client_msg_id = clientMsgId;
      } catch (updateErr) {
        // Ignore update errors, client_msg_id is optional
        console.warn('Failed to update client_msg_id:', updateErr);
      }
    }

    // Thread update is handled by the function, but ensure it's updated
    try {
      await supabase
        .from('dms_threads')
        .update({
          last_message_id: message.id,
          last_message_at: message.created_at,
        })
        .eq('id', threadId);
    } catch (updateErr) {
      // Thread update is already done by function, ignore errors
      console.warn('Thread update warning:', updateErr);
    }

    // Broadcast to all subscribers
    const serverMsgId = typeof message.id === 'string' ? parseInt(message.id, 10) : Number(message.id);
    broadcastToThread(threadId, {
      type: 'message',
      thread_id: threadId,
      message: {
        ...message,
        id: serverMsgId,
        client_msg_id: clientMsgId,
      },
      server_msg_id: serverMsgId,
    });

    // Publish to Redis Streams if available
    if (redisClient) {
      try {
        await redisClient.xAdd(
          `thread:${threadId}`,
          '*',
          {
            type: 'message',
            message: JSON.stringify(message),
            server_msg_id: String(serverMsgId),
          }
        );
      } catch (redisErr) {
        console.error('Redis publish error:', redisErr);
      }
    }
  } catch (err: any) {
    send(conn.ws, { type: 'error', error: err?.message || 'Internal error', code: 'INTERNAL_ERROR' });
  }
}

// Handle message sync (for reconnect/offline)
async function handleSync(conn: Connection, threadId: ThreadId, lastServerMsgId: number | null) {
  try {
    const supabase = getSupabaseService();
    
    // Verify membership
    const { data: membership } = await supabase
      .from('dms_thread_participants')
      .select('thread_id')
      .eq('thread_id', threadId)
      .eq('user_id', conn.userId)
      .maybeSingle();
    
    if (!membership) {
      send(conn.ws, { type: 'error', error: 'Forbidden', code: 'FORBIDDEN' });
      return;
    }

    // Fetch messages after last_server_msg_id
    let query = supabase
      .from('dms_messages')
      .select('*')
      .eq('thread_id', threadId)
      .order('id', { ascending: true });

    if (lastServerMsgId !== null) {
      query = query.gt('id', lastServerMsgId);
    }

    const { data: messages, error } = await query.limit(100);

    if (error) {
      send(conn.ws, { type: 'error', error: error.message, code: 'SYNC_FAILED' });
      return;
    }

    const lastId = messages && messages.length > 0
      ? (typeof messages[messages.length - 1]!.id === 'string'
          ? parseInt(messages[messages.length - 1]!.id, 10)
          : Number(messages[messages.length - 1]!.id))
      : lastServerMsgId;

    send(conn.ws, {
      type: 'sync_response',
      thread_id: threadId,
      messages: messages || [],
      last_server_msg_id: lastId,
    });
  } catch (err: any) {
    send(conn.ws, { type: 'error', error: err?.message || 'Internal error', code: 'INTERNAL_ERROR' });
  }
}

// Handle typing indicator
async function handleTyping(conn: Connection, threadId: ThreadId, typing: boolean) {
  // Broadcast to other subscribers
  broadcastToThread(
    threadId,
    {
      type: 'typing',
      thread_id: threadId,
      user_id: conn.userId,
      typing,
    },
    conn.ws
  );
}

// Handle message acknowledgment
async function handleAck(conn: Connection, messageId: number, threadId: ThreadId) {
  try {
    const supabase = getSupabaseService();
    
    // Update receipt
    await supabase
      .from('dms_message_receipts')
      .upsert({
        message_id: messageId,
        user_id: conn.userId,
        status: 'delivered',
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'message_id,user_id',
      });

    // Broadcast acknowledgment
    broadcastToThread(threadId, {
      type: 'ack',
      message_id: messageId,
      thread_id: threadId,
      status: 'delivered',
    });
  } catch (err: any) {
    console.error('Ack error:', err);
  }
}

// Subscribe to thread
function subscribeToThread(conn: Connection, threadId: ThreadId) {
  conn.subscribedThreads.add(threadId);
  
  let subscribers = threadSubscribers.get(threadId);
  if (!subscribers) {
    subscribers = new Set();
    threadSubscribers.set(threadId, subscribers);
  }
  subscribers.add(conn.ws);
}

// Unsubscribe from thread
function unsubscribeFromThread(conn: Connection, threadId: ThreadId) {
  conn.subscribedThreads.delete(threadId);
  
  const subscribers = threadSubscribers.get(threadId);
  if (subscribers) {
    subscribers.delete(conn.ws);
    if (subscribers.size === 0) {
      threadSubscribers.delete(threadId);
    }
  }
}

// Handle WebSocket message
async function handleMessage(conn: Connection, data: string) {
  try {
    const msg: GatewayMessage = JSON.parse(data);

    switch (msg.type) {
      case 'ping':
        send(conn.ws, { type: 'pong' } as any);
        conn.lastPing = Date.now();
        break;

      case 'pong':
        conn.lastPing = Date.now();
        break;

      case 'auth':
        const auth = await authenticate(msg.token);
        if (auth) {
          conn.userId = auth.userId;
          
          // Add to user connections
          let userConns = userConnections.get(auth.userId);
          if (!userConns) {
            userConns = new Set();
            userConnections.set(auth.userId, userConns);
          }
          userConns.add(conn.ws);
          
          send(conn.ws, { type: 'connected' });
        } else {
          send(conn.ws, { type: 'error', error: 'Authentication failed', code: 'AUTH_FAILED' });
        }
        break;

      case 'subscribe':
        if (!conn.userId) {
          send(conn.ws, { type: 'error', error: 'Not authenticated', code: 'NOT_AUTHENTICATED' });
          break;
        }
        subscribeToThread(conn, msg.thread_id);
        break;

      case 'unsubscribe':
        unsubscribeFromThread(conn, msg.thread_id);
        break;

      case 'send_message':
        if (!conn.userId) {
          send(conn.ws, { type: 'error', error: 'Not authenticated', code: 'NOT_AUTHENTICATED' });
          break;
        }
        await handleSendMessage(conn, msg.thread_id, msg.body, msg.attachments, msg.client_msg_id);
        break;

      case 'typing':
        if (!conn.userId) {
          send(conn.ws, { type: 'error', error: 'Not authenticated', code: 'NOT_AUTHENTICATED' });
          break;
        }
        await handleTyping(conn, msg.thread_id, msg.typing);
        break;

      case 'ack':
        if (!conn.userId) {
          send(conn.ws, { type: 'error', error: 'Not authenticated', code: 'NOT_AUTHENTICATED' });
          break;
        }
        await handleAck(conn, msg.message_id, msg.thread_id);
        break;

      case 'sync':
        if (!conn.userId) {
          send(conn.ws, { type: 'error', error: 'Not authenticated', code: 'NOT_AUTHENTICATED' });
          break;
        }
        await handleSync(conn, msg.thread_id, msg.last_server_msg_id);
        break;

      default:
        send(conn.ws, { type: 'error', error: 'Unknown message type', code: 'UNKNOWN_TYPE' });
    }
  } catch (err: any) {
    send(conn.ws, { type: 'error', error: err?.message || 'Invalid message', code: 'INVALID_MESSAGE' });
  }
}

// Cleanup connection
function cleanupConnection(ws: WebSocket) {
  const conn = connections.get(ws);
  if (!conn) return;

  // Remove from user connections
  if (conn.userId) {
    const userConns = userConnections.get(conn.userId);
    if (userConns) {
      userConns.delete(ws);
      if (userConns.size === 0) {
        userConnections.delete(conn.userId);
      }
    }
  }

  // Unsubscribe from all threads
  for (const threadId of conn.subscribedThreads) {
    unsubscribeFromThread(conn, threadId);
  }

  connections.delete(ws);
}

// Initialize WebSocket server
export function initGateway(server: HTTPServer) {
  const wss = new WebSocketServer({ server, path: '/api/ws' });

  wss.on('connection', (ws: WebSocket) => {
    const conn: Connection = {
      ws,
      userId: '',
      connectedAt: Date.now(),
      lastPing: Date.now(),
      subscribedThreads: new Set(),
    };

    connections.set(ws, conn);

    // Send connection confirmation
    send(ws, { type: 'connected' });

    // Handle messages
    ws.on('message', (data: Buffer) => {
      handleMessage(conn, data.toString());
    });

    // Handle close
    ws.on('close', () => {
      cleanupConnection(ws);
    });

    // Handle error
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      cleanupConnection(ws);
    });

    // Ping/pong keepalive
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        send(ws, { type: 'ping' });
        
        // Check if connection is stale (no pong in 60 seconds)
        if (Date.now() - conn.lastPing > 60000) {
          ws.close();
          clearInterval(pingInterval);
        }
      } else {
        clearInterval(pingInterval);
      }
    }, 30000); // Ping every 30 seconds
  });

  console.log('WebSocket gateway initialized on /api/ws');
  return wss;
}

// Broadcast presence update
export function broadcastPresence(threadId: ThreadId, userId: string, online: boolean) {
  broadcastToThread(threadId, {
    type: 'presence',
    thread_id: threadId,
    user_id: userId,
    online,
  });
}

/**
 * WebSocket Client for Real-time Dialog System
 * 
 * Provides:
 * - Persistent WebSocket connection
 * - Automatic reconnection
 * - Offline message queue
 * - Message synchronization
 * - Typing indicators
 * - Presence events
 * - Optimistic updates with acknowledgments
 */

import { assertThreadId, type ThreadId } from './threadId';
import type { Message } from '@/lib/dms';

type DeliveryStatus = 'sent' | 'delivered' | 'read';

// WebSocket message types
export type WSMessage =
  | { type: 'ping' }
  | { type: 'pong' }
  | { type: 'auth'; token: string }
  | { type: 'subscribe'; thread_id: ThreadId }
  | { type: 'unsubscribe'; thread_id: ThreadId }
  | { type: 'send_message'; thread_id: ThreadId; body: string | null; attachments: unknown[]; client_msg_id: string }
  | { type: 'typing'; thread_id: ThreadId; typing: boolean }
  | { type: 'ack'; message_id: number; thread_id: ThreadId; status?: DeliveryStatus; client_msg_id?: string | null }
  | { type: 'sync'; thread_id: ThreadId; last_server_msg_id: number | null };

export type WSEvent =
  | { type: 'message'; thread_id: ThreadId; message: any; server_msg_id: number; sequence_number: number | null }
  | { type: 'typing'; thread_id: ThreadId; user_id: string; typing: boolean }
  | { type: 'presence'; thread_id: ThreadId; user_id: string; online: boolean }
  | { type: 'ack'; message_id: number; thread_id: ThreadId; user_id: string; status: DeliveryStatus; client_msg_id?: string | null }
  | { type: 'error'; error: string; code?: string }
  | { type: 'connected' }
  | { type: 'pong' }
  | { type: 'sync_response'; thread_id: ThreadId; messages: any[]; last_server_msg_id: number | null };

// Connection state
type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'authenticating' | 'authenticated';

interface PendingMessage {
  thread_id: ThreadId;
  body: string | null;
  attachments: unknown[];
  client_msg_id: string;
  timestamp: number;
  retries: number;
}

interface MessageAck {
  client_msg_id: string;
  server_msg_id: number | null;
  acknowledged: boolean;
  timestamp: number;
  status: DeliveryStatus;
}

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private state: ConnectionState = 'disconnected';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private pingInterval: NodeJS.Timeout | null = null;
  private authToken: string | null = null;
  private subscribedThreads = new Set<ThreadId>();
  private eventHandlers = new Map<string, Set<(event: WSEvent) => void>>();
  private pendingMessages = new Map<string, PendingMessage>();
  private messageAcks = new Map<string, MessageAck>();
  private lastServerMsgIds = new Map<ThreadId, number | null>();
  private offlineQueue: PendingMessage[] = [];

  constructor(private wsUrl: string = '/api/ws') {
    if (typeof window !== 'undefined') {
      this.wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}${this.wsUrl}`;
    }
  }

  // Connect to WebSocket server
  async connect(token: string): Promise<void> {
    if (this.state === 'connected' || this.state === 'connecting') {
      return;
    }

    this.authToken = token;
    this.state = 'connecting';

    return new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket(this.wsUrl);
        let settled = false;
        let hasOpened = false;

        const settle = (fn: () => void, err?: Error) => {
          if (settled) {
            return;
          }
          settled = true;
          clearTimeout(timeoutId);
          fn();
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        };

        const timeoutId = setTimeout(() => {
          settle(() => {
            try {
              ws.close();
            } catch {
              // ignore close errors
            }
            this.state = 'disconnected';
          }, new Error('WebSocket connection timeout'));
        }, 7000);

        ws.onopen = () => {
          hasOpened = true;
          settle(() => {
            this.ws = ws;
            this.state = 'authenticating';
            this.reconnectAttempts = 0;

            // Authenticate
            this.send({ type: 'auth', token });

            // Start ping interval
            this.startPingInterval();
          });
        };

        ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          this.emit('error', { type: 'error', error: 'Connection error', code: 'CONNECTION_ERROR' });

          if (!hasOpened) {
            settle(() => {
              this.state = 'disconnected';
            }, new Error('WebSocket connection error'));
          }
        };

        ws.onclose = () => {
          this.ws = null;
          this.state = 'disconnected';
          this.stopPingInterval();

          if (!hasOpened) {
            settle(() => {
              // state already set to disconnected above
            }, new Error('WebSocket connection closed before open'));
            return;
          }

          // Attempt reconnection
          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);

            setTimeout(() => {
              if (this.authToken) {
                this.connect(this.authToken).catch((err) => {
                  console.error('WebSocket reconnection failed:', err);
                });
              }
            }, delay);
          }
        };
      } catch (error) {
        this.state = 'disconnected';
        reject(error);
      }
    });
  }

  // Disconnect from server
  disconnect(): void {
    this.stopPingInterval();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.state = 'disconnected';
    this.subscribedThreads.clear();
  }

  // Send message
  private send(msg: WSMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  // Handle incoming messages
  private handleMessage(data: string): void {
    try {
      const event: WSEvent = JSON.parse(data);

        if (event.type === 'connected') {
          this.state = 'authenticated';
          this.reconnectAttempts = 0;

          // Resubscribe to threads
          for (const threadId of this.subscribedThreads) {
            this.send({ type: 'subscribe', thread_id: threadId });
          }

          // Sync all subscribed threads
          for (const threadId of this.subscribedThreads) {
            const lastId = this.lastServerMsgIds.get(threadId) ?? null;
            this.send({ type: 'sync', thread_id: threadId, last_server_msg_id: lastId });
          }

          // Send pending messages
          this.flushPendingMessages();
        } else if (event.type === 'pong') {
          // Handle pong response
          return;
        } else if (event.type === 'error' && event.code === 'AUTH_FAILED') {
          this.state = 'disconnected';
          this.disconnect();
        } else if (event.type === 'sync_response') {
          // Update last server message ID
          this.lastServerMsgIds.set(event.thread_id, event.last_server_msg_id);
        } else if (event.type === 'message') {
          // Update last server message ID
          this.lastServerMsgIds.set(event.thread_id, event.server_msg_id);

          const message = event.message as any;
          if (event.sequence_number !== undefined) {
            message.sequence_number = event.sequence_number;
          }

          this.updateAckStatus(event.server_msg_id, 'sent', message?.client_msg_id ?? null);
        } else if (event.type === 'ack') {
          this.updateAckStatus(event.message_id, event.status, event.client_msg_id ?? null);
        }

      this.emit(event.type, event);
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  }

  // Subscribe to thread
  subscribe(threadId: ThreadId): void {
    const normalizedThreadId = assertThreadId(threadId, 'Invalid thread ID');
    
    if (this.subscribedThreads.has(normalizedThreadId)) {
      return;
    }

    this.subscribedThreads.add(normalizedThreadId);
    
    if (this.state === 'authenticated') {
      this.send({ type: 'subscribe', thread_id: normalizedThreadId });
      
      // Sync messages
      const lastId = this.lastServerMsgIds.get(normalizedThreadId) ?? null;
      this.send({ type: 'sync', thread_id: normalizedThreadId, last_server_msg_id: lastId });
    }
  }

  // Unsubscribe from thread
  unsubscribe(threadId: ThreadId): void {
    const normalizedThreadId = assertThreadId(threadId, 'Invalid thread ID');
    
    if (!this.subscribedThreads.has(normalizedThreadId)) {
      return;
    }

    this.subscribedThreads.delete(normalizedThreadId);
    
    if (this.state === 'authenticated') {
      this.send({ type: 'unsubscribe', thread_id: normalizedThreadId });
    }
  }

  // Send message
  async sendMessage(
    threadId: ThreadId,
    body: string | null,
    attachments: unknown[] = [],
    clientMsgId?: string
  ): Promise<{ client_msg_id: string; server_msg_id: number | null }> {
    const normalizedThreadId = assertThreadId(threadId, 'Invalid thread ID');
    const msgId = clientMsgId || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const pending: PendingMessage = {
      thread_id: normalizedThreadId,
      body,
      attachments,
      client_msg_id: msgId,
      timestamp: Date.now(),
      retries: 0,
    };

      // Track acknowledgment
      this.messageAcks.set(msgId, {
        client_msg_id: msgId,
        server_msg_id: null,
        acknowledged: false,
        timestamp: Date.now(),
        status: 'sent',
      });

    // Send immediately if connected
    if (this.state === 'authenticated') {
      this.send({
        type: 'send_message',
        thread_id: normalizedThreadId,
        body,
        attachments,
        client_msg_id: msgId,
      });
    } else {
      // Queue for later
      this.offlineQueue.push(pending);
    }

    return { client_msg_id: msgId, server_msg_id: null };
  }

  // Send typing indicator
  sendTyping(threadId: ThreadId, typing: boolean): void {
    if (this.state === 'authenticated') {
      const normalizedThreadId = assertThreadId(threadId, 'Invalid thread ID');
      this.send({ type: 'typing', thread_id: normalizedThreadId, typing });
    }
  }

  // Acknowledge message
  acknowledgeMessage(messageId: number, threadId: ThreadId, status: DeliveryStatus = 'delivered'): void {
    if (this.state === 'authenticated') {
      const normalizedThreadId = assertThreadId(threadId, 'Invalid thread ID');
      this.send({ type: 'ack', message_id: messageId, thread_id: normalizedThreadId, status });
    }
  }

  // Sync messages for thread
  syncThread(threadId: ThreadId, lastServerMsgId: number | null = null): void {
    if (this.state === 'authenticated') {
      const normalizedThreadId = assertThreadId(threadId, 'Invalid thread ID');
      const lastId = lastServerMsgId ?? this.lastServerMsgIds.get(normalizedThreadId) ?? null;
      this.send({ type: 'sync', thread_id: normalizedThreadId, last_server_msg_id: lastId });
    }
  }

  // Event handling
  on(eventType: string, handler: (event: WSEvent) => void): () => void {
    let handlers = this.eventHandlers.get(eventType);
    if (!handlers) {
      handlers = new Set();
      this.eventHandlers.set(eventType, handlers);
    }
    handlers.add(handler);

    // Return unsubscribe function
    return () => {
      handlers?.delete(handler);
      if (handlers?.size === 0) {
        this.eventHandlers.delete(eventType);
      }
    };
  }

  // Emit event
  private emit(eventType: string, event: WSEvent): void {
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch (error) {
          console.error('Error in event handler:', error);
        }
      }
    }

    // Also emit to 'all' handlers
    const allHandlers = this.eventHandlers.get('all');
    if (allHandlers) {
      for (const handler of allHandlers) {
        try {
          handler(event);
        } catch (error) {
          console.error('Error in all event handler:', error);
        }
      }
    }
  }

  // Flush pending messages
  private flushPendingMessages(): void {
    for (const pending of this.offlineQueue) {
      this.send({
        type: 'send_message',
        thread_id: pending.thread_id,
        body: pending.body,
        attachments: pending.attachments,
        client_msg_id: pending.client_msg_id,
      });
    }
    this.offlineQueue = [];
  }

  // Start ping interval
  private startPingInterval(): void {
    this.stopPingInterval();
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send({ type: 'ping' });
      }
    }, 30000);
  }

  // Stop ping interval
  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private updateAckStatus(messageId: number, status: DeliveryStatus, clientMsgId?: string | null): void {
    let targetClientId = clientMsgId ?? null;

    if (!targetClientId) {
      for (const [id, ack] of this.messageAcks.entries()) {
        if (ack.server_msg_id === messageId) {
          targetClientId = id;
          break;
        }
      }
    }

    if (!targetClientId) {
      return;
    }

    const ack = this.messageAcks.get(targetClientId);
    if (!ack) {
      return;
    }

    ack.server_msg_id = messageId;
    ack.status = status;
    ack.acknowledged = true;
    ack.timestamp = Date.now();
    this.messageAcks.set(targetClientId, ack);
  }

  // Get connection state
  getState(): ConnectionState {
    return this.state;
  }

  // Get last server message ID for thread
  getLastServerMsgId(threadId: ThreadId): number | null {
    return this.lastServerMsgIds.get(threadId) ?? null;
  }

  // Check if message is acknowledged
  isMessageAcknowledged(clientMsgId: string): boolean {
    const ack = this.messageAcks.get(clientMsgId);
    return ack?.acknowledged ?? false;
  }

  // Get server message ID for client message ID
  getServerMsgId(clientMsgId: string): number | null {
    return this.messageAcks.get(clientMsgId)?.server_msg_id ?? null;
  }

  getMessageStatus(clientMsgId: string): DeliveryStatus | undefined {
    return this.messageAcks.get(clientMsgId)?.status;
  }
}

// Singleton instance
let wsClientInstance: WebSocketClient | null = null;

export function getWebSocketClient(): WebSocketClient {
  if (!wsClientInstance) {
    wsClientInstance = new WebSocketClient();
  }
  return wsClientInstance;
}

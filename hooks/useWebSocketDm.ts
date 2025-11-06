/**
 * React Hook for WebSocket-based Real-time DMs
 * 
 * Provides:
 * - WebSocket connection management
 * - Message synchronization
 * - Optimistic updates with acknowledgments
 * - Typing indicators
 * - Presence events
 * - Automatic reconnection
 */

'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { getWebSocketClient, type WSEvent } from '@/lib/dm/websocket';
import { supabase } from '@/lib/supabaseClient';
import type { Message } from '@/lib/dms';
import { assertThreadId, type ThreadId } from '@/lib/dm/threadId';

export function useWebSocketDm(threadId: ThreadId | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [partnerOnline, setPartnerOnline] = useState<boolean | null>(null);
  const [lastServerMsgId, setLastServerMsgId] = useState<number | null>(null);
  
  const wsClientRef = useRef(getWebSocketClient());
  const authTokenRef = useRef<string | null>(null);
  const pendingMessagesRef = useRef<Map<string, Message>>(new Map());
  const currentUserIdRef = useRef<string | null>(null);
  const partnerIdRef = useRef<string | null>(null);
  
  // Store currentUserId in WebSocket client for auto-acknowledgment
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) {
        currentUserIdRef.current = user.id;
        // Store in WebSocket client for acknowledgment logic
        (wsClientRef.current as any).currentUserId = user.id;
      }
    })();
  }, []);

  // Get auth token
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        authTokenRef.current = session.access_token;
        
        // Connect if not already connected
        if (wsClientRef.current.getState() === 'disconnected') {
          await wsClientRef.current.connect(session.access_token);
        }
      }
    })();
  }, []);

  // Get current user ID
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      currentUserIdRef.current = user?.id || null;
    })();
  }, []);

  // Subscribe to thread
  useEffect(() => {
    if (!threadId) {
      setMessages([]);
      setLastServerMsgId(null);
      return;
    }

    const normalizedThreadId = assertThreadId(threadId, 'Invalid thread ID');
    const wsClient = wsClientRef.current;

    // Load initial messages from database
    (async () => {
      try {
        const { listMessages } = await import('@/lib/dms');
        const initialMessages = await listMessages(normalizedThreadId, { limit: 50 });
        
        if (initialMessages && initialMessages.length > 0) {
          // Sort chronologically
          const sorted = initialMessages.sort((a, b) => {
            const timeA = new Date(a.created_at).getTime();
            const timeB = new Date(b.created_at).getTime();
            if (timeA !== timeB) return timeA - timeB;
            return a.id - b.id;
          });
          
          setMessages(sorted);
          
          // Set last server message ID
          const lastMsg = sorted[sorted.length - 1];
          if (lastMsg) {
            setLastServerMsgId(lastMsg.id);
          }
        }
      } catch (err) {
        console.error('Error loading initial messages:', err);
        // Continue without initial messages
      }
    })();

    // Subscribe to thread
    wsClient.subscribe(normalizedThreadId);

    // Handle events
    const handleMessage = (event: WSEvent) => {
      if (event.type === 'message' && event.thread_id === normalizedThreadId) {
        const message = event.message as any;
        const serverMsgId = event.server_msg_id;

        // Check if this is an acknowledgment of a pending message
        if (message.client_msg_id) {
          const pending = pendingMessagesRef.current.get(message.client_msg_id);
          if (pending) {
            // Replace pending message with server message
            setMessages((prev) => {
              const filtered = prev.filter((m) => {
                // Remove pending message with same client_msg_id
                return (m as any).client_msg_id !== message.client_msg_id;
              });
              
              // Add server message
              const newMessage: Message = {
                id: serverMsgId,
                thread_id: normalizedThreadId,
                sender_id: message.sender_id,
                kind: message.kind || 'text',
                body: message.body,
                attachments: message.attachments || [],
                created_at: message.created_at,
                edited_at: message.edited_at || null,
                deleted_at: message.deleted_at || null,
              };
              
              // Sort chronologically
              const sorted = [...filtered, newMessage].sort((a, b) => {
                const timeA = new Date(a.created_at).getTime();
                const timeB = new Date(b.created_at).getTime();
                if (timeA !== timeB) return timeA - timeB;
                return a.id - b.id;
              });
              
              return sorted;
            });
            
            pendingMessagesRef.current.delete(message.client_msg_id);
          } else {
            // New message from server
            const newMessage: Message = {
              id: serverMsgId,
              thread_id: normalizedThreadId,
              sender_id: message.sender_id,
              kind: message.kind || 'text',
              body: message.body,
              attachments: message.attachments || [],
              created_at: message.created_at,
              edited_at: message.edited_at || null,
              deleted_at: message.deleted_at || null,
            };
            
            setMessages((prev) => {
              // Check if message already exists
              if (prev.some((m) => m.id === serverMsgId)) {
                return prev;
              }
              
              // Add and sort
              const sorted = [...prev, newMessage].sort((a, b) => {
                const timeA = new Date(a.created_at).getTime();
                const timeB = new Date(b.created_at).getTime();
                if (timeA !== timeB) return timeA - timeB;
                return a.id - b.id;
              });
              
              return sorted;
            });
          }
        } else {
          // Server message without client_msg_id
          const newMessage: Message = {
            id: serverMsgId,
            thread_id: normalizedThreadId,
            sender_id: message.sender_id,
            kind: message.kind || 'text',
            body: message.body,
            attachments: message.attachments || [],
            created_at: message.created_at,
            edited_at: message.edited_at || null,
            deleted_at: message.deleted_at || null,
          };
          
          setMessages((prev) => {
            if (prev.some((m) => m.id === serverMsgId)) {
              return prev;
            }
            
            const sorted = [...prev, newMessage].sort((a, b) => {
              const timeA = new Date(a.created_at).getTime();
              const timeB = new Date(b.created_at).getTime();
              if (timeA !== timeB) return timeA - timeB;
              return a.id - b.id;
            });
            
            return sorted;
          });
        }

        setLastServerMsgId(serverMsgId);
      }
    };

    const handleTyping = (event: WSEvent) => {
      if (event.type === 'typing' && event.thread_id === normalizedThreadId) {
        if (event.user_id !== currentUserIdRef.current) {
          setPartnerTyping(event.typing);
        }
      }
    };

    const handlePresence = (event: WSEvent) => {
      if (event.type === 'presence' && event.thread_id === normalizedThreadId) {
        if (event.user_id !== currentUserIdRef.current) {
          setPartnerOnline(event.online);
        }
      }
    };

    const handleSync = (event: WSEvent) => {
      if (event.type === 'sync_response' && event.thread_id === normalizedThreadId) {
        const syncMessages = (event.messages || []) as any[];
        
        const formattedMessages: Message[] = syncMessages.map((msg) => ({
          id: typeof msg.id === 'string' ? parseInt(msg.id, 10) : Number(msg.id),
          thread_id: normalizedThreadId,
          sender_id: msg.sender_id,
          kind: msg.kind || 'text',
          body: msg.body,
          attachments: msg.attachments || [],
          created_at: msg.created_at,
          edited_at: msg.edited_at || null,
          deleted_at: msg.deleted_at || null,
        }));

        setMessages((prev) => {
          const byId = new Map<number, Message>();
          for (const msg of prev) {
            byId.set(msg.id, msg);
          }
          for (const msg of formattedMessages) {
            byId.set(msg.id, msg);
          }
          
          return Array.from(byId.values()).sort((a, b) => {
            const timeA = new Date(a.created_at).getTime();
            const timeB = new Date(b.created_at).getTime();
            if (timeA !== timeB) return timeA - timeB;
            return a.id - b.id;
          });
        });

        if (event.last_server_msg_id !== null) {
          setLastServerMsgId(event.last_server_msg_id);
        }
      }
    };

    const handleConnected = (event: WSEvent) => {
      if (event.type === 'connected') {
        setIsConnected(true);
      }
    };

    const handleError = (event: WSEvent) => {
      if (event.type === 'error') {
        console.error('WebSocket error:', event.error);
        if (event.code === 'AUTH_FAILED') {
          setIsConnected(false);
        }
      }
    };

    // Subscribe to events
    const unsubMessage = wsClient.on('message', handleMessage);
    const unsubTyping = wsClient.on('typing', handleTyping);
    const unsubPresence = wsClient.on('presence', handlePresence);
    const unsubSync = wsClient.on('sync_response', handleSync);
    const unsubConnected = wsClient.on('connected', handleConnected);
    const unsubError = wsClient.on('error', handleError);

    // Check connection state
    setIsConnected(wsClient.getState() === 'authenticated');

    return () => {
      unsubMessage();
      unsubTyping();
      unsubPresence();
      unsubSync();
      unsubConnected();
      unsubError();
      wsClient.unsubscribe(normalizedThreadId);
    };
  }, [threadId]);

  // Send message with optimistic update
  const sendMessage = useCallback(async (
    threadId: ThreadId,
    body: string | null,
    attachments: unknown[] = []
  ): Promise<{ client_msg_id: string; server_msg_id: number | null }> => {
    const normalizedThreadId = assertThreadId(threadId, 'Invalid thread ID');
    const wsClient = wsClientRef.current;
    const currentUserId = currentUserIdRef.current;

    if (!currentUserId) {
      throw new Error('Not authenticated');
    }

    // Create optimistic message
    const clientMsgId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const optimisticMessage: Message & { client_msg_id: string } = {
      id: Date.now(), // Temporary ID
      thread_id: normalizedThreadId,
      sender_id: currentUserId,
      kind: 'text',
      body: body || null,
      attachments: attachments as unknown[],
      created_at: new Date().toISOString(),
      edited_at: null,
      deleted_at: null,
      client_msg_id: clientMsgId,
    };

    // Add optimistic message
    setMessages((prev) => {
      const sorted = [...prev, optimisticMessage].sort((a, b) => {
        const timeA = new Date(a.created_at).getTime();
        const timeB = new Date(b.created_at).getTime();
        if (timeA !== timeB) return timeA - timeB;
        return a.id - b.id;
      });
      return sorted;
    });

    // Store pending message
    pendingMessagesRef.current.set(clientMsgId, optimisticMessage);

    try {
      // Send via WebSocket
      const result = await wsClient.sendMessage(normalizedThreadId, body, attachments, clientMsgId);
      return result;
    } catch (error) {
      // Remove optimistic message on error
      setMessages((prev) => prev.filter((m) => (m as any).client_msg_id !== clientMsgId));
      pendingMessagesRef.current.delete(clientMsgId);
      throw error;
    }
  }, []);

  // Send typing indicator
  const sendTyping = useCallback((threadId: ThreadId, typing: boolean) => {
    const normalizedThreadId = assertThreadId(threadId, 'Invalid thread ID');
    const wsClient = wsClientRef.current;
    wsClient.sendTyping(normalizedThreadId, typing);
    setIsTyping(typing);
  }, []);

  // Acknowledge message
  const acknowledgeMessage = useCallback((messageId: number, threadId: ThreadId) => {
    const normalizedThreadId = assertThreadId(threadId, 'Invalid thread ID');
    const wsClient = wsClientRef.current;
    wsClient.acknowledgeMessage(messageId, normalizedThreadId);
  }, []);

  return {
    messages,
    isConnected,
    isTyping,
    partnerTyping,
    partnerOnline,
    lastServerMsgId,
    sendMessage,
    sendTyping,
    acknowledgeMessage,
  };
}

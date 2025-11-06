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
import { subscribeToThread, sendTypingIndicator } from '@/lib/dm/realtime';
import { subscribeToPresence, getPresenceMap } from '@/lib/dm/presence';

export function useWebSocketDm(threadId: ThreadId | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [partnerOnline, setPartnerOnline] = useState<boolean | null>(null);
  const [lastServerMsgId, setLastServerMsgId] = useState<number | null>(null);
  const [transport, setTransport] = useState<'websocket' | 'supabase'>('websocket');
  const [partnerId, setPartnerId] = useState<string | null>(null);
  
  const wsClientRef = useRef(getWebSocketClient());
  const authTokenRef = useRef<string | null>(null);
  const pendingMessagesRef = useRef<Map<string, Message>>(new Map());
  const currentUserIdRef = useRef<string | null>(null);
  const partnerIdRef = useRef<string | null>(null);
  const fallbackThreadUnsubscribeRef = useRef<(() => void | Promise<void>) | null>(null);
  const fallbackPresenceUnsubscribeRef = useRef<(() => void | Promise<void>) | null>(null);
  
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

  // Get auth token and establish primary transport
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;

        if (session?.access_token) {
          authTokenRef.current = session.access_token;

          // Connect if not already connected
          if (wsClientRef.current.getState() === 'disconnected') {
            try {
              await wsClientRef.current.connect(session.access_token);
              if (!cancelled) {
                setTransport('websocket');
              }
            } catch (error) {
              console.warn('WebSocket connection failed, falling back to Supabase realtime:', error);
              if (!cancelled) {
                setTransport('supabase');
                setIsConnected(true);
              }
            }
          } else {
            setTransport('websocket');
          }
        } else {
          setTransport('supabase');
          setIsConnected(true);
        }
      } catch (error) {
        console.error('Error getting Supabase session for DM transport:', error);
        if (!cancelled) {
          setTransport('supabase');
          setIsConnected(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (transport === 'supabase') {
      setIsConnected(true);
    }
  }, [transport]);

  // Get current user ID
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      currentUserIdRef.current = user?.id || null;
    })();
  }, []);

  // Subscribe to thread (WebSocket or Supabase fallback)
  useEffect(() => {
    // Cleanup any existing fallback subscriptions before setting up new ones
    if (fallbackThreadUnsubscribeRef.current) {
      void fallbackThreadUnsubscribeRef.current();
      fallbackThreadUnsubscribeRef.current = null;
    }

    if (!threadId) {
      setMessages([]);
      setLastServerMsgId(null);
      setPartnerTyping(false);
      setPartnerOnline(null);
      setPartnerId(null);
      return;
    }

    const normalizedThreadId = assertThreadId(threadId, 'Invalid thread ID');
    const wsClient = wsClientRef.current;
    let cancelled = false;

    const loadInitialState = async () => {
      try {
        const { listMessages } = await import('@/lib/dms');
        const initialMessages = await listMessages(normalizedThreadId, { limit: 50 });

        if (!cancelled) {
          if (initialMessages && initialMessages.length > 0) {
            const sorted = initialMessages
              .slice()
              .sort((a, b) => {
                const timeA = new Date(a.created_at).getTime();
                const timeB = new Date(b.created_at).getTime();
                if (timeA !== timeB) return timeA - timeB;
                return a.id - b.id;
              });

            setMessages(sorted);
            const lastMsg = sorted[sorted.length - 1];
            if (lastMsg) {
              setLastServerMsgId(lastMsg.id);
            }
          } else {
            setMessages([]);
            setLastServerMsgId(null);
          }
        }
      } catch (err) {
        console.error('Error loading initial messages:', err);
      }

      // Fetch participants to determine partner ID for presence/typing fallback
      try {
        const { data: participants } = await supabase
          .from('dms_thread_participants')
          .select('user_id')
          .eq('thread_id', normalizedThreadId);

        if (!cancelled) {
          const currentUserId = currentUserIdRef.current;
          const partner = (participants || [])
            .map((p) => p.user_id as string)
            .find((id) => id && id !== currentUserId) || null;

          partnerIdRef.current = partner || null;
          setPartnerId(partner || null);
        }
      } catch (err) {
        console.error('Error loading thread participants:', err);
      }
    };

    void loadInitialState();

    if (transport === 'websocket') {
      wsClient.subscribe(normalizedThreadId);

      const handleMessage = (event: WSEvent) => {
        if (event.type === 'message' && event.thread_id === normalizedThreadId) {
          const message = event.message as any;
          const serverMsgId = event.server_msg_id;

          if (message.client_msg_id) {
            const pending = pendingMessagesRef.current.get(message.client_msg_id);
            if (pending) {
              setMessages((prev) => {
                const filtered = prev.filter((m) => (m as any).client_msg_id !== message.client_msg_id);

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
          } else {
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
            setTransport('supabase');
          }
        }
      };

      const unsubMessage = wsClient.on('message', handleMessage);
      const unsubTyping = wsClient.on('typing', handleTyping);
      const unsubPresence = wsClient.on('presence', handlePresence);
      const unsubSync = wsClient.on('sync_response', handleSync);
      const unsubConnected = wsClient.on('connected', handleConnected);
      const unsubError = wsClient.on('error', handleError);

      setIsConnected(wsClient.getState() === 'authenticated');

      return () => {
        cancelled = true;
        unsubMessage();
        unsubTyping();
        unsubPresence();
        unsubSync();
        unsubConnected();
        unsubError();
        wsClient.unsubscribe(normalizedThreadId);
      };
    }

    // Supabase fallback (Realtime + presence)
    const setupFallback = async () => {
      try {
        const unsubscribe = await subscribeToThread(normalizedThreadId, {
          onMessage: (change) => {
            const payload = change.payload;
            const row = (payload.new || payload.old) as any;
            if (!row) return;

            const serverMsgId = typeof row.id === 'string' ? parseInt(row.id, 10) : Number(row.id);
            const normalizedMessage: Message = {
              id: serverMsgId,
              thread_id: normalizedThreadId,
              sender_id: row.sender_id,
              kind: row.kind || 'text',
              body: row.body,
              attachments: row.attachments || [],
              created_at: row.created_at,
              edited_at: row.edited_at || null,
              deleted_at: row.deleted_at || null,
            };

            if (row.client_msg_id) {
              pendingMessagesRef.current.delete(row.client_msg_id);
            }

            setMessages((prev) => {
              if (change.type === 'DELETE') {
                return prev.filter((m) => m.id !== serverMsgId);
              }

              const byId = new Map<number, Message>();
              for (const msg of prev) {
                byId.set(msg.id, msg);
              }
              byId.set(serverMsgId, normalizedMessage);

              return Array.from(byId.values()).sort((a, b) => {
                const timeA = new Date(a.created_at).getTime();
                const timeB = new Date(b.created_at).getTime();
                if (timeA !== timeB) return timeA - timeB;
                return a.id - b.id;
              });
            });

            setLastServerMsgId(serverMsgId);
          },
          onTyping: ({ userId, typing }) => {
            if (userId !== currentUserIdRef.current) {
              setPartnerTyping(!!typing);
            }
          },
        });

        fallbackThreadUnsubscribeRef.current = unsubscribe;
        setIsConnected(true);
      } catch (error) {
        console.error('Error subscribing to Supabase realtime fallback:', error);
      }
    };

    void setupFallback();

    return () => {
      cancelled = true;
      if (fallbackThreadUnsubscribeRef.current) {
        void fallbackThreadUnsubscribeRef.current();
        fallbackThreadUnsubscribeRef.current = null;
      }
    };
  }, [threadId, transport]);

  // Presence fallback subscription (Supabase realtime presence channels)
  useEffect(() => {
    if (fallbackPresenceUnsubscribeRef.current) {
      void fallbackPresenceUnsubscribeRef.current();
      fallbackPresenceUnsubscribeRef.current = null;
    }

    if (!partnerId || transport !== 'supabase') {
      if (transport === 'supabase') {
        setPartnerOnline(null);
      }
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const unsubscribe = await subscribeToPresence([partnerId], (userId, online) => {
          if (!cancelled && userId === partnerId) {
            setPartnerOnline(online);
          }
        });

        fallbackPresenceUnsubscribeRef.current = unsubscribe;

        // Fetch initial presence state
        const presenceMap = await getPresenceMap(partnerId);
        if (!cancelled) {
          const isOnline = !!presenceMap[partnerId]?.[0];
          setPartnerOnline(isOnline);
        }
      } catch (error) {
        console.error('Error subscribing to presence fallback:', error);
      }
    })();

    return () => {
      cancelled = true;
      if (fallbackPresenceUnsubscribeRef.current) {
        void fallbackPresenceUnsubscribeRef.current();
        fallbackPresenceUnsubscribeRef.current = null;
      }
    };
  }, [partnerId, transport]);

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

    const canUseWebSocket = transport === 'websocket' && wsClient.getState() === 'authenticated';

    if (canUseWebSocket) {
      try {
        const result = await wsClient.sendMessage(normalizedThreadId, body, attachments, clientMsgId);
        return result;
      } catch (error) {
        console.warn('WebSocket sendMessage failed, falling back to Supabase realtime:', error);
        setTransport('supabase');
        // Continue to fallback below
      }
    }

    try {
      const { sendMessage: sendMessageHttp } = await import('@/lib/dms');
      const savedMessage = await sendMessageHttp(normalizedThreadId, body || null, attachments);

      setMessages((prev) => {
        const filtered = prev.filter((m) => (m as any).client_msg_id !== clientMsgId);
        const sorted = [...filtered, savedMessage].sort((a, b) => {
          const timeA = new Date(a.created_at).getTime();
          const timeB = new Date(b.created_at).getTime();
          if (timeA !== timeB) return timeA - timeB;
          return a.id - b.id;
        });
        return sorted;
      });

      pendingMessagesRef.current.delete(clientMsgId);
      setLastServerMsgId(savedMessage.id);

      return { client_msg_id: clientMsgId, server_msg_id: savedMessage.id };
    } catch (error) {
      setMessages((prev) => prev.filter((m) => (m as any).client_msg_id !== clientMsgId));
      pendingMessagesRef.current.delete(clientMsgId);
      throw error;
    }
  }, [transport]);

  // Send typing indicator
  const sendTyping = useCallback((threadId: ThreadId, typing: boolean) => {
    const normalizedThreadId = assertThreadId(threadId, 'Invalid thread ID');
    const wsClient = wsClientRef.current;
    const canUseWebSocket = transport === 'websocket' && wsClient.getState() === 'authenticated';

    if (canUseWebSocket) {
      wsClient.sendTyping(normalizedThreadId, typing);
    } else {
      const currentUserId = currentUserIdRef.current;
      if (currentUserId) {
        sendTypingIndicator(normalizedThreadId, currentUserId, typing).catch((error) => {
          console.error('Error sending typing indicator via Supabase realtime:', error);
        });
      }
    }

    setIsTyping(typing);
  }, [transport]);

  // Acknowledge message
  const acknowledgeMessage = useCallback((messageId: number, threadId: ThreadId) => {
    const normalizedThreadId = assertThreadId(threadId, 'Invalid thread ID');
    const wsClient = wsClientRef.current;
    const canUseWebSocket = transport === 'websocket' && wsClient.getState() === 'authenticated';

    if (canUseWebSocket) {
      wsClient.acknowledgeMessage(messageId, normalizedThreadId);
      return;
    }

    void (async () => {
      try {
        await fetch('/api/dms/messages.read', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            thread_id: normalizedThreadId,
            up_to_message_id: messageId,
          }),
        });
      } catch (error) {
        console.error('Error acknowledging message via Supabase fallback:', error);
      }
    })();
  }, [transport]);

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

/**
 * React Hook for WebSocket-based Real-time DMs
 * 
 * Provides:
 * - WebSocket connection management
 * - Message synchronization
 * - Typing indicators
 * - Presence events
 * - Automatic reconnection
 */

'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { getWebSocketClient, type WSEvent } from '@/lib/dm/websocket';
import { supabase } from '@/lib/supabaseClient';
import type { Message } from '@/lib/dms';
import { assertThreadId, type ThreadId } from '@/lib/dm/threadId';
import { subscribeToThread, sendTypingIndicator } from '@/lib/dm/realtime';
import { subscribeToPresence, getPresenceMap } from '@/lib/dm/presence';

const MESSAGE_CACHE_KEY_PREFIX = 'dm:messages:';
const MESSAGE_CACHE_LIMIT = 200;

function compareMessages(a: Message, b: Message): number {
  const seqA = a.sequence_number ?? null;
  const seqB = b.sequence_number ?? null;

  if (seqA !== null && seqB !== null && seqA !== seqB) {
    return seqA - seqB;
  }

  if (seqA !== null && seqB === null) {
    return -1;
  }

  if (seqA === null && seqB !== null) {
    return 1;
  }

  const timeA = new Date(a.created_at).getTime();
  const timeB = new Date(b.created_at).getTime();
  if (timeA !== timeB) return timeA - timeB;
  return a.id - b.id;
}

function sortMessagesChronologically(messages: Message[]): Message[] {
  return [...messages].sort(compareMessages);
}

export type UseWebSocketDmOptions = {
  initialLimit?: number;
};

export function useWebSocketDm(threadId: ThreadId | null, options: UseWebSocketDmOptions = {}) {
  const { initialLimit = 50 } = options;
  const [messages, setMessagesState] = useState<Message[]>([]);
  const cacheKeyRef = useRef<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [partnerOnline, setPartnerOnline] = useState<boolean | null>(null);
  const [lastServerMsgId, setLastServerMsgId] = useState<number | null>(null);
  const [transport, setTransport] = useState<'websocket' | 'supabase'>('websocket');
  const [partnerId, setPartnerId] = useState<string | null>(null);
  
  // Track sent message IDs to filter out own echoes
  // Also track timeouts to clear filters
  const sentClientMsgIdsRef = useRef<Set<string>>(new Set());
  const filterTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  // Watchdog for local-echo: fallback HTTP send if WS persist doesn't arrive in time
  const pendingEchoTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  
  const wsClientRef = useRef(getWebSocketClient());
  const authTokenRef = useRef<string | null>(null);
  const currentUserIdRef = useRef<string | null>(null);
  const partnerIdRef = useRef<string | null>(null);
  const fallbackThreadUnsubscribeRef = useRef<(() => void | Promise<void>) | null>(null);
  const fallbackPresenceUnsubscribeRef = useRef<(() => void | Promise<void>) | null>(null);
  const isHydratedFromCacheRef = useRef(false);
  const initialLimitRef = useRef(initialLimit);

  useEffect(() => {
    initialLimitRef.current = initialLimit;
  }, [initialLimit]);

  const applyMessagesUpdate = useCallback(
    (updater: Message[] | ((prev: Message[]) => Message[])) => {
      if (typeof updater === 'function') {
        setMessagesState((prev) => sortMessagesChronologically((updater as any)(prev)));
      } else {
        setMessagesState(sortMessagesChronologically(updater ?? []));
      }
    },
    []
  );

  const mergeMessagesExternal = useCallback((incoming: Message[]) => {
    if (!incoming || incoming.length === 0) return;
    setMessagesState((prev) => {
      const map = new Map<number, Message>();
      for (const msg of prev) {
        map.set(msg.id, msg);
      }
      for (const msg of incoming) {
        map.set(msg.id, msg);
      }
      return sortMessagesChronologically(Array.from(map.values()));
    });
  }, []);

  const replaceMessagesExternal = useCallback((next: Message[]) => {
    setMessagesState(sortMessagesChronologically(next ?? []));
  }, []);
  
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

    isHydratedFromCacheRef.current = false;

    if (!threadId) {
      setMessagesState([]);
      cacheKeyRef.current = null;
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
          const initialMessages = await listMessages(normalizedThreadId, {
            limit: initialLimitRef.current,
          });

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

            setMessagesState(sorted);
            const lastMsg = sorted[sorted.length - 1];
            if (lastMsg) {
              setLastServerMsgId(lastMsg.id);
            }
          } else {
            setMessagesState([]);
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
            const sequenceNumber = event.sequence_number ?? message.sequence_number ?? null;
            const clientMsgId = message.client_msg_id ?? null;
            
            // Filter out own messages by client_msg_id (avoid echo)
            // This prevents duplicate from WebSocket echo
            if (clientMsgId && sentClientMsgIdsRef.current.has(clientMsgId)) {
              // If we have a local-echo, replace it with real message
              setMessagesState((prev) => {
                const hasLocalEcho = prev.some((m) => 
                  (m as any).client_msg_id === clientMsgId && m.id === -1
                );
                
                if (hasLocalEcho) {
                  const normalizedMessage: Message = {
                    id: serverMsgId,
                    thread_id: normalizedThreadId,
                    sender_id: message.sender_id,
                    kind: message.kind || 'text',
                    body: message.body,
                    attachments: Array.isArray(message.attachments) ? message.attachments : [],
                    created_at: message.created_at,
                    edited_at: message.edited_at || null,
                    deleted_at: message.deleted_at || null,
                    sequence_number: typeof sequenceNumber === 'number' ? sequenceNumber : null,
                    client_msg_id: clientMsgId,
                  };
                  
                  // Replace local-echo with real message
                  return sortMessagesChronologically(
                    prev.map((m) => 
                      (m as any).client_msg_id === clientMsgId && m.id === -1
                        ? normalizedMessage
                        : m
                    )
                  );
                }
                
                // No local-echo, but message is filtered (already processed)
                return prev;
              });
              
              setLastServerMsgId(serverMsgId);
              return;
            }
            
            const normalizedMessage: Message = {
              id: serverMsgId,
              thread_id: normalizedThreadId,
              sender_id: message.sender_id,
              kind: message.kind || 'text',
              body: message.body,
              attachments: Array.isArray(message.attachments) ? message.attachments : [],
              created_at: message.created_at,
              edited_at: message.edited_at || null,
              deleted_at: message.deleted_at || null,
              sequence_number: typeof sequenceNumber === 'number' ? sequenceNumber : null,
              client_msg_id: clientMsgId,
            };

            setMessagesState((prev) => {
              // Always check for duplicates by server ID first
              if (prev.some((m) => m.id === serverMsgId)) {
                return prev;
              }

              // Check by client_msg_id to avoid duplicates (including local-echo)
              if (normalizedMessage.client_msg_id) {
                // If we have a local-echo with this client_msg_id, replace it instead of adding
                const hasLocalEcho = prev.some((m) => 
                  (m as any).client_msg_id === normalizedMessage.client_msg_id && m.id === -1
                );
                
                if (hasLocalEcho) {
                  // Replace local-echo with real message
                  return sortMessagesChronologically(
                    prev.map((m) => 
                      (m as any).client_msg_id === normalizedMessage.client_msg_id && m.id === -1
                        ? normalizedMessage
                        : m
                    )
                  );
                }
                
                // Check if message with this client_msg_id already exists (not local-echo)
                if (prev.some((m) => 
                  (m as any).client_msg_id === normalizedMessage.client_msg_id && m.id !== -1
                )) {
                  return prev;
                }
              }

              // Add new message (incoming from other user)
              return sortMessagesChronologically([...prev, normalizedMessage]);
            });

            setLastServerMsgId(serverMsgId);
          }
        };

        const handleMessageAck = (event: WSEvent) => {
          if (event.type === 'message_ack') {
            // Update message status to 'sent' when ack is received
            // This is handled by the WebSocket client internally
            // We can trigger a re-render if needed by updating state
          }
        };

        const handleMessagePersisted = (event: WSEvent) => {
          if (event.type === 'message_persisted') {
            // Update message status to 'persisted' and update metadata
            // Note: db_message_id is UUID (string), not a number
            // We keep the original message ID but update created_at and mark as persisted
            setMessagesState((prev) => {
              const updated = prev.map((msg) => {
                if ((msg as any).client_msg_id === event.client_msg_id) {
                  // Update message with persisted status and DB timestamp
                  return {
                    ...msg,
                    created_at: event.db_created_at || msg.created_at,
                    // Store db_message_id in meta if needed
                    ...((msg as any).db_message_id ? {} : { db_message_id: event.db_message_id }),
                  };
                }
                return msg;
              });
              
              return updated;
            });
            
            // Clear filter and watchdog timers if they exist
            const timeout = filterTimeoutsRef.current.get(event.client_msg_id);
            if (timeout) {
              clearTimeout(timeout);
              filterTimeoutsRef.current.delete(event.client_msg_id);
            }
            const echoTimeout = pendingEchoTimeoutsRef.current.get(event.client_msg_id);
            if (echoTimeout) {
              clearTimeout(echoTimeout);
              pendingEchoTimeoutsRef.current.delete(event.client_msg_id);
            }
            
            // Remove from filter after persistence (message is now in DB)
            // Keep filter for a bit longer to catch any delayed WebSocket events
            // But clear it eventually to allow new messages with same client_msg_id (shouldn't happen, but safety)
            setTimeout(() => {
              sentClientMsgIdsRef.current.delete(event.client_msg_id);
            }, 3000); // 3 seconds to catch delayed events
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
              attachments: Array.isArray(msg.attachments) ? msg.attachments : [],
              created_at: msg.created_at,
              edited_at: msg.edited_at || null,
              deleted_at: msg.deleted_at || null,
              sequence_number:
                msg.sequence_number === null || msg.sequence_number === undefined
                  ? null
                  : typeof msg.sequence_number === 'string'
                    ? parseInt(msg.sequence_number, 10)
                    : Number(msg.sequence_number),
              client_msg_id: msg.client_msg_id ?? null,
            }));

          setMessagesState((prev) => {
            const byId = new Map<number, Message>();
            for (const msg of prev) {
              byId.set(msg.id, msg);
            }
            for (const msg of formattedMessages) {
              byId.set(msg.id, msg);
            }

              return sortMessagesChronologically(Array.from(byId.values()));
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
      const unsubMessageAck = wsClient.on('message_ack', handleMessageAck);
      const unsubMessagePersisted = wsClient.on('message_persisted', handleMessagePersisted);

      setIsConnected(wsClient.getState() === 'authenticated');

      return () => {
        cancelled = true;
        unsubMessage();
        unsubTyping();
        unsubPresence();
        unsubSync();
        unsubConnected();
        unsubError();
        unsubMessageAck();
        unsubMessagePersisted();
        wsClient.unsubscribe(normalizedThreadId);
      };
    } else {
      // Only set up Supabase fallback if WebSocket is not being used
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
                attachments: Array.isArray(row.attachments) ? row.attachments : [],
              created_at: row.created_at,
              edited_at: row.edited_at || null,
              deleted_at: row.deleted_at || null,
                sequence_number:
                  row.sequence_number === null || row.sequence_number === undefined
                    ? null
                    : typeof row.sequence_number === 'string'
                      ? parseInt(row.sequence_number, 10)
                      : Number(row.sequence_number),
                client_msg_id: row.client_msg_id ?? null,
            };

            setMessagesState((prev) => {
              if (change.type === 'DELETE') {
                return prev.filter((m) => m.id !== serverMsgId);
              }

              // Always check for duplicates by server ID first
              if (prev.some((m) => m.id === serverMsgId)) {
                return prev;
              }

              // For other messages, check by client_msg_id to avoid duplicates
              if (row.client_msg_id && prev.some((m) => (m as any).client_msg_id === row.client_msg_id)) {
                return prev;
              }

              // Add new message
              return sortMessagesChronologically([...prev, normalizedMessage]);
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
    }
    }, [threadId, transport, initialLimit]);

  useEffect(() => {
    if (!threadId || typeof window === 'undefined') {
      return;
    }

    const cacheKey = `${MESSAGE_CACHE_KEY_PREFIX}${threadId}`;
    cacheKeyRef.current = cacheKey;

    if (messages.length > 0 || isHydratedFromCacheRef.current) {
      return;
    }

    try {
      const cached = window.sessionStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as Message[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          isHydratedFromCacheRef.current = true;
          setMessagesState(sortMessagesChronologically(parsed));
        }
      }
    } catch (error) {
      console.warn('Failed to hydrate DM messages cache', error);
    }
  }, [threadId, messages.length]);

  useEffect(() => {
    if (!threadId || typeof window === 'undefined') {
      return;
    }
    const cacheKey = cacheKeyRef.current;
    if (!cacheKey) {
      return;
    }

    if (messages.length === 0 && !isHydratedFromCacheRef.current) {
      return;
    }

    try {
      const trimmed =
        messages.length > MESSAGE_CACHE_LIMIT
          ? messages.slice(-MESSAGE_CACHE_LIMIT)
          : messages;
      window.sessionStorage.setItem(cacheKey, JSON.stringify(trimmed));
    } catch (error) {
      console.warn('Failed to persist DM messages cache', error);
    }
  }, [messages, threadId]);

  // Presence subscription (Supabase realtime presence channels)
  useEffect(() => {
    if (fallbackPresenceUnsubscribeRef.current) {
      void fallbackPresenceUnsubscribeRef.current();
      fallbackPresenceUnsubscribeRef.current = null;
    }

    if (!partnerId) {
      setPartnerOnline(null);
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
      } catch (error) {
        console.error('Error subscribing to presence updates:', error);
      }

      try {
        const presenceMap = await getPresenceMap(partnerId);
        if (!cancelled) {
          const isOnline = !!presenceMap[partnerId]?.[0];
          setPartnerOnline(isOnline);
        }
      } catch (error) {
        console.error('Error retrieving initial presence state:', error);
      }
    })();

    return () => {
      cancelled = true;
      if (fallbackPresenceUnsubscribeRef.current) {
        void fallbackPresenceUnsubscribeRef.current();
        fallbackPresenceUnsubscribeRef.current = null;
      }
    };
  }, [partnerId]);

  // Send message with local-echo support
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

    // Generate UUID v4 for client_msg_id
    const clientMsgId = uuidv4();
    
    // Track this client_msg_id to filter out own echoes
    sentClientMsgIdsRef.current.add(clientMsgId);
    
    // Clear any existing timeout for this client_msg_id (shouldn't happen, but safety)
    const existingTimeout = filterTimeoutsRef.current.get(clientMsgId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }
    
    // Set timeout to clear filter if message_persisted doesn't arrive (fallback)
    // This prevents filter from staying active forever
    const filterTimeout = setTimeout(() => {
      sentClientMsgIdsRef.current.delete(clientMsgId);
      filterTimeoutsRef.current.delete(clientMsgId);
    }, 5000); // 5 seconds timeout
    
    filterTimeoutsRef.current.set(clientMsgId, filterTimeout);

    // Create local-echo message with 'sending' status
    const localEchoMessage: Message = {
      id: -1, // Temporary ID
      thread_id: normalizedThreadId,
      sender_id: currentUserId,
      kind: 'text',
      body: body,
      attachments: Array.isArray(attachments) ? attachments : [],
      created_at: new Date().toISOString(),
      edited_at: null,
      deleted_at: null,
      client_msg_id: clientMsgId,
    };

    // Add local-echo message immediately (only if not already exists)
    setMessagesState((prev) => {
      // Check if already exists by client_msg_id
      if (prev.some((m) => (m as any).client_msg_id === clientMsgId)) {
        return prev;
      }
      // Also check by temporary ID to avoid duplicates
      if (prev.some((m) => m.id === -1 && (m as any).client_msg_id === clientMsgId)) {
        return prev;
      }
      return sortMessagesChronologically([...prev, localEchoMessage]);
    });

    const canUseWebSocket = transport === 'websocket' && wsClient.getState() === 'authenticated';

    if (canUseWebSocket) {
      try {
        const result = await wsClient.sendMessage(normalizedThreadId, body, attachments, clientMsgId);

        // Status will be updated via message_ack and message_persisted events
        // The WebSocket client handles status updates internally
        // Filter will be cleared by handleMessagePersisted or after timeout

        return result;
      } catch (error) {
        console.warn('WebSocket sendMessage failed, falling back to Supabase realtime:', error);
        setTransport('supabase');
        // Continue to fallback below without removing local echo
      }
    }

    try {
      const { sendMessage: sendMessageHttp } = await import('@/lib/dms');
      const savedMessage = await sendMessageHttp(normalizedThreadId, body || null, attachments, clientMsgId);

      // Update local echo with real message (replace, don't add)
      setMessagesState((prev) => {
        const hasLocalEcho = prev.some(
          (m) => (m as any).client_msg_id === clientMsgId && m.id === -1
        );

        if (hasLocalEcho) {
          const updated = sortMessagesChronologically(
            prev.map((msg) => {
              if ((msg as any).client_msg_id === clientMsgId && msg.id === -1) {
                return {
                  ...savedMessage,
                  client_msg_id: clientMsgId,
                };
              }
              return msg;
            })
          );

          // Keep filter active to prevent WebSocket echo
          // It will be cleared by handleMessagePersisted or timeout
          return updated;
        }

        if (prev.some((m) => m.id === savedMessage.id || (m as any).client_msg_id === clientMsgId)) {
          return prev;
        }

        return sortMessagesChronologically([
          ...prev,
          { ...savedMessage, client_msg_id: clientMsgId },
        ]);
      });

      setLastServerMsgId(savedMessage.id);
      // Keep client_msg_id in filter to prevent echo from WebSocket events
      // Don't delete immediately - wait for message_persisted or timeout

      return { client_msg_id: clientMsgId, server_msg_id: savedMessage.id };
    } catch (error) {
      // Keep local echo for user retry; clear filters after timeout
      throw error;
    }
  }, [transport]);

  // Watchdog: if local echo wasn't persisted in time via WS, fallback to HTTP persist
  useEffect(() => {
    return () => {
      // clear any pending timeouts on unmount
      pendingEchoTimeoutsRef.current.forEach((t) => clearTimeout(t));
      pendingEchoTimeoutsRef.current.clear();
    };
  }, []);

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
  const acknowledgeMessage = useCallback((messageId: number, threadId: ThreadId, status: 'delivered' | 'read' = 'read') => {
    const normalizedThreadId = assertThreadId(threadId, 'Invalid thread ID');
    const wsClient = wsClientRef.current;
    const canUseWebSocket = transport === 'websocket' && wsClient.getState() === 'authenticated';

    if (canUseWebSocket) {
      wsClient.acknowledgeMessage(messageId, normalizedThreadId, status);
      return;
    }

    void (async () => {
      try {
        // For read status, use the messages.read endpoint which updates receipts to 'read'
        // For delivered status, we could use a different endpoint, but for now we'll use read
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
    setMessages: applyMessagesUpdate,
    mergeMessages: mergeMessagesExternal,
    replaceMessages: replaceMessagesExternal,
    sendMessage,
    sendTyping,
    acknowledgeMessage,
  };
}

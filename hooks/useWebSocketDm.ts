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

"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import { getWebSocketClient, type WSEvent } from "@/lib/dm/websocket";
import { supabase } from "@/lib/supabaseClient";
import type { Message } from "@/lib/dms";
import { assertThreadId, type ThreadId } from "@/lib/dm/threadId";
import { subscribeToThread, sendTypingIndicator } from "@/lib/dm/realtime";
import { subscribeToPresence, getPresenceMap } from "@/lib/dm/presence";
import {
  enqueueMessage,
  markMessagePersisted,
  markMessageFailed,
  removeMessage,
  startQueueProcessor,
  type PendingMessage,
} from "@/lib/dm/reliableQueue";
import {
  startPeriodicSync,
  syncThreadMessages,
  updateSyncState,
  clearSyncState,
} from "@/lib/dm/messageSync";

const MESSAGE_CACHE_KEY_PREFIX = "dm:messages:";
const MESSAGE_CACHE_LIMIT = 200;
const MAX_HTTP_FALLBACK_ATTEMPTS = 3;

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
return normalizeMessageId(a.id).localeCompare(normalizeMessageId(b.id));
}

function sortMessagesChronologically(messages: Message[]): Message[] {
  return [...messages].sort(compareMessages);
}

function normalizeMessageId(value: Message['id']): string {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}

function idsEqual(a: Message['id'], b: Message['id']): boolean {
  return normalizeMessageId(a) === normalizeMessageId(b);
}

/**
 * Simplified message deduplication using id, sequence_number, and client_msg_id
 * Replaces existing message if found by id, otherwise adds new message
 * Handles local-echo messages (id === -1) by checking client_msg_id
 */
function addOrUpdateMessage(
  messages: Message[],
  newMessage: Message,
): Message[] {
  // Check if message already exists by id (primary key)
  const existingIndex = messages.findIndex((m) =>
    idsEqual(m.id, newMessage.id),
  );

  if (existingIndex !== -1) {
    // Update existing message (in case of edits or updates)
    const updated = [...messages];
    updated[existingIndex] = newMessage;
    return sortMessagesChronologically(updated);
  }

  // Check if we have a local-echo message (id === -1) that needs to be replaced
  // Check by client_msg_id first (most reliable for local-echo)
  if (newMessage.id !== -1 && newMessage.client_msg_id) {
    const localEchoIndex = messages.findIndex(
      (m) =>
        m.id === -1 &&
        (m as any).client_msg_id === newMessage.client_msg_id &&
        m.thread_id === newMessage.thread_id,
    );

    if (localEchoIndex !== -1) {
      // Replace local-echo with real message
      const updated = [...messages];
      updated[localEchoIndex] = newMessage;
      return sortMessagesChronologically(updated);
    }
  }

  // Fallback: Check by sequence_number if client_msg_id not available
  if (newMessage.id !== -1 && newMessage.sequence_number !== null) {
    const localEchoIndex = messages.findIndex(
      (m) =>
        m.id === -1 &&
        m.sequence_number === newMessage.sequence_number &&
        m.thread_id === newMessage.thread_id,
    );

    if (localEchoIndex !== -1) {
      // Replace local-echo with real message
      const updated = [...messages];
      updated[localEchoIndex] = newMessage;
      return sortMessagesChronologically(updated);
    }
  }

  // Check if message with same client_msg_id already exists (avoid duplicates from WebSocket echo)
  if (newMessage.client_msg_id) {
    const duplicateIndex = messages.findIndex(
      (m) =>
        m.id !== -1 &&
        (m as any).client_msg_id === newMessage.client_msg_id &&
        m.thread_id === newMessage.thread_id,
    );

    if (duplicateIndex !== -1) {
      // Message already exists, don't add duplicate
      return messages;
    }
  }

  // Add new message
  return sortMessagesChronologically([...messages, newMessage]);
}

export type UseWebSocketDmOptions = {
  initialLimit?: number;
};

export function useWebSocketDm(
  threadId: ThreadId | null,
  options: UseWebSocketDmOptions = {},
) {
  const { initialLimit = 50 } = options;
  const [messages, setMessagesState] = useState<Message[]>([]);
  const cacheKeyRef = useRef<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [partnerOnline, setPartnerOnline] = useState<boolean | null>(null);
  const [lastServerMsgId, setLastServerMsgId] = useState<string | null>(null);
  const [transport, setTransport] = useState<"websocket" | "supabase">(
    "websocket",
  );
  const [partnerId, setPartnerId] = useState<string | null>(null);

  // Track sent message IDs to filter out own echoes
  // Also track timeouts to clear filters
  const sentClientMsgIdsRef = useRef<Set<string>>(new Set());
  const filterTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  // Watchdog for local-echo: fallback HTTP send if WS persist doesn't arrive in time
  const pendingEchoTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const pendingEchoAttemptsRef = useRef<Map<string, number>>(new Map());

  const wsClientRef = useRef(getWebSocketClient());
  const authTokenRef = useRef<string | null>(null);
  const currentUserIdRef = useRef<string | null>(null);
  const partnerIdRef = useRef<string | null>(null);
  const fallbackThreadUnsubscribeRef = useRef<
    (() => void | Promise<void>) | null
  >(null);
  const fallbackPresenceUnsubscribeRef = useRef<
    (() => void | Promise<void>) | null
  >(null);
  const isHydratedFromCacheRef = useRef(false);
  const initialLimitRef = useRef(initialLimit);
  const lastServerMsgIdRef = useRef<string | null>(null);

  useEffect(() => {
    initialLimitRef.current = initialLimit;
  }, [initialLimit]);

  const applyMessagesUpdate = useCallback(
    (updater: Message[] | ((prev: Message[]) => Message[])) => {
      if (typeof updater === "function") {
        setMessagesState((prev) =>
          sortMessagesChronologically((updater as any)(prev)),
        );
      } else {
        setMessagesState(sortMessagesChronologically(updater ?? []));
      }
    },
    [],
  );

  const mergeMessagesExternal = useCallback((incoming: Message[]) => {
    if (!incoming || incoming.length === 0) return;
    setMessagesState((prev) => {
      const map = new Map<string, Message>();
      for (const msg of prev) {
        map.set(String(msg.id), msg);
      }
      for (const msg of incoming) {
        map.set(String(msg.id), msg);
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
      const {
        data: { user },
      } = await supabase.auth.getUser();
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
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (cancelled) return;

        if (session?.access_token) {
          authTokenRef.current = session.access_token;

          // Connect if not already connected
          if (wsClientRef.current.getState() === "disconnected") {
            try {
              await wsClientRef.current.connect(session.access_token);
              if (!cancelled) {
                setTransport("websocket");
              }
            } catch (error) {
              console.warn(
                "WebSocket connection failed, falling back to Supabase realtime:",
                error,
              );
              if (!cancelled) {
                setTransport("supabase");
                setIsConnected(true);
              }
            }
          } else {
            setTransport("websocket");
          }
        } else {
          setTransport("supabase");
          setIsConnected(true);
        }
      } catch (error) {
        console.error(
          "Error getting Supabase session for DM transport:",
          error,
        );
        if (!cancelled) {
          setTransport("supabase");
          setIsConnected(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (transport === "supabase") {
      setIsConnected(true);
    }
  }, [transport]);

  // Get current user ID
  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
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
      lastServerMsgIdRef.current = null;
      setPartnerTyping(false);
      setPartnerOnline(null);
      setPartnerId(null);
      return;
    }

    const normalizedThreadId = assertThreadId(threadId, "Invalid thread ID");
    const wsClient = wsClientRef.current;
    let cancelled = false;

    const loadInitialState = async () => {
      try {
        // Always load the LATEST messages first when dialog opens
        // Load only the most recent N messages (e.g., 50)
        // Older messages will be loaded lazily when scrolling up
        
        if (!cancelled) {
          let allMessages: Message[] = [];
          
          try {
            // Load the most recent messages (newest first, then reverse for chronological order)
            const INITIAL_LIMIT = initialLimitRef.current; // Usually 50
            
            const { data: recentData, error: recentError } = await supabase
              .from("dms_messages")
              .select("*")
              .eq("thread_id", normalizedThreadId)
              .order("id", { ascending: false }) // Load newest first
              .limit(INITIAL_LIMIT);

            if (!recentError && recentData && recentData.length > 0) {
              // Convert to Message format and reverse to chronological order (oldest first)
              const messages = recentData.map((msg: any) => ({
                id: typeof msg.id === "string" ? parseInt(msg.id, 10) : Number(msg.id),
                thread_id: normalizedThreadId,
                sender_id: msg.sender_id,
                kind: msg.kind || "text",
                body: msg.body,
                attachments: Array.isArray(msg.attachments) ? msg.attachments : [],
                created_at: msg.created_at,
                edited_at: msg.edited_at || null,
                deleted_at: msg.deleted_at || null,
                sequence_number:
                  msg.sequence_number === null || msg.sequence_number === undefined
                    ? null
                    : typeof msg.sequence_number === "string"
                      ? parseInt(msg.sequence_number, 10)
                      : Number(msg.sequence_number),
                client_msg_id: msg.client_msg_id ?? null,
                reply_to_message_id: msg.reply_to_message_id
                  ? typeof msg.reply_to_message_id === "string"
                    ? parseInt(msg.reply_to_message_id, 10)
                    : Number(msg.reply_to_message_id)
                  : null,
              }));
              
              // Log messages with reply_to_message_id
              const messagesWithReply = messages.filter(m => m.reply_to_message_id);
              if (messagesWithReply.length > 0) {
                console.log('[useWebSocketDm] Loaded messages with reply:', messagesWithReply.map(m => ({
                  messageId: m.id,
                  replyToMessageId: m.reply_to_message_id,
                  messageBody: m.body,
                })));
              }

              // Reverse to get chronological order (oldest first, newest last)
              // This way newest messages are at the bottom and we scroll to them
              allMessages = messages.reverse();
            } else if (recentError) {
              console.error("Error loading recent messages:", recentError);
            }
          } catch (loadErr) {
            console.error("Error loading initial messages:", loadErr);
            
            // Fallback: try using listMessages API
            try {
              const { listMessages } = await import("@/lib/dms");
              const initialMessages = await listMessages(normalizedThreadId, {
                limit: initialLimitRef.current,
              });

              if (initialMessages && initialMessages.length > 0) {
                // Sort messages chronologically (oldest first)
                allMessages = initialMessages.slice().sort((a, b) => {
                  const timeA = new Date(a.created_at).getTime();
                  const timeB = new Date(b.created_at).getTime();
                  if (timeA !== timeB) return timeA - timeB;
                  return a.id - b.id;
                });
              }
            } catch (apiErr) {
              console.error("Error loading messages via API:", apiErr);
            }
          }

          // Set messages from server
          setMessagesState(allMessages);

          // Update lastServerMsgId to the newest message (last in array)
          if (allMessages.length > 0) {
            const newestMsg = allMessages[allMessages.length - 1];
            setLastServerMsgId(newestMsg.id);
            lastServerMsgIdRef.current = newestMsg.id;
          } else {
            setLastServerMsgId(null);
            lastServerMsgIdRef.current = null;
          }
        }
      } catch (err) {
        console.error("Error loading initial messages:", err);
        // If loading fails, still try to set empty state
        if (!cancelled) {
          setMessagesState([]);
          setLastServerMsgId(null);
          lastServerMsgIdRef.current = null;
        }
      }

      // Fetch participants to determine partner ID for presence/typing fallback
      try {
        const { data: participants } = await supabase
          .from("dms_thread_participants")
          .select("user_id")
          .eq("thread_id", normalizedThreadId);

        if (!cancelled) {
          const currentUserId = currentUserIdRef.current;
          const partner =
            (participants || [])
              .map((p) => p.user_id as string)
              .find((id) => id && id !== currentUserId) || null;

          partnerIdRef.current = partner || null;
          setPartnerId(partner || null);
        }
      } catch (err) {
        console.error("Error loading thread participants:", err);
      }
    };

    void loadInitialState().then(() => {
      // After initial state is loaded, immediately sync to catch any missed messages
      // This ensures that if the chat window was closed and new messages arrived,
      // they will be loaded when the dialog is reopened
      
      // Update sync state with the latest message ID
      if (lastServerMsgIdRef.current) {
        updateSyncState(normalizedThreadId, {
          last_message_id: lastServerMsgIdRef.current,
        });
      }

      // No automatic sync - only sync via realtime events
      // This ensures we only load messages on demand (lazy loading)
    });

      const setupSupabaseFallback = async (markConnected: boolean) => {
        try {
          const unsubscribe = await subscribeToThread(normalizedThreadId, {
            onMessage: (change) => {
              const payload = change.payload;
              const row = (payload.new || payload.old) as any;
              if (!row) return;

              const serverMsgId =
                typeof row.id === "string"
                  ? parseInt(row.id, 10)
                  : Number(row.id);
              const normalizedMessage: Message = {
                id: serverMsgId,
                thread_id: normalizedThreadId,
                sender_id: row.sender_id,
                kind: row.kind || "text",
                body: row.body,
                attachments: Array.isArray(row.attachments)
                  ? row.attachments
                  : [],
                created_at: row.created_at,
                edited_at: row.edited_at || null,
                deleted_at: row.deleted_at || null,
                sequence_number:
                  row.sequence_number === null ||
                  row.sequence_number === undefined
                    ? null
                    : typeof row.sequence_number === "string"
                      ? parseInt(row.sequence_number, 10)
                      : Number(row.sequence_number),
                client_msg_id: row.client_msg_id ?? null,
                reply_to_message_id: row.reply_to_message_id
                  ? typeof row.reply_to_message_id === "string"
                    ? parseInt(row.reply_to_message_id, 10)
                    : Number(row.reply_to_message_id)
                  : null,
              };

              if (normalizedMessage.reply_to_message_id) {
                console.log("[useWebSocketDm] Realtime message with reply:", {
                  messageId: normalizedMessage.id,
                  replyToMessageId: normalizedMessage.reply_to_message_id,
                  messageBody: normalizedMessage.body,
                });
              }

              setMessagesState((prev) => {
                if (change.type === "DELETE") {
                  return prev.filter((m) => m.id !== serverMsgId);
                }

                return addOrUpdateMessage(prev, normalizedMessage);
              });

              setLastServerMsgId(serverMsgId);
              lastServerMsgIdRef.current = serverMsgId;
            },
            onTyping: ({ userId, typing }) => {
              if (userId !== currentUserIdRef.current) {
                setPartnerTyping(!!typing);
              }
            },
          });

          fallbackThreadUnsubscribeRef.current = unsubscribe;
          if (markConnected) {
            setIsConnected(true);
          }
        } catch (error) {
          console.error(
            "Error subscribing to Supabase realtime fallback:",
            error,
          );
        }
      };

      if (transport === "websocket") {
        void setupSupabaseFallback(false);
        wsClient.subscribe(normalizedThreadId);

      const handleMessage = (event: WSEvent) => {
        if (
          event.type === "message" &&
          event.thread_id === normalizedThreadId
        ) {
          const message = event.message as any;
          const serverMsgId = event.server_msg_id;
          const sequenceNumber =
            event.sequence_number ?? message.sequence_number ?? null;
          const clientMsgIdFromServer = message.client_msg_id ?? null;

          const normalizedMessage: Message = {
            id: serverMsgId,
            thread_id: normalizedThreadId,
            sender_id: message.sender_id,
            kind: message.kind || "text",
            body: message.body,
            attachments: Array.isArray(message.attachments)
              ? message.attachments
              : [],
            created_at: message.created_at,
            edited_at: message.edited_at || null,
            deleted_at: message.deleted_at || null,
            sequence_number:
              typeof sequenceNumber === "number" ? sequenceNumber : null,
            client_msg_id: clientMsgIdFromServer,
            reply_to_message_id: message.reply_to_message_id
              ? typeof message.reply_to_message_id === "string"
                ? parseInt(message.reply_to_message_id, 10)
                : Number(message.reply_to_message_id)
              : null,
          };
          
          if (normalizedMessage.reply_to_message_id) {
            console.log('[useWebSocketDm] Received message with reply:', {
              messageId: normalizedMessage.id,
              replyToMessageId: normalizedMessage.reply_to_message_id,
              messageBody: normalizedMessage.body,
            });
          }

          if (clientMsgIdFromServer) {
            const watchdog = pendingEchoTimeoutsRef.current.get(
              clientMsgIdFromServer,
            );
            if (watchdog) {
              clearTimeout(watchdog);
              pendingEchoTimeoutsRef.current.delete(clientMsgIdFromServer);
            }
            pendingEchoAttemptsRef.current.delete(clientMsgIdFromServer);

            const filterTimeout = filterTimeoutsRef.current.get(
              clientMsgIdFromServer,
            );
            if (filterTimeout) {
              clearTimeout(filterTimeout);
              filterTimeoutsRef.current.delete(clientMsgIdFromServer);
            }
            sentClientMsgIdsRef.current.delete(clientMsgIdFromServer);

            // Update reliable queue with server message ID
            markMessagePersisted(clientMsgIdFromServer, serverMsgId).then(() => {
              removeMessage(clientMsgIdFromServer);
            });
          }

          setMessagesState((prev) => {
            let next = addOrUpdateMessage(prev, normalizedMessage);
            if (clientMsgIdFromServer) {
              next = next.map((msg) =>
                (msg as any).client_msg_id === clientMsgIdFromServer
                  ? {
                      ...msg,
                        delivery_state: "delivered",
                      send_error: undefined,
                    }
                  : msg,
              );
            }
            return next;
          });
          setLastServerMsgId(serverMsgId);
          lastServerMsgIdRef.current = serverMsgId;
        }
      };

      const handleMessageAck = (event: WSEvent) => {
        if (event.type === "message_ack") {
          // Cancel HTTP fallback if message_ack is received
          // This indicates message was successfully sent via WebSocket
          const echoTimeout = pendingEchoTimeoutsRef.current.get(
            event.client_msg_id,
          );
          if (echoTimeout) {
            // Don't cancel yet - wait for message_persisted to confirm it's in DB
            // But we can reduce the timeout since we know it was sent
          }
          // Update message status to 'sent' when ack is received
          // This is handled by the WebSocket client internally
          // We can trigger a re-render if needed by updating state
        }
      };

      const handleMessagePersisted = (event: WSEvent) => {
        if (event.type === "message_persisted") {
          // Cancel HTTP fallback since message was persisted via WebSocket
          const echoTimeout = pendingEchoTimeoutsRef.current.get(
            event.client_msg_id,
          );
          if (echoTimeout) {
            clearTimeout(echoTimeout);
            pendingEchoTimeoutsRef.current.delete(event.client_msg_id);
          }
          pendingEchoAttemptsRef.current.delete(event.client_msg_id);

          // Mark message as persisted in reliable queue
          // Note: We need to get the server_msg_id from the message event, not db_message_id
          // db_message_id is a UUID string, but we need the numeric ID
          // The server_msg_id should come from the message event itself
          // For now, we'll mark it as persisted and remove from queue
          // The actual server_msg_id will be updated when we receive the message event
          markMessagePersisted(
            event.client_msg_id,
            0, // Will be updated when message event arrives
            event.db_message_id
          ).then(() => {
            // Remove from queue after successful persistence
            removeMessage(event.client_msg_id);
          });

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
                  ...((msg as any).db_message_id
                    ? {}
                    : { db_message_id: event.db_message_id }),
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

          // Remove from filter after persistence (message is now in DB)
          // Keep filter for a bit longer to catch any delayed WebSocket events
          // But clear it eventually to allow new messages with same client_msg_id (shouldn't happen, but safety)
          setTimeout(() => {
            sentClientMsgIdsRef.current.delete(event.client_msg_id);
          }, 3000); // 3 seconds to catch delayed events
        }
      };

      const handleTyping = (event: WSEvent) => {
        if (event.type === "typing" && event.thread_id === normalizedThreadId) {
          if (event.user_id !== currentUserIdRef.current) {
            setPartnerTyping(event.typing);
          }
        }
      };

      const handlePresence = (event: WSEvent) => {
        if (
          event.type === "presence" &&
          event.thread_id === normalizedThreadId
        ) {
          if (event.user_id !== currentUserIdRef.current) {
            setPartnerOnline(event.online);
          }
        }
      };

      const handleSync = (event: WSEvent) => {
        if (
          event.type === "sync_response" &&
          event.thread_id === normalizedThreadId
        ) {
          const syncMessages = (event.messages || []) as any[];

          const formattedMessages: Message[] = syncMessages.map((msg) => ({
            id:
              typeof msg.id === "string"
                ? parseInt(msg.id, 10)
                : Number(msg.id),
            thread_id: normalizedThreadId,
            sender_id: msg.sender_id,
            kind: msg.kind || "text",
            body: msg.body,
            attachments: Array.isArray(msg.attachments) ? msg.attachments : [],
            created_at: msg.created_at,
            edited_at: msg.edited_at || null,
            deleted_at: msg.deleted_at || null,
            sequence_number:
              msg.sequence_number === null || msg.sequence_number === undefined
                ? null
                : typeof msg.sequence_number === "string"
                  ? parseInt(msg.sequence_number, 10)
                  : Number(msg.sequence_number),
            client_msg_id: msg.client_msg_id ?? null,
            reply_to_message_id: msg.reply_to_message_id
              ? typeof msg.reply_to_message_id === "string"
                ? parseInt(msg.reply_to_message_id, 10)
                : Number(msg.reply_to_message_id)
              : null,
          }));

          // Simplified merge: use addOrUpdateMessage for each message
          setMessagesState((prev) => {
            let result = prev;
            for (const msg of formattedMessages) {
              result = addOrUpdateMessage(result, msg);
            }
            return result;
          });

          if (event.last_server_msg_id !== null) {
            setLastServerMsgId(event.last_server_msg_id);
            lastServerMsgIdRef.current = event.last_server_msg_id;
          }
        }
      };

      const handleConnected = (event: WSEvent) => {
        if (event.type === "connected") {
          setIsConnected(true);
        }
      };

      const handleError = (event: WSEvent) => {
        if (event.type === "error") {
          // Use centralized error handling (async import)
          import("@/lib/dm/errorHandler")
            .then(({ handleDmError }) => {
              handleDmError(new Error(event.error || "WebSocket error"), {
                component: "useWebSocketDm",
                action: "websocket_error",
                threadId: normalizedThreadId,
                code: event.code,
              });
            })
            .catch((err) => {
              console.error("Failed to handle DM error:", err);
            });

          if (event.code === "AUTH_FAILED") {
            setIsConnected(false);
            setTransport("supabase");
          }
        }
      };

      const unsubMessage = wsClient.on("message", handleMessage);
      const unsubTyping = wsClient.on("typing", handleTyping);
      const unsubPresence = wsClient.on("presence", handlePresence);
      const unsubSync = wsClient.on("sync_response", handleSync);
      const unsubConnected = wsClient.on("connected", handleConnected);
      const unsubError = wsClient.on("error", handleError);
      const unsubMessageAck = wsClient.on("message_ack", handleMessageAck);
      const unsubMessagePersisted = wsClient.on(
        "message_persisted",
        handleMessagePersisted,
      );

      setIsConnected(wsClient.getState() === "authenticated");

      // Start queue processor for reliable delivery
      if (queueProcessorCleanupRef.current) {
        queueProcessorCleanupRef.current();
      }
      queueProcessorCleanupRef.current = startQueueProcessor(
        async (msg: PendingMessage) => {
          try {
            const { sendMessage: sendMessageHttp } = await import("@/lib/dms");
            const saved = await sendMessageHttp(
              msg.thread_id,
              msg.body,
              msg.attachments,
              msg.id
            );
            return { server_msg_id: saved.id };
          } catch (error) {
            console.error("Queue processor send error:", error);
            throw error;
          }
        }
      );

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
          if (queueProcessorCleanupRef.current) {
            queueProcessorCleanupRef.current();
            queueProcessorCleanupRef.current = null;
          }
          if (syncCleanupRef.current) {
            syncCleanupRef.current();
            syncCleanupRef.current = null;
          }
          if (fallbackThreadUnsubscribeRef.current) {
            void fallbackThreadUnsubscribeRef.current();
            fallbackThreadUnsubscribeRef.current = null;
          }
          clearSyncState(normalizedThreadId);
        };
      } else {
        void setupSupabaseFallback(true);

        // No automatic sync - only sync via realtime events
        // This ensures we only load messages on demand (lazy loading)

        return () => {
          cancelled = true;
          if (fallbackThreadUnsubscribeRef.current) {
            void fallbackThreadUnsubscribeRef.current();
            fallbackThreadUnsubscribeRef.current = null;
          }
          if (syncCleanupRef.current) {
            syncCleanupRef.current();
            syncCleanupRef.current = null;
          }
          clearSyncState(normalizedThreadId);
        };
    }
  }, [threadId, transport, initialLimit]);

  useEffect(() => {
    if (!threadId || typeof window === "undefined") {
      return;
    }

    const cacheKey = `${MESSAGE_CACHE_KEY_PREFIX}${threadId}`;
    cacheKeyRef.current = cacheKey;

    // Only load from cache if messages are not already loaded from server
    // The loadInitialState function will always load fresh messages from server
    // Cache is only used as a temporary fallback while server is loading
    if (messages.length > 0 || isHydratedFromCacheRef.current) {
      return;
    }

    // Try IndexedDB first, fallback to sessionStorage
    // This is only a temporary fallback - server will overwrite it
    (async () => {
      try {
        const { getCachedMessages } = await import("@/lib/dm/cache");
        const cached = await getCachedMessages(String(threadId));

        if (cached && cached.length > 0) {
          // Mark as hydrated from cache, but server will overwrite
          isHydratedFromCacheRef.current = true;
          setMessagesState(sortMessagesChronologically(cached));
          return;
        }
      } catch (error) {
        console.warn(
          "Failed to hydrate from IndexedDB, trying sessionStorage:",
          error,
        );
      }

      // Fallback to sessionStorage
      try {
        const cached = window.sessionStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached) as Message[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            // Mark as hydrated from cache, but server will overwrite
            isHydratedFromCacheRef.current = true;
            setMessagesState(sortMessagesChronologically(parsed));
          }
        }
      } catch (error) {
        console.warn("Failed to hydrate DM messages cache", error);
      }
    })();
  }, [threadId, messages.length]);

  useEffect(() => {
    if (!threadId || typeof window === "undefined") {
      return;
    }
    const cacheKey = cacheKeyRef.current;
    if (!cacheKey) {
      return;
    }

    if (messages.length === 0 && !isHydratedFromCacheRef.current) {
      return;
    }

    // Cache to IndexedDB (async, non-blocking)
    (async () => {
      try {
        const { cacheMessages } = await import("@/lib/dm/cache");
        const trimmed =
          messages.length > MESSAGE_CACHE_LIMIT
            ? messages.slice(-MESSAGE_CACHE_LIMIT)
            : messages;
        await cacheMessages(String(threadId), trimmed);
      } catch (error) {
        console.warn(
          "Failed to cache messages in IndexedDB, using sessionStorage:",
          error,
        );

        // Fallback to sessionStorage
        try {
          const trimmed =
            messages.length > MESSAGE_CACHE_LIMIT
              ? messages.slice(-MESSAGE_CACHE_LIMIT)
              : messages;
          window.sessionStorage.setItem(cacheKey, JSON.stringify(trimmed));
        } catch (sessionError) {
          console.warn("Failed to persist DM messages cache", sessionError);
        }
      }
    })();
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
        const unsubscribe = await subscribeToPresence(
          [partnerId],
          (userId, online) => {
            if (!cancelled && userId === partnerId) {
              setPartnerOnline(online);
            }
          },
        );

        fallbackPresenceUnsubscribeRef.current = unsubscribe;
      } catch (error) {
        console.error("Error subscribing to presence updates:", error);
      }

      try {
        const presenceMap = await getPresenceMap(partnerId);
        if (!cancelled) {
          const isOnline = !!presenceMap[partnerId]?.[0];
          setPartnerOnline(isOnline);
        }
      } catch (error) {
        console.error("Error retrieving initial presence state:", error);
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

  // Queue processor cleanup ref
  const queueProcessorCleanupRef = useRef<(() => void) | null>(null);
  const syncCleanupRef = useRef<(() => void) | null>(null);

  // Send message with local-echo support and reliable queue
  const sendMessage = useCallback(
    async (
      threadId: ThreadId,
      body: string | null,
      attachments: unknown[] = [],
    ): Promise<{ client_msg_id: string; server_msg_id: number | null }> => {
      const normalizedThreadId = assertThreadId(threadId, "Invalid thread ID");
      const wsClient = wsClientRef.current;
      const currentUserId = currentUserIdRef.current;

      if (!currentUserId) {
        throw new Error("Not authenticated");
      }

      // Generate UUID v4 for client_msg_id
      const clientMsgId = uuidv4();

      // Add to reliable queue for guaranteed delivery
      await enqueueMessage(clientMsgId, normalizedThreadId, body, attachments);

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
        const localEchoMessage: Message & {
          delivery_state?: "sending" | "failed" | "sent" | "delivered" | "read";
        send_error?: string;
      } = {
        id: -1, // Temporary ID
        thread_id: normalizedThreadId,
        sender_id: currentUserId,
        kind: "text",
        body: body,
        attachments: Array.isArray(attachments) ? attachments : [],
        created_at: new Date().toISOString(),
        edited_at: null,
        deleted_at: null,
        client_msg_id: clientMsgId,
        delivery_state: "sending",
      };

      // Add local-echo message immediately (only if not already exists)
      setMessagesState((prev) => {
        // Check if already exists by client_msg_id
        if (prev.some((m) => (m as any).client_msg_id === clientMsgId)) {
          return prev;
        }
        // Also check by temporary ID to avoid duplicates
        if (
          prev.some(
            (m) => m.id === -1 && (m as any).client_msg_id === clientMsgId,
          )
        ) {
          return prev;
        }
        return sortMessagesChronologically([...prev, localEchoMessage]);
      });

      const canUseWebSocket =
        transport === "websocket" && wsClient.getState() === "authenticated";

      if (canUseWebSocket) {
        try {
          const result = await wsClient.sendMessage(
            normalizedThreadId,
            body,
            attachments,
            clientMsgId,
          );

          // Schedule HTTP fallback only if message_persisted doesn't arrive in time
          // This prevents duplicate messages on server
          const scheduleHttpFallback = (attempt: number) => {
            const delay = attempt === 1 ? 3000 : 5000; // Increased delay to give WebSocket more time
            const watchdog = setTimeout(async () => {
              // Check if message was already persisted via WebSocket
              // If pendingEchoTimeoutsRef doesn't have this clientMsgId, it means message_persisted arrived
              // Also check if message already exists in state with a real ID (not -1)
              if (!pendingEchoTimeoutsRef.current.has(clientMsgId)) {
                return; // Message was already persisted, don't send HTTP fallback
              }

              // Double-check: verify message hasn't been persisted by checking state
              // Use setMessagesState with function to get current state
              let messageAlreadyPersisted = false;
              setMessagesState((prev) => {
                const messageExists = prev.some(
                  (m) =>
                    (m as any).client_msg_id === clientMsgId && m.id !== -1,
                );
                if (messageExists) {
                  messageAlreadyPersisted = true;
                }
                return prev; // Don't modify state, just check
              });

              if (messageAlreadyPersisted) {
                // Message was already persisted, cancel fallback
                pendingEchoTimeoutsRef.current.delete(clientMsgId);
                pendingEchoAttemptsRef.current.delete(clientMsgId);
                return;
              }

              pendingEchoTimeoutsRef.current.delete(clientMsgId);
              try {
                const { sendMessage: sendMessageHttp } = await import(
                  "@/lib/dms"
                );
                const saved = await sendMessageHttp(
                  normalizedThreadId,
                  body || null,
                  attachments,
                  clientMsgId,
                );
                setMessagesState((prev) => {
                  const hasEcho = prev.some(
                    (m) =>
                      (m as any).client_msg_id === clientMsgId && m.id === -1,
                  );
                  if (!hasEcho) return prev;
                  return sortMessagesChronologically(
                    prev.map((m) =>
                      (m as any).client_msg_id === clientMsgId && m.id === -1
                        ? {
                            ...saved,
                            client_msg_id: clientMsgId,
                            send_error: undefined,
                              delivery_state: "delivered",
                          }
                        : m,
                    ),
                  );
                });
                setLastServerMsgId(saved.id);
                lastServerMsgIdRef.current = saved.id;
                pendingEchoAttemptsRef.current.delete(clientMsgId);
              } catch (fallbackError) {
                if (attempt < MAX_HTTP_FALLBACK_ATTEMPTS) {
                  scheduleHttpFallback(attempt + 1);
                } else {
                  pendingEchoAttemptsRef.current.delete(clientMsgId);
                  setMessagesState((prev) =>
                    prev.map((msg) => {
                      if (
                        (msg as any).client_msg_id === clientMsgId &&
                        msg.id === -1
                      ) {
                        return {
                          ...msg,
                          send_error:
                            (fallbackError as Error)?.message ??
                            "Failed to send",
                          delivery_state: "failed",
                        };
                      }
                      return msg;
                    }),
                  );
                }
              }
            }, delay);
            pendingEchoTimeoutsRef.current.set(clientMsgId, watchdog);
            pendingEchoAttemptsRef.current.set(clientMsgId, attempt);
          };

          scheduleHttpFallback(1);

          return result;
        } catch (error) {
          console.warn(
            "WebSocket sendMessage failed, falling back to Supabase realtime:",
            error,
          );
          setTransport("supabase");
          // Continue to fallback below without removing local echo
        }
      }

      try {
        const { sendMessage: sendMessageHttp } = await import("@/lib/dms");
        const savedMessage = await sendMessageHttp(
          normalizedThreadId,
          body || null,
          attachments,
          clientMsgId,
        );

        // Update local echo with real message (replace, don't add)
        setMessagesState((prev) => {
          const hasLocalEcho = prev.some(
            (m) => (m as any).client_msg_id === clientMsgId && m.id === -1,
          );

          if (hasLocalEcho) {
            const updated = sortMessagesChronologically(
              prev.map((msg) => {
                if (
                  (msg as any).client_msg_id === clientMsgId &&
                  msg.id === -1
                ) {
                  return {
                    ...savedMessage,
                    client_msg_id: clientMsgId,
                    send_error: undefined,
                    delivery_state: "delivered",
                  };
                }
                return msg;
              }),
            );

            // Keep filter active to prevent WebSocket echo
            // It will be cleared by handleMessagePersisted or timeout
            return updated;
          }

            if (
              prev.some(
                (m) =>
                  idsEqual(m.id, savedMessage.id) ||
                  (m as any).client_msg_id === clientMsgId,
              )
            ) {
            return prev;
          }

          return sortMessagesChronologically([
            ...prev,
            {
              ...savedMessage,
              client_msg_id: clientMsgId,
              send_error: undefined,
                delivery_state: "delivered",
            },
          ]);
        });

        setLastServerMsgId(savedMessage.id);
        lastServerMsgIdRef.current = savedMessage.id;

        // Mark message as persisted in reliable queue
        await markMessagePersisted(clientMsgId, savedMessage.id);
        await removeMessage(clientMsgId);

        // Keep client_msg_id in filter to prevent echo from WebSocket events
        // Don't delete immediately - wait for message_persisted or timeout

        return { client_msg_id: clientMsgId, server_msg_id: savedMessage.id };
      } catch (error) {
        // Mark message as failed in reliable queue
        await markMessageFailed(
          clientMsgId,
          (error as Error)?.message || "Failed to send"
        );
        // Keep local echo for user retry; clear filters after timeout
        throw error;
      }
    },
    [transport],
  );

  // Watchdog: if local echo wasn't persisted in time via WS, fallback to HTTP persist
  useEffect(() => {
    return () => {
      // clear any pending timeouts on unmount
      pendingEchoTimeoutsRef.current.forEach((t) => clearTimeout(t));
      pendingEchoTimeoutsRef.current.clear();
      pendingEchoAttemptsRef.current.clear();
    };
  }, []);

  // Send typing indicator
  const sendTyping = useCallback(
    (threadId: ThreadId, typing: boolean) => {
      const normalizedThreadId = assertThreadId(threadId, "Invalid thread ID");
      const wsClient = wsClientRef.current;
      const canUseWebSocket =
        transport === "websocket" && wsClient.getState() === "authenticated";

      if (canUseWebSocket) {
        wsClient.sendTyping(normalizedThreadId, typing);
      } else {
        const currentUserId = currentUserIdRef.current;
        if (currentUserId) {
          sendTypingIndicator(normalizedThreadId, currentUserId, typing).catch(
            (error) => {
              console.error(
                "Error sending typing indicator via Supabase realtime:",
                error,
              );
            },
          );
        }
      }

      setIsTyping(typing);
    },
    [transport],
  );

  // Acknowledge message
  const acknowledgeMessage = useCallback(
  (
    messageId: number | string,
    threadId: ThreadId,
    status: "delivered" | "read" = "read",
    sequenceNumber?: number | null,
  ) => {
      const normalizedThreadId = assertThreadId(threadId, "Invalid thread ID");
      const wsClient = wsClientRef.current;
      const canUseWebSocket =
        transport === "websocket" && wsClient.getState() === "authenticated";

      if (canUseWebSocket) {
      const numericId =
        typeof messageId === "string" ? Number.parseInt(messageId, 10) : messageId;
      if (Number.isFinite(numericId)) {
        wsClient.acknowledgeMessage(numericId, normalizedThreadId, status);
      }
        return;
      }

      void (async () => {
        try {
          // For read status, use the messages.read endpoint which updates receipts to 'read'
          // For delivered status, we could use a different endpoint, but for now we'll use read
            await fetch("/api/dms/messages.read", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              thread_id: normalizedThreadId,
              up_to_message_id: messageId,
            up_to_sequence_number:
              sequenceNumber != null && Number.isFinite(sequenceNumber)
                ? Math.trunc(sequenceNumber)
                : null,
            }),
              keepalive: true,
          });
        } catch (error) {
          console.error(
            "Error acknowledging message via Supabase fallback:",
            error,
          );
        }
      })();
    },
    [transport],
  );

  // Auto-acknowledge messages when they become visible
  useEffect(() => {
    if (!threadId || messages.length === 0) {
      return;
    }

    const normalizedThreadId = assertThreadId(threadId, "Invalid thread ID");
    const currentUserId = currentUserIdRef.current;

    if (!currentUserId) {
      return;
    }

    // Find the last message that is not from current user
    const lastOtherMessage = [...messages]
      .reverse()
      .find((msg) => msg.sender_id !== currentUserId && msg.id !== -1);

    if (lastOtherMessage && lastOtherMessage.id > 0) {
      // Acknowledge as read if user is viewing the thread
      // Use a debounce to avoid too many requests
        const timeoutId = setTimeout(() => {
          acknowledgeMessage(
            lastOtherMessage.id,
            normalizedThreadId,
            "read",
            lastOtherMessage.sequence_number ?? null,
          );
        }, 1000); // 1 second debounce

      return () => {
        clearTimeout(timeoutId);
      };
    }
  }, [threadId, messages, acknowledgeMessage]);

  // Load older messages (for lazy loading when scrolling up)
  const loadOlderMessages = useCallback(
    async (beforeId: string | number | null = null): Promise<Message[]> => {
      if (!threadId) return [];

      const normalizedThreadId = assertThreadId(threadId, "Invalid thread ID");
      const OLDER_MESSAGES_LIMIT = 20; // Load 20 older messages at a time

      try {
        // Get the oldest message ID if beforeId is not provided
        const oldestId = beforeId || (messages.length > 0 ? messages[0].id : null);
        
        if (!oldestId) {
          return []; // No messages to load older ones
        }

        // Load messages before the oldest one
        const { data: olderData, error: olderError } = await supabase
          .from("dms_messages")
          .select("*")
          .eq("thread_id", normalizedThreadId)
          .lt("id", oldestId) // Load messages with ID less than oldest
          .order("id", { ascending: false }) // Get newest of the older messages first
          .limit(OLDER_MESSAGES_LIMIT);

        if (olderError) {
          console.error("Error loading older messages:", olderError);
          return [];
        }

        if (!olderData || olderData.length === 0) {
          return []; // No older messages
        }

        // Convert to Message format and reverse to chronological order (oldest first)
        const olderMessages: Message[] = olderData.reverse().map((msg: any) => ({
          id: typeof msg.id === "string" ? parseInt(msg.id, 10) : Number(msg.id),
          thread_id: normalizedThreadId,
          sender_id: msg.sender_id,
          kind: msg.kind || "text",
          body: msg.body,
          attachments: Array.isArray(msg.attachments) ? msg.attachments : [],
          created_at: msg.created_at,
          edited_at: msg.edited_at || null,
          deleted_at: msg.deleted_at || null,
          sequence_number:
            msg.sequence_number === null || msg.sequence_number === undefined
              ? null
              : typeof msg.sequence_number === "string"
                ? parseInt(msg.sequence_number, 10)
                : Number(msg.sequence_number),
          client_msg_id: msg.client_msg_id ?? null,
          reply_to_message_id: msg.reply_to_message_id
            ? typeof msg.reply_to_message_id === "string"
              ? parseInt(msg.reply_to_message_id, 10)
              : Number(msg.reply_to_message_id)
            : null,
        }));

        // Prepend older messages to existing messages
        setMessagesState((prev) => {
          // Merge and sort to avoid duplicates
      const merged = [...olderMessages, ...prev];
      const byId = new Map<string, Message>();
      for (const msg of merged) {
        byId.set(normalizeMessageId(msg.id), msg);
      }
      return sortMessagesChronologically(Array.from(byId.values()));
        });

        return olderMessages;
      } catch (err) {
        console.error("Error in loadOlderMessages:", err);
        return [];
      }
    },
    [threadId, messages]
  );

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
    loadOlderMessages,
  };
}

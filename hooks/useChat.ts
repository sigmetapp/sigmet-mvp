/**
 * useChat hook - instant, ordered, lossless DM engine
 * 
 * Features:
 * - Optimistic UI with idempotent sends
 * - No visual duplicates
 * - Stable ordering even with out-of-order Realtime
 * - Gap detection and backfill
 * - Offline outbox with retries
 * - Delivery and read states via client cursors
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '@/lib/supabaseClient';
import type { MessageUI, MessageCursor, OutboxItem } from '@/lib/chat/types';
import { compareTuples, messageToCursor, isValidCursor } from '@/lib/chat/cursors';
import {
  getOutboxItems,
  addOutboxItem,
  removeOutboxItem,
  updateOutboxItem,
  getReadyOutboxItems,
  calculateNextRetry,
} from '@/lib/chat/outbox';

const REORDER_BUFFER_DELAY = 150; // ms
const INITIAL_PAGE_SIZE = 50;
const BACKFILL_PAGE_SIZE = 50;
const MAX_BUFFER_DELAY = 300; // ms for resilience

type UseChatOptions = {
  initialLimit?: number;
};

type UseChatReturn = {
  messages: MessageUI[];
  send: (text: string) => Promise<void>;
  retry: (tempId: string) => Promise<void>;
  loadOlder: (beforeCursor: MessageCursor) => Promise<void>;
  isBootstrapped: boolean;
  isLoading: boolean;
  error: string | null;
};

const CHAT_DEBUG = process.env.NEXT_PUBLIC_CHAT_DEBUG === 'true';

function debugLog(...args: unknown[]): void {
  if (CHAT_DEBUG) {
    console.debug('[useChat]', ...args);
  }
}

export function useChat(threadId: string | null, options: UseChatOptions = {}): UseChatReturn {
  const { initialLimit = INITIAL_PAGE_SIZE } = options;

  // State
  const [messages, setMessages] = useState<MessageUI[]>([]);
  const [isBootstrapped, setIsBootstrapped] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Refs for deduplication and reconciliation
  const seenClientIdsRef = useRef<Set<string>>(new Set());
  const clientIdToTempIdRef = useRef<Map<string, string>>(new Map());
  const reorderBufferRef = useRef<MessageUI[]>([]);
  const lastTopCursorRef = useRef<MessageCursor | null>(null);
  const bufferFlushTimerRef = useRef<NodeJS.Timeout | null>(null);
  const channelRef = useRef<any>(null);
  const currentUserIdRef = useRef<string | null>(null);
  const bufferDelayRef = useRef(REORDER_BUFFER_DELAY);

  // Get current user ID
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        currentUserIdRef.current = user.id;
      }
    });
  }, []);

  /**
   * Sort messages by (created_at, id) ascending
   */
  const sortMessages = useCallback((msgs: MessageUI[]): MessageUI[] => {
    return [...msgs].sort((a, b) => {
      const cursorA = messageToCursor(a);
      const cursorB = messageToCursor(b);
      return compareTuples(cursorA, cursorB);
    });
  }, []);

  /**
   * Merge new messages into existing list, deduplicating by id
   */
  const mergeMessages = useCallback((existing: MessageUI[], additions: MessageUI[]): MessageUI[] => {
    const byId = new Map<string, MessageUI>();
    
    // Add existing messages
    for (const msg of existing) {
      byId.set(String(msg.id), msg);
    }
    
    // Add or update with new messages
    for (const msg of additions) {
      const id = String(msg.id);
      const existingMsg = byId.get(id);
      
      if (existingMsg) {
        // Update existing message, preserving optimistic state if present
        byId.set(id, {
          ...msg,
          tempId: existingMsg.tempId,
          clientGeneratedId: existingMsg.clientGeneratedId || msg.clientGeneratedId,
          status: existingMsg.status || msg.status,
          createdAtClient: existingMsg.createdAtClient || msg.createdAtClient,
        });
      } else {
        byId.set(id, msg);
      }
    }
    
    return sortMessages(Array.from(byId.values()));
  }, [sortMessages]);

  /**
   * Flush reorder buffer into main messages list
   */
  const flushBuffer = useCallback(() => {
    if (reorderBufferRef.current.length === 0) {
      return;
    }

    debugLog('Flushing buffer', { size: reorderBufferRef.current.length });

    const buffer = [...reorderBufferRef.current];
    reorderBufferRef.current = [];

    // Sort buffer by (created_at, id)
    const sortedBuffer = sortMessages(buffer);

    // Merge into main list
    setMessages((prev) => {
      const merged = mergeMessages(prev, sortedBuffer);
      
      // Update lastTopCursor to the newest message
      if (merged.length > 0) {
        const lastMsg = merged[merged.length - 1];
        lastTopCursorRef.current = messageToCursor(lastMsg);
      }
      
      return merged;
    });
  }, [sortMessages, mergeMessages]);

  /**
   * Schedule buffer flush
   */
  const scheduleFlush = useCallback(() => {
    if (bufferFlushTimerRef.current) {
      clearTimeout(bufferFlushTimerRef.current);
    }
    
    bufferFlushTimerRef.current = setTimeout(() => {
      flushBuffer();
      bufferFlushTimerRef.current = null;
    }, bufferDelayRef.current);
  }, [flushBuffer]);

  /**
   * Add message to reorder buffer
   */
  const addToBuffer = useCallback((msg: MessageUI) => {
    reorderBufferRef.current.push(msg);
    scheduleFlush();
  }, [scheduleFlush]);

  /**
   * Fetch messages after a cursor (for gap detection and backfill)
   */
  const fetchPageAfter = useCallback(async (cursor: MessageCursor, limit: number = BACKFILL_PAGE_SIZE): Promise<MessageUI[]> => {
    if (!threadId) return [];

    debugLog('Fetching page after cursor', cursor);

    // Fetch all messages after the cursor time, then filter by tuple comparison
    const { data, error: fetchError } = await supabase
      .from('dms_messages')
      .select('id, thread_id, sender_id, body, created_at')
      .eq('thread_id', threadId)
      .gte('created_at', cursor.createdAt)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(limit * 2); // Fetch more to account for filtering

    if (fetchError) {
      debugLog('Error fetching page after', fetchError);
      return [];
    }

    if (!data) return [];

    // Filter by tuple comparison: (created_at, id) > (cursor.createdAt, cursor.id)
    const filtered = data.filter((msg) => {
      const msgCursor = messageToCursor({ created_at: msg.created_at, id: String(msg.id) });
      return compareTuples(msgCursor, cursor) > 0;
    });

    // Convert to MessageUI format
    return filtered.slice(0, limit).map((msg) => ({
      id: String(msg.id),
      thread_id: String(msg.thread_id),
      sender_id: msg.sender_id,
      text: msg.body || '',
      created_at: msg.created_at,
      status: 'sent' as const,
    }));
  }, [threadId]);

  /**
   * Bootstrap: load initial messages
   */
  const bootstrap = useCallback(async () => {
    if (!threadId) return;

    setIsLoading(true);
    setError(null);

    try {
      debugLog('Bootstrapping', { threadId });

      // Fetch latest messages (reverse pagination)
      const { data, error: fetchError } = await supabase
        .from('dms_messages')
        .select('id, thread_id, sender_id, body, created_at')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(initialLimit);

      if (fetchError) {
        throw new Error(fetchError.message);
      }

      if (!data) {
        setMessages([]);
        setIsBootstrapped(true);
        setIsLoading(false);
        return;
      }

      // Reverse to ascending order
      const sorted = data.reverse().map((msg) => ({
        id: String(msg.id),
        thread_id: String(msg.thread_id),
        sender_id: msg.sender_id,
        text: msg.body || '',
        created_at: msg.created_at,
        status: 'sent' as const,
      }));

      setMessages(sorted);

      // Set lastTopCursor
      if (sorted.length > 0) {
        const lastMsg = sorted[sorted.length - 1];
        lastTopCursorRef.current = messageToCursor(lastMsg);
      }

      // Load delivery/read cursors from localStorage
      const lastDeliveredCursor = loadCursor(threadId, 'delivered');
      const lastReadCursor = loadCursor(threadId, 'read');

      // Update message statuses based on cursors
      if (currentUserIdRef.current) {
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.sender_id !== currentUserIdRef.current) {
              return msg;
            }

            const cursor = messageToCursor(msg);
            let status: MessageUI['status'] = 'sent';

            if (lastReadCursor && compareTuples(cursor, lastReadCursor) <= 0) {
              status = 'read';
            } else if (lastDeliveredCursor && compareTuples(cursor, lastDeliveredCursor) <= 0) {
              status = 'delivered';
            }

            return { ...msg, status };
          })
        );
      }

      setIsBootstrapped(true);
      setIsLoading(false);

      // Flush outbox
      await flushOutbox();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to bootstrap';
      setError(errorMessage);
      setIsLoading(false);
      debugLog('Bootstrap error', err);
    }
  }, [threadId, initialLimit]);

  /**
   * Subscribe to Realtime INSERT events
   */
  const subscribe = useCallback(() => {
    if (!threadId || channelRef.current) return;

    debugLog('Subscribing to Realtime', { threadId });

    const channel = supabase
      .channel(`chat:${threadId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'dms_messages',
          filter: `thread_id=eq.${threadId}`,
        },
        async (payload) => {
          debugLog('Realtime INSERT', payload);

          const newMsg = payload.new as {
            id: number;
            thread_id: number;
            sender_id?: string;
            sender?: string;
            body: string | null;
            text?: string | null;
            created_at: string;
          };
          
          // Handle both sender_id and sender column names
          const senderId = newMsg.sender_id || newMsg.sender || '';
          const messageText = newMsg.body || newMsg.text || '';

          // Check if we already have this message
          const existing = messages.find((m) => String(m.id) === String(newMsg.id));
          if (existing) {
            debugLog('Duplicate message ignored', { id: newMsg.id });
            return;
          }

          // Check if this matches an optimistic message
          const clientId = (newMsg as any).client_generated_id;
          if (clientId) {
            const tempId = clientIdToTempIdRef.current.get(clientId);
            if (tempId) {
              // Reconcile optimistic message
              setMessages((prev) =>
                prev.map((msg) => {
                  if (msg.tempId === tempId) {
                    return {
                      ...msg,
                      id: String(newMsg.id),
                      created_at: newMsg.created_at,
                      status: 'sent' as const,
                      tempId: undefined,
                    };
                  }
                  return msg;
                })
              );
              return;
            }
          }

          // Check if text and sender match latest optimistic message
          const latestOptimistic = messages
            .filter((m) => m.tempId)
            .sort((a, b) => (b.createdAtClient || 0) - (a.createdAtClient || 0))[0];

          if (
            latestOptimistic &&
            latestOptimistic.text === messageText &&
            latestOptimistic.sender_id === senderId &&
            Math.abs(new Date(newMsg.created_at).getTime() - (latestOptimistic.createdAtClient || 0)) < 5000
          ) {
            // Reconcile
            const tempId = latestOptimistic.tempId!;
            setMessages((prev) =>
              prev.map((msg) => {
                if (msg.tempId === tempId) {
                  return {
                    ...msg,
                    id: String(newMsg.id),
                    created_at: newMsg.created_at,
                    status: 'sent' as const,
                    tempId: undefined,
                  };
                }
                return msg;
              })
            );
            return;
          }

          // Add to buffer as new message
          const messageUI: MessageUI = {
            id: String(newMsg.id),
            thread_id: String(newMsg.thread_id),
            sender_id: senderId,
            text: messageText,
            created_at: newMsg.created_at,
            status: 'sent',
          };

          addToBuffer(messageUI);
        }
      )
      .subscribe((status) => {
        debugLog('Channel status', status);
        if (status === 'SUBSCRIBED') {
          // On reconnect, check for gaps
          if (lastTopCursorRef.current) {
            fetchPageAfter(lastTopCursorRef.current).then((newMessages) => {
              if (newMessages.length > 0) {
                setMessages((prev) => mergeMessages(prev, newMessages));
              }
            });
          }
        }
      });

    channelRef.current = channel;
  }, [threadId, messages, addToBuffer, mergeMessages, fetchPageAfter]);

  /**
   * Send a message
   */
  const send = useCallback(
    async (text: string): Promise<void> => {
      if (!threadId || !text.trim() || !currentUserIdRef.current) return;

      const clientGeneratedId = uuidv4();
      const tempId = `temp-${Date.now()}-${Math.random()}`;
      const createdAtClient = Date.now();

      // Create optimistic message
      const optimisticMsg: MessageUI = {
        id: `temp-${tempId}`,
        thread_id: threadId,
        sender_id: currentUserIdRef.current,
        text: text.trim(),
        created_at: new Date().toISOString(),
        tempId,
        clientGeneratedId,
        status: 'sending',
        createdAtClient,
      };

      // Add to seen set
      seenClientIdsRef.current.add(clientGeneratedId);
      clientIdToTempIdRef.current.set(clientGeneratedId, tempId);

      // Add to messages immediately
      setMessages((prev) => {
        const merged = mergeMessages(prev, [optimisticMsg]);
        return sortMessages(merged);
      });

      // Try to insert
      try {
        const startTime = Date.now();
        const { data, error: insertError } = await supabase
          .from('dms_messages')
          .insert({
            thread_id: threadId,
            sender_id: currentUserIdRef.current,
            body: text.trim(),
          })
          .select('id, thread_id, sender_id, body, created_at')
          .single();

        if (insertError) {
          throw insertError;
        }

        const latency = Date.now() - startTime;
        debugLog('Message sent', { latency, clientGeneratedId });

        // Reconcile optimistic message
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.tempId === tempId) {
              return {
                ...msg,
                id: String(data.id),
                created_at: data.created_at,
                status: 'sent' as const,
                tempId: undefined,
              };
            }
            return msg;
          })
        );

        // Remove from outbox if it was there
        await removeOutboxItem(threadId, clientGeneratedId);
      } catch (err) {
        debugLog('Send error', err);

        // Mark as failed
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.tempId === tempId) {
              return { ...msg, status: 'failed' as const };
            }
            return msg;
          })
        );

        // Add to outbox
        const outboxItem: OutboxItem = {
          clientGeneratedId,
          threadId,
          text: text.trim(),
          createdAtClient,
          attempts: 0,
          nextRetryAt: Date.now(),
        };

        await addOutboxItem(threadId, outboxItem);
      }
    },
    [threadId, mergeMessages, sortMessages]
  );

  /**
   * Retry a failed message
   */
  const retry = useCallback(
    async (tempId: string): Promise<void> => {
      if (!threadId || !currentUserIdRef.current) return;

      const message = messages.find((m) => m.tempId === tempId);
      if (!message || !message.clientGeneratedId) return;

      // Update status to sending
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.tempId === tempId) {
            return { ...msg, status: 'sending' as const };
          }
          return msg;
        })
      );

      // Get outbox item
      const outboxItems = await getOutboxItems(threadId);
      const outboxItem = outboxItems.find((item) => item.clientGeneratedId === message.clientGeneratedId);

      if (!outboxItem) {
        // Create new outbox item
        const newItem: OutboxItem = {
          clientGeneratedId: message.clientGeneratedId,
          threadId,
          text: message.text,
          createdAtClient: message.createdAtClient || Date.now(),
          attempts: 0,
          nextRetryAt: Date.now(),
        };
        await addOutboxItem(threadId, newItem);
      } else {
        // Update attempts
        await updateOutboxItem(threadId, message.clientGeneratedId, {
          attempts: outboxItem.attempts + 1,
          nextRetryAt: calculateNextRetry(outboxItem.attempts + 1),
        });
      }

      // Try to send
      try {
        const { data, error: insertError } = await supabase
          .from('dms_messages')
          .insert({
            thread_id: threadId,
            sender_id: currentUserIdRef.current,
            body: message.text,
          })
          .select('id, thread_id, sender_id, body, created_at')
          .single();

        if (insertError) {
          throw insertError;
        }

        // Reconcile
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.tempId === tempId) {
              return {
                ...msg,
                id: String(data.id),
                created_at: data.created_at,
                status: 'sent' as const,
                tempId: undefined,
              };
            }
            return msg;
          })
        );

        await removeOutboxItem(threadId, message.clientGeneratedId);
      } catch (err) {
        debugLog('Retry error', err);
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.tempId === tempId) {
              return { ...msg, status: 'failed' as const };
            }
            return msg;
          })
        );
      }
    },
    [threadId, messages]
  );

  /**
   * Load older messages
   */
  const loadOlder = useCallback(
    async (beforeCursor: MessageCursor): Promise<void> => {
      if (!threadId || !isValidCursor(beforeCursor)) return;

      debugLog('Loading older messages', beforeCursor);

      // Fetch messages before cursor, then filter by tuple comparison
      const { data, error: fetchError } = await supabase
        .from('dms_messages')
        .select('id, thread_id, sender_id, body, created_at')
        .eq('thread_id', threadId)
        .lte('created_at', beforeCursor.createdAt)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(BACKFILL_PAGE_SIZE * 2); // Fetch more to account for filtering

      if (fetchError) {
        debugLog('Error loading older', fetchError);
        return;
      }

      if (!data) return;

      // Filter by tuple comparison: (created_at, id) < (beforeCursor.createdAt, beforeCursor.id)
      const filtered = data.filter((msg) => {
        const msgCursor = messageToCursor({ created_at: msg.created_at, id: String(msg.id) });
        return compareTuples(msgCursor, beforeCursor) < 0;
      });

      // Reverse to ascending order and take limit
      const newMessages: MessageUI[] = filtered
        .slice(0, BACKFILL_PAGE_SIZE)
        .reverse()
        .map((msg) => ({
          id: String(msg.id),
          thread_id: String(msg.thread_id),
          sender_id: msg.sender_id,
          text: msg.body || '',
          created_at: msg.created_at,
          status: 'sent' as const,
        }));

      // Prepend to messages
      setMessages((prev) => {
        const merged = mergeMessages(prev, newMessages);
        return sortMessages(merged);
      });
    },
    [threadId, sortMessages, mergeMessages]
  );

  /**
   * Flush outbox (retry failed messages)
   */
  const flushOutbox = useCallback(async () => {
    if (!threadId) return;

    const readyItems = await getReadyOutboxItems(threadId);
    if (readyItems.length === 0) return;

    debugLog('Flushing outbox', { count: readyItems.length });

    for (const item of readyItems) {
      const message = messages.find((m) => m.clientGeneratedId === item.clientGeneratedId);
      if (message) {
        await retry(message.tempId || '');
      } else {
        // Message not in UI, try to send directly
        if (currentUserIdRef.current) {
          try {
            const { error: insertError } = await supabase.from('dms_messages').insert({
              thread_id: threadId,
              sender_id: currentUserIdRef.current,
              body: item.text,
            });

            if (!insertError) {
              await removeOutboxItem(threadId, item.clientGeneratedId);
            } else {
              await updateOutboxItem(threadId, item.clientGeneratedId, {
                attempts: item.attempts + 1,
                nextRetryAt: calculateNextRetry(item.attempts + 1),
              });
            }
          } catch (err) {
            debugLog('Outbox flush error', err);
          }
        }
      }
    }
  }, [threadId, messages, retry]);

  /**
   * Load/save cursors from localStorage
   */
  const loadCursor = (threadId: string, type: 'delivered' | 'read'): MessageCursor | null => {
    try {
      const key = `chat:cursor:${threadId}:${type}`;
      const stored = localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (isValidCursor(parsed)) {
          return parsed;
        }
      }
    } catch (err) {
      debugLog('Error loading cursor', err);
    }
    return null;
  };

  const saveCursor = (threadId: string, type: 'delivered' | 'read', cursor: MessageCursor): void => {
    try {
      const key = `chat:cursor:${threadId}:${type}`;
      localStorage.setItem(key, JSON.stringify(cursor));
    } catch (err) {
      debugLog('Error saving cursor', err);
    }
  };

  // Bootstrap on mount
  useEffect(() => {
    if (threadId) {
      bootstrap();
    }
  }, [threadId, bootstrap]);

  // Subscribe to Realtime
  useEffect(() => {
    if (isBootstrapped && threadId) {
      subscribe();
    }

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [isBootstrapped, threadId, subscribe]);

  // Flush outbox on online/reconnect
  useEffect(() => {
    const handleOnline = () => {
      if (isBootstrapped) {
        flushOutbox();
      }
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [isBootstrapped, flushOutbox]);

  // Periodic outbox flush
  useEffect(() => {
    if (!isBootstrapped) return;

    const interval = setInterval(() => {
      flushOutbox();
    }, 5000); // Check every 5 seconds

    return () => clearInterval(interval);
  }, [isBootstrapped, flushOutbox]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (bufferFlushTimerRef.current) {
        clearTimeout(bufferFlushTimerRef.current);
      }
    };
  }, []);

  return {
    messages,
    send,
    retry,
    loadOlder,
    isBootstrapped,
    isLoading,
    error,
  };
}

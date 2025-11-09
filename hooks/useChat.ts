'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';
import { useChatStore } from '@/store/chatStore';
import type { Message } from '@/types/chat';
import { getReceiptsForMessages } from '@/lib/receipts';

type UseChatOptions = {
  currentUserId: string;
  otherUserId: string;
  pageSize?: number;
};

type UseChatReturn = {
  messages: Message[];
  isBootstrapped: boolean;
  isLoading: boolean;
  error: string | null;
  hasMore: boolean;
  loadOlder: () => Promise<void>;
};

const DEFAULT_PAGE_SIZE = 20;

function mapRowToMessage(
  row: any,
  dialogId: string,
  currentUserId: string,
  otherUserId: string
): Message {
  const senderId = row.sender_id as string;
  return {
    id: String(row.id),
    dialogId,
    senderId,
    receiverId: senderId === currentUserId ? otherUserId : currentUserId,
    text: row.body ?? '',
    createdAt: row.created_at,
    status: senderId === currentUserId ? 'sent' : undefined,
  };
}

async function hydrateReceipts(
  messages: Message[],
  currentUserId: string,
  otherUserId: string
): Promise<Message[]> {
  const outgoingIds = messages
    .filter((message) => message.senderId === currentUserId)
    .map((message) => message.id);

  if (outgoingIds.length === 0) {
    return messages;
  }

  const receipts = await getReceiptsForMessages(outgoingIds, otherUserId);

  return messages.map((message) => {
    if (message.senderId !== currentUserId) {
      return message;
    }

    const receipt = receipts[message.id];
    if (!receipt) {
      return { ...message, status: message.status ?? 'sent' };
    }

    if (receipt.read_at) {
      return { ...message, status: 'read' };
    }

    if (receipt.delivered_at) {
      return { ...message, status: 'delivered' };
    }

    return { ...message, status: message.status ?? 'sent' };
  });
}

async function hydrateReceiptsSafe(
  messages: Message[],
  currentUserId: string,
  otherUserId: string
): Promise<Message[]> {
  if (messages.length === 0) {
    return messages;
  }

  try {
    return await hydrateReceipts(messages, currentUserId, otherUserId);
  } catch (error) {
    console.warn('[useChat] Failed to hydrate receipts', error);
    return messages;
  }
}

export function useChat(dialogId: string | null, options: UseChatOptions): UseChatReturn {
  const { currentUserId, otherUserId, pageSize = DEFAULT_PAGE_SIZE } = options;
  const dialogKey = dialogId ? String(dialogId) : null;

  const messages = useChatStore((state) =>
    dialogKey ? state.messagesByDialog[dialogKey] ?? [] : []
  );
  const setMessages = useChatStore((state) => state.setMessages);
  const addMessages = useChatStore((state) => state.addMessages);
  const clearDialog = useChatStore((state) => state.clearDialog);

  const [isBootstrapped, setIsBootstrapped] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const isFetchingOlderRef = useRef(false);

  useEffect(() => {
    if (!dialogKey || !currentUserId || !otherUserId) {
      setIsBootstrapped(false);
      setHasMore(true);
      setError(null);
      setIsLoading(false);
      return () => {};
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const bootstrap = async () => {
      try {
        const { data, error: fetchError } = await supabase
          .from('dms_messages')
          .select('id, sender_id, body, created_at')
          .eq('thread_id', dialogKey)
          .order('id', { ascending: false })
          .limit(pageSize);

        if (fetchError) {
          throw fetchError;
        }

        const baseMessages = (data ?? [])
          .map((row) => mapRowToMessage(row, dialogKey, currentUserId, otherUserId))
          .reverse();

        const hydrated = await hydrateReceiptsSafe(baseMessages, currentUserId, otherUserId);

        if (cancelled) {
          return;
        }

        setMessages(dialogKey, hydrated);
        setHasMore((data ?? []).length === pageSize);
        setIsBootstrapped(true);
        setIsLoading(false);
      } catch (err) {
        if (cancelled) {
          return;
        }

        const message = err instanceof Error ? err.message : 'Failed to load messages';
        setError(message);
        setIsBootstrapped(false);
        setIsLoading(false);
      }
    };

    bootstrap();

    const channel = supabase
      .channel(`chat:${dialogKey}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'dms_messages',
          filter: `thread_id=eq.${dialogKey}`,
        },
        (payload) => {
          const row = payload.new as any;
          if (!row) return;
          const message = mapRowToMessage(row, dialogKey, currentUserId, otherUserId);
          addMessages(dialogKey, [message]);
        }
      );

    channel
      .subscribe()
      .catch((err) => console.error('[useChat] Failed to subscribe to realtime', err));

    channelRef.current = channel;

    return () => {
      cancelled = true;
      clearDialog(dialogKey);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [
    dialogKey,
    currentUserId,
    otherUserId,
    pageSize,
    addMessages,
    clearDialog,
    setMessages,
  ]);

  const loadOlder = useCallback(async () => {
    if (!dialogKey || isFetchingOlderRef.current) {
      return;
    }

    const oldest = messages[0];
    if (!oldest) {
      return;
    }

    const oldestNumericId = Number(oldest.id);
    if (!Number.isFinite(oldestNumericId)) {
      return;
    }

    isFetchingOlderRef.current = true;
    try {
      const { data, error: fetchError } = await supabase
        .from('dms_messages')
        .select('id, sender_id, body, created_at')
        .eq('thread_id', dialogKey)
        .lt('id', oldestNumericId)
        .order('id', { ascending: false })
        .limit(pageSize);

      if (fetchError) {
        throw fetchError;
      }

      if (!data || data.length === 0) {
        setHasMore(false);
        return;
      }

      const baseMessages = data
        .map((row) => mapRowToMessage(row, dialogKey, currentUserId, otherUserId))
        .reverse();
      const hydrated = await hydrateReceiptsSafe(baseMessages, currentUserId, otherUserId);

      addMessages(dialogKey, hydrated);

      if (data.length < pageSize) {
        setHasMore(false);
      }
    } catch (err) {
      console.error('[useChat] Failed to load older messages', err);
      setError((prev) => prev ?? 'Failed to load older messages');
    } finally {
      isFetchingOlderRef.current = false;
    }
  }, [
    addMessages,
    currentUserId,
    dialogKey,
    messages,
    otherUserId,
    pageSize,
  ]);

  return {
    messages,
    isBootstrapped,
    isLoading,
    error,
    hasMore,
    loadOlder,
  };
}


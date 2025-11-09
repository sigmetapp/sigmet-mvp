/**
 * Hook responsible for sending messages with optimistic UI updates.
 */

'use client';

import { useCallback, useRef, useState } from 'react';
import { nanoid } from 'nanoid';
import { supabase } from '@/lib/supabaseClient';
import { useChatStore } from '@/store/chatStore';
import type { Message } from '@/types/chat';

type UseSendMessageParams = {
  dialogId: string | null;
  currentUserId: string;
  otherUserId: string;
};

type UseSendMessageResult = {
  sendMessage: (text: string) => Promise<void>;
  isSending: boolean;
};

export function useSendMessage({
  dialogId,
  currentUserId,
  otherUserId,
}: UseSendMessageParams): UseSendMessageResult {
  const addMessages = useChatStore((state) => state.addMessages);
  const updateMessage = useChatStore((state) => state.updateMessage);
  const removeMessage = useChatStore((state) => state.removeMessage);
  const pendingTempIdsRef = useRef<Set<string>>(new Set());
  const [isSending, setIsSending] = useState(false);

  const sendMessage = useCallback(
    async (rawText: string) => {
      if (!dialogId) {
        throw new Error('Dialog is not selected');
      }
      const text = rawText.trim();
      if (!text) {
        return;
      }

      const tempId = `temp-${nanoid(12)}`;
      if (pendingTempIdsRef.current.has(tempId)) {
        return;
      }

      const idempotencyKey = nanoid(21);
      const createdAt = new Date().toISOString();

      const optimisticMessage: Message = {
        id: tempId,
        dialogId,
        senderId: currentUserId,
        receiverId: otherUserId,
        text,
        createdAt,
        status: 'sending',
      };

      pendingTempIdsRef.current.add(tempId);
      addMessages(dialogId, [optimisticMessage]);
      setIsSending(true);

      try {
        const { data, error } = await supabase
          .from('dms_messages')
          .insert({
            thread_id: dialogId,
            sender_id: currentUserId,
            body: text,
            client_msg_id: idempotencyKey,
          })
          .select('id, sender_id, body, created_at')
          .single();

        if (error) {
          throw error;
        }

        const serverId = String(data.id);
        updateMessage(dialogId, tempId, {
          id: serverId,
          createdAt: data.created_at,
          text: data.body ?? text,
          status: 'sent',
        });
      } catch (error) {
        console.error('[useSendMessage] Failed to send message', error);
        removeMessage(dialogId, tempId);
        throw error instanceof Error ? error : new Error('Failed to send message');
      } finally {
        pendingTempIdsRef.current.delete(tempId);
        setIsSending(false);
      }
    },
    [dialogId, currentUserId, otherUserId, addMessages, updateMessage, removeMessage]
  );

  return { sendMessage, isSending };
}


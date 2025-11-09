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
  sendMessage: (
    text: string,
    replyToMessageId?: string | number,
    replyToMessage?: Message['replyToMessage']
  ) => Promise<void>;
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
    async (
      rawText: string,
      replyToMessageId?: string | number,
      replyToMessage?: Message['replyToMessage']
    ) => {
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
        replyToMessageId: replyToMessageId ? String(replyToMessageId) : undefined,
        replyToMessage,
      };

      pendingTempIdsRef.current.add(tempId);
      addMessages(dialogId, [optimisticMessage]);
      setIsSending(true);

      try {
        const insertData: any = {
          thread_id: dialogId,
          sender_id: currentUserId,
          body: text,
          client_msg_id: idempotencyKey,
        };

        if (replyToMessageId) {
          insertData.reply_to_message_id = typeof replyToMessageId === 'string' 
            ? Number(replyToMessageId) 
            : replyToMessageId;
        }

        const { data, error } = await supabase
          .from('dms_messages')
          .insert(insertData)
          .select('id, sender_id, body, created_at, reply_to_message_id')
          .single();

        if (error) {
          throw error;
        }

        // Fetch reply message if exists (use passed value or fetch from DB)
        let finalReplyToMessage: Message['replyToMessage'] = replyToMessage;
        if (data.reply_to_message_id && !finalReplyToMessage) {
          const { data: replyData } = await supabase
            .from('dms_messages')
            .select('id, sender_id, body, created_at')
            .eq('id', data.reply_to_message_id)
            .single();
          
          if (replyData) {
            finalReplyToMessage = {
              id: String(replyData.id),
              senderId: replyData.sender_id,
              text: replyData.body ?? '',
              createdAt: replyData.created_at,
            };
          }
        }

        const serverId = String(data.id);
        updateMessage(dialogId, tempId, {
          id: serverId,
          createdAt: data.created_at,
          text: data.body ?? text,
          status: 'sent',
          replyToMessageId: data.reply_to_message_id ? String(data.reply_to_message_id) : undefined,
          replyToMessage: finalReplyToMessage,
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


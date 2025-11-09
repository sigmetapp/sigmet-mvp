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
        // Use RPC function insert_dms_message if available, otherwise fallback to direct insert
        const threadId = Number(dialogId);
        if (isNaN(threadId)) {
          throw new Error('Invalid thread_id');
        }

        const replyToId = replyToMessageId 
          ? (typeof replyToMessageId === 'string' ? Number(replyToMessageId) : replyToMessageId)
          : null;

        // Try RPC function first
        let data: any = null;
        let error: any = null;

        try {
          const rpcParams: any = {
            p_thread_id: threadId,
            p_sender_id: currentUserId,
            p_body: text,
            p_kind: 'text',
            p_attachments: [],
            p_client_msg_id: idempotencyKey,
          };

          // Only include reply_to_message_id if it's not null
          if (replyToId !== null) {
            rpcParams.p_reply_to_message_id = replyToId;
          }

          const rpcResult = await (supabase as any).rpc('insert_dms_message', rpcParams);

          // RPC returns { data, error } format
          if (rpcResult?.error) {
            error = rpcResult.error;
          } else if (rpcResult?.data) {
            data = rpcResult.data;
          } else if (rpcResult && !rpcResult.error) {
            // Sometimes RPC returns data directly (not wrapped in { data, error })
            data = rpcResult;
          } else {
            // If no data or error, treat as error
            error = { message: 'RPC function returned no data' };
          }
        } catch (rpcErr: any) {
          // RPC call failed, will fallback to direct insert
          console.warn('[useSendMessage] RPC call failed, falling back to direct insert:', rpcErr);
          error = rpcErr;
        }

        // Fallback to direct insert if RPC failed
        if (error || !data) {
          const insertData: any = {
            thread_id: threadId,
            sender_id: currentUserId,
            body: text,
            kind: 'text',
            attachments: [],
            client_msg_id: idempotencyKey,
          };

          if (replyToId) {
            insertData.reply_to_message_id = replyToId;
          }

          const insertResult = await supabase
            .from('dms_messages')
            .insert(insertData)
            .select('id, sender_id, body, created_at, reply_to_message_id')
            .single();

          if (insertResult.error) {
            throw insertResult.error;
          }

          if (!insertResult.data) {
            throw new Error('Failed to insert message');
          }

          data = insertResult.data;
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
        console.error('[useSendMessage] Error details:', {
          dialogId,
          replyToMessageId,
          error: error instanceof Error ? error.message : String(error),
        });
        removeMessage(dialogId, tempId);
        const errorMessage = error instanceof Error 
          ? error.message 
          : (typeof error === 'object' && error !== null && 'message' in error)
            ? String((error as any).message)
            : 'Failed to send message';
        throw new Error(errorMessage);
      } finally {
        pendingTempIdsRef.current.delete(tempId);
        setIsSending(false);
      }
    },
    [dialogId, currentUserId, otherUserId, addMessages, updateMessage, removeMessage]
  );

  return { sendMessage, isSending };
}


import { create } from 'zustand';
import type { Message, MessageStatus } from '@/types/chat';

type MessagesByDialog = Record<string, Message[]>;

type ChatState = {
  messagesByDialog: MessagesByDialog;
  setMessages: (dialogId: string, messages: Message[]) => void;
  addMessages: (dialogId: string, messages: Message[]) => void;
  updateMessage: (
    dialogId: string,
    idOrTempId: string,
    patch: Partial<Message>
  ) => void;
  clearDialog: (dialogId: string) => void;
  removeMessage: (dialogId: string, id: string) => void;
};

const STATUS_PRIORITY: Record<MessageStatus, number> = {
  sending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
};

function sortMessages(messages: Message[]): Message[] {
  return [...messages].sort((a, b) => {
    if (a.createdAt !== b.createdAt) {
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    }
    return a.id.localeCompare(b.id);
  });
}

function mergeMessage(existing: Message, incoming: Message): Message {
  const next: Message = { ...existing, ...incoming };
  // Preserve reply information - prefer existing if both exist, otherwise use incoming
  if (existing.replyToMessage || incoming.replyToMessage) {
    next.replyToMessage = incoming.replyToMessage ?? existing.replyToMessage;
  }
  if (existing.replyToMessageId || incoming.replyToMessageId) {
    next.replyToMessageId = incoming.replyToMessageId ?? existing.replyToMessageId;
  }
  if (existing.status && incoming.status) {
    const existingPriority = STATUS_PRIORITY[existing.status] ?? -1;
    const incomingPriority = STATUS_PRIORITY[incoming.status] ?? -1;
    next.status = incomingPriority >= existingPriority ? incoming.status : existing.status;
  } else if (incoming.status) {
    next.status = incoming.status;
  } else if (existing.status) {
    next.status = existing.status;
  }
  return next;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messagesByDialog: {},

  setMessages: (dialogId, messages) => {
    const key = String(dialogId);
    set((state) => ({
      messagesByDialog: {
        ...state.messagesByDialog,
        [key]: sortMessages(messages.map((message) => ({ ...message, dialogId: key }))),
      },
    }));
  },

  addMessages: (dialogId, messages) => {
    if (!messages.length) return;
    const key = String(dialogId);
    set((state) => {
      const existing = state.messagesByDialog[key] ?? [];
      const merged = new Map<string, Message>();
      for (const message of existing) {
        merged.set(message.id, message);
      }
      for (const message of messages) {
        const normalized: Message = { ...message, dialogId: key };
        const current = merged.get(normalized.id);
        if (current) {
          merged.set(normalized.id, mergeMessage(current, normalized));
        } else {
          merged.set(normalized.id, normalized);
        }
      }
      return {
        messagesByDialog: {
          ...state.messagesByDialog,
          [key]: sortMessages(Array.from(merged.values())),
        },
      };
    });
  },

  updateMessage: (dialogId, idOrTempId, patch) => {
    const key = String(dialogId);
    set((state) => {
      const messages = state.messagesByDialog[key];
      if (!messages || messages.length === 0) {
        return state;
      }

      const normalizedPatch: Partial<Message> = { ...patch };
      
      // Remove undefined values to avoid overwriting existing data
      if (normalizedPatch.replyToMessage === undefined) {
        delete normalizedPatch.replyToMessage;
      }
      if (normalizedPatch.replyToMessageId === undefined) {
        delete normalizedPatch.replyToMessageId;
      }
      
      if (normalizedPatch.status) {
        const desiredPriority = STATUS_PRIORITY[normalizedPatch.status];
        if (desiredPriority === undefined) {
          delete normalizedPatch.status;
        }
      }

      let index = messages.findIndex((message) => message.id === idOrTempId);
      if (index === -1 && patch.id) {
        index = messages.findIndex((message) => message.id === patch.id);
      }

      if (index === -1) {
        return state;
      }

      const target = messages[index];
      let nextStatus = target.status;
      if (normalizedPatch.status) {
        const currentPriority = target.status ? STATUS_PRIORITY[target.status] : -1;
        const nextPriority = STATUS_PRIORITY[normalizedPatch.status];
        if (nextPriority >= currentPriority) {
          nextStatus = normalizedPatch.status;
        }
        delete normalizedPatch.status;
      }

      // Preserve reply information - prefer patch if provided, otherwise keep existing
      const finalReplyToMessage = normalizedPatch.replyToMessage !== undefined
        ? normalizedPatch.replyToMessage
        : target.replyToMessage;
      const finalReplyToMessageId = normalizedPatch.replyToMessageId !== undefined
        ? normalizedPatch.replyToMessageId
        : target.replyToMessageId;

      // Debug logging
      if (finalReplyToMessageId && !finalReplyToMessage) {
        console.warn('[chatStore] updateMessage: replyToMessageId exists but no replyToMessage', {
          messageId: target.id,
          replyToMessageId: finalReplyToMessageId,
          patch: normalizedPatch,
          target: target,
        });
      }

      const updatedMessage: Message = {
        ...target,
        ...normalizedPatch,
        id: normalizedPatch.id ?? target.id,
        status: nextStatus,
        // Explicitly set reply information
        replyToMessage: finalReplyToMessage,
        replyToMessageId: finalReplyToMessageId,
      };

      const nextMessages = messages.filter((_, idx) => idx !== index);

      if (patch.id && patch.id !== target.id) {
        // Remove any existing message that already has the new id to avoid duplicates
        for (let i = nextMessages.length - 1; i >= 0; i -= 1) {
          if (nextMessages[i].id === patch.id) {
            nextMessages.splice(i, 1);
          }
        }
      }

      nextMessages.push(updatedMessage);

      return {
        messagesByDialog: {
          ...state.messagesByDialog,
          [key]: sortMessages(nextMessages),
        },
      };
    });
  },

  clearDialog: (dialogId) => {
    const key = String(dialogId);
    set((state) => {
      if (!state.messagesByDialog[key]) {
        return state;
      }
      const next = { ...state.messagesByDialog };
      delete next[key];
      return { messagesByDialog: next };
    });
  },

  removeMessage: (dialogId, id) => {
    const key = String(dialogId);
    set((state) => {
      const existing = state.messagesByDialog[key];
      if (!existing) return state;
      const filtered = existing.filter((message) => message.id !== id);
      return {
        messagesByDialog: {
          ...state.messagesByDialog,
          [key]: filtered,
        },
      };
    });
  },
}));

export function getMessages(dialogId: string): Message[] {
  return useChatStore.getState().messagesByDialog[String(dialogId)] ?? [];
}


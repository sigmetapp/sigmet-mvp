'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useChat } from '@/hooks/useChat';
import { useSendMessage } from '@/hooks/useSendMessage';
import { MessageItem } from '@/components/chat/MessageItem';
import type { Message } from '@/types/chat';
import { markDelivered, markRead } from '@/lib/receipts';
import {
  leaveDmChannel,
  sendDeliveredReceipt,
  sendReadReceipt,
  subscribeToReceipts,
} from '@/lib/realtime';

type ChatViewProps = {
  dialogId: string;
  currentUserId: string;
  otherUserId: string;
};

const READ_FLUSH_DELAY = 320;

export default function ChatView({ dialogId, currentUserId, otherUserId }: ChatViewProps) {
  const {
    messages,
    isBootstrapped,
    isLoading,
    error,
    hasMore,
    loadOlder,
  } = useChat(dialogId, {
    currentUserId,
    otherUserId,
  });

  const { sendMessage, isSending } = useSendMessage({
    dialogId,
    currentUserId,
    otherUserId,
  });

  const [draft, setDraft] = useState('');
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);

  const deliveredRef = useRef<Set<string>>(new Set());
  const readRef = useRef<Set<string>>(new Set());
  const pendingReadRef = useRef<Set<string>>(new Set());
  const flushTimeoutRef = useRef<number | null>(null);
  const receiptsChannelRef = useRef<RealtimeChannel | null>(null);

  const flushRead = useCallback(async () => {
    const ids = Array.from(pendingReadRef.current);
    if (ids.length === 0) {
      return;
    }

    pendingReadRef.current.clear();
    const timestamp = new Date().toISOString();

    try {
      await markRead(ids, currentUserId);
      await sendReadReceipt(dialogId, {
        messageIds: ids,
        toUserId: otherUserId,
        readAt: timestamp,
      });
      ids.forEach((id) => readRef.current.add(id));
    } catch (err) {
      console.error('[ChatView] Failed to mark messages as read', err);
    }
  }, [currentUserId, dialogId, otherUserId]);

  const scheduleReadFlush = useCallback(
    (immediate = false) => {
      if (flushTimeoutRef.current) {
        clearTimeout(flushTimeoutRef.current);
        flushTimeoutRef.current = null;
      }

      if (immediate) {
        flushTimeoutRef.current = window.setTimeout(() => {
          void flushRead();
          flushTimeoutRef.current = null;
        }, 0);
        return;
      }

      flushTimeoutRef.current = window.setTimeout(() => {
        void flushRead();
        flushTimeoutRef.current = null;
      }, READ_FLUSH_DELAY);
    },
    [flushRead]
  );

  useEffect(() => {
    let mounted = true;

    subscribeToReceipts(dialogId, currentUserId)
      .then((channel) => {
        if (!mounted) {
          void leaveDmChannel(dialogId);
          return;
        }
        receiptsChannelRef.current = channel;
      })
      .catch((err) => console.error('[ChatView] Failed to subscribe receipts channel', err));

    const handleFocus = () => {
      scheduleReadFlush(true);
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);

    return () => {
      mounted = false;
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
      if (flushTimeoutRef.current) {
        clearTimeout(flushTimeoutRef.current);
        flushTimeoutRef.current = null;
      }
      pendingReadRef.current.clear();
      deliveredRef.current.clear();
      readRef.current.clear();
      void leaveDmChannel(dialogId);
      receiptsChannelRef.current = null;
    };
  }, [dialogId, currentUserId, scheduleReadFlush]);

  useEffect(() => {
    if (!messages.length) {
      return;
    }

    const now = new Date().toISOString();

    for (const message of messages) {
      if (message.senderId === currentUserId) {
        continue;
      }

      if (!deliveredRef.current.has(message.id)) {
        deliveredRef.current.add(message.id);
        void markDelivered(message.id, currentUserId).catch((err) =>
          console.error('[ChatView] Failed to mark delivered', err)
        );
        void sendDeliveredReceipt(dialogId, {
          messageId: message.id,
          toUserId: message.senderId,
          deliveredAt: now,
        }).catch((err) =>
          console.error('[ChatView] Failed to broadcast delivered receipt', err)
        );
      }

      if (!readRef.current.has(message.id)) {
        pendingReadRef.current.add(message.id);
      }
    }

    scheduleReadFlush();
  }, [messages, currentUserId, dialogId, scheduleReadFlush]);

  useEffect(() => {
    if (!messagesEndRef.current || !isAtBottom) {
      return;
    }
    messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isAtBottom]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const nearBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight < 100;
      setIsAtBottom(nearBottom);
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (!loadMoreSentinelRef.current || !isBootstrapped || !hasMore) {
      return;
    }

    const sentinel = loadMoreSentinelRef.current;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void loadOlder();
        }
      },
      {
        root: scrollContainerRef.current,
        rootMargin: '120px',
      }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [isBootstrapped, hasMore, loadOlder]);

  const handleSend = useCallback(async () => {
    if (!draft.trim()) return;
    const text = draft.trim();
    
    // Only use reply if message ID is not temporary and belongs to current dialog
    let replyToMessageId: string | number | undefined = undefined;
    if (replyingTo?.id && !replyingTo.id.startsWith('temp-')) {
      // Verify that the message belongs to the current dialog
      if (replyingTo.dialogId === dialogId) {
        replyToMessageId = replyingTo.id;
      } else {
        console.warn('[ChatView] Reply message belongs to different dialog, skipping reply', {
          messageDialogId: replyingTo.dialogId,
          currentDialogId: dialogId,
        });
      }
    }
    
    const replyToMessage = replyingTo && replyToMessageId
      ? {
          id: replyingTo.id,
          senderId: replyingTo.senderId,
          text: replyingTo.text,
          createdAt: replyingTo.createdAt,
        }
      : undefined;
    
    console.log('[ChatView] Sending message with reply:', {
      replyToMessageId,
      replyToMessage,
      dialogId,
    });
    
    try {
      setDraft('');
      setReplyingTo(null);
      await sendMessage(text, replyToMessageId, replyToMessage);
    } catch (err) {
      console.error('[ChatView] Failed to send message', err);
      setDraft(text); // restore draft on failure
      // Restore reply state if error occurred
      if (replyingTo && replyToMessageId) {
        setReplyingTo(replyingTo);
      }
    }
  }, [draft, sendMessage, replyingTo, dialogId]);

  const handleReply = useCallback((message: Message) => {
    setReplyingTo(message);
    // Focus the textarea
    const textarea = document.querySelector('textarea');
    if (textarea) {
      textarea.focus();
    }
  }, []);

  const handleCancelReply = useCallback(() => {
    setReplyingTo(null);
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        void handleSend();
      }
    },
    [handleSend]
  );

  if (isLoading && !isBootstrapped) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-white/60 text-sm">Loading messages…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-red-400 text-sm">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-2"
      >
        <div ref={loadMoreSentinelRef} className="h-1" />
        {messages.map((message) => {
          const isOwn = message.senderId === currentUserId;
          return (
            <MessageItem
              key={message.id}
              message={message}
              isOwn={isOwn}
              onReply={handleReply}
            />
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-white/10 px-4 py-3">
        {/* Reply preview */}
        {replyingTo && (
          <div className="mb-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-[10px] text-white/60 mb-1">
                Replying to:
              </div>
              <div className="text-xs text-white/80 line-clamp-2">
                {replyingTo.text}
              </div>
            </div>
            <button
              type="button"
              onClick={handleCancelReply}
              className="flex-shrink-0 px-2 py-1 rounded text-[10px] text-white/60 hover:text-white/80 hover:bg-white/10 transition"
              title="Cancel reply"
            >
              ✕
            </button>
          </div>
        )}

        <div className="flex gap-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={replyingTo ? "Type your reply…" : "Type a message…"}
            disabled={isSending}
            className="flex-1 px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={1}
            style={{ minHeight: '40px', maxHeight: '120px' }}
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!draft.trim() || isSending}
            className="px-6 py-2 rounded-lg bg-blue-500 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-600 transition"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}


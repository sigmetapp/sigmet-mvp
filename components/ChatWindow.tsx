/**
 * ChatWindow component - renders messages with status indicators
 * Supports infinite scroll up for pagination
 */

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useChat } from '@/hooks/useChat';
import { messageToCursor } from '@/lib/chat/cursors';
import type { MessageUI } from '@/lib/chat/types';

type ChatWindowProps = {
  threadId: string;
  currentUserId: string;
};

export default function ChatWindow({ threadId, currentUserId }: ChatWindowProps) {
  const { messages, send, retry, loadOlder, isBootstrapped, isLoading, error } = useChat(threadId);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  // Auto-scroll to bottom on new messages when at bottom
  useEffect(() => {
    if (isAtBottom && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isAtBottom]);

  // Handle scroll position
  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current) return;

    const container = scrollContainerRef.current;
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    setIsAtBottom(isNearBottom);
  }, []);

  // Load older messages when scrolling up
  useEffect(() => {
    if (!loadMoreSentinelRef.current || !isBootstrapped || messages.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && messages.length > 0) {
          const oldestMessage = messages[0];
          const cursor = messageToCursor(oldestMessage);
          loadOlder(cursor).catch((err) => {
            console.error('Error loading older messages', err);
          });
        }
      },
      { root: scrollContainerRef.current, rootMargin: '100px' }
    );

    observer.observe(loadMoreSentinelRef.current);

    return () => observer.disconnect();
  }, [isBootstrapped, messages, loadOlder]);

  // Handle send
  const handleSend = useCallback(async () => {
    if (!messageText.trim() || sending) return;

    setSending(true);
    try {
      await send(messageText.trim());
      setMessageText(''); // Clear input immediately for perceived latency
    } catch (err) {
      console.error('Error sending message', err);
    } finally {
      setSending(false);
    }
  }, [messageText, sending, send]);

  // Handle key press
  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // Status indicator component
  const StatusIndicator = ({ status }: { status?: MessageUI['status'] }) => {
    if (!status || status === 'sending') {
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 16 16"
          width="12"
          height="12"
          className="text-white/40 animate-pulse"
          fill="currentColor"
        >
          <circle cx="8" cy="8" r="1.5" />
        </svg>
      );
    }

    if (status === 'failed') {
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 16 16"
          width="12"
          height="12"
          className="text-red-400"
          fill="currentColor"
        >
          <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z" />
          <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
        </svg>
      );
    }

    if (status === 'read') {
      // Double check filled (blue/white)
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 16 15"
          width="12"
          height="12"
          className="text-blue-300"
          fill="currentColor"
        >
          <path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.879a.32.32 0 0 1-.484.033l-.358-.325a.319.319 0 0 0-.484.032l-.378.483a.418.418 0 0 0 .036.541l1.32 1.266c.143.14.361.125.484-.033l6.272-8.175a.366.366 0 0 0-.063-.51zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879a.32.32 0 0 1-.484.033L1.891 7.769a.366.366 0 0 0-.515.006l-.423.433a.364.364 0 0 0 .006.514l3.258 3.185c.143.14.361.125.484-.033l6.272-8.175a.365.365 0 0 0-.063-.51z" />
        </svg>
      );
    }

    if (status === 'delivered') {
      // Double check hollow (gray)
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 16 15"
          width="12"
          height="12"
          className="text-white/70"
          fill="currentColor"
        >
          <path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.879a.32.32 0 0 1-.484.033l-.358-.325a.319.319 0 0 0-.484.032l-.378.483a.418.418 0 0 0 .036.541l1.32 1.266c.143.14.361.125.484-.033l6.272-8.175a.366.366 0 0 0-.063-.51zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879a.32.32 0 0 1-.484.033L1.891 7.769a.366.366 0 0 0-.515.006l-.423.433a.364.364 0 0 0 .006.514l3.258 3.185c.143.14.361.125.484-.033l6.272-8.175a.365.365 0 0 0-.063-.51z" />
        </svg>
      );
    }

    // Single check (sent)
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 16 16"
        width="12"
        height="12"
        className="text-white/50"
        fill="currentColor"
      >
        <path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z" />
      </svg>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-white/60">Loading messages...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-red-400">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages container */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-2"
      >
        {/* Load more sentinel */}
        <div ref={loadMoreSentinelRef} className="h-1" />

        {/* Messages */}
        {messages.map((msg) => {
          const isMine = msg.sender_id === currentUserId;

          return (
            <div
              key={msg.tempId || msg.id}
              className={`flex gap-2 ${isMine ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[78%] px-4 py-2.5 rounded-2xl ${
                  isMine
                    ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-br-sm'
                    : 'bg-white/10 text-white rounded-bl-sm border border-white/20'
                }`}
              >
                <div className="whitespace-pre-wrap text-sm leading-relaxed">{msg.text}</div>
                <div className={`flex items-center gap-2 mt-1.5 ${isMine ? 'justify-end' : 'justify-start'}`}>
                  <span className="text-[10px] text-white/60">
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {isMine && <StatusIndicator status={msg.status} />}
                  {msg.status === 'failed' && msg.tempId && (
                    <button
                      type="button"
                      onClick={() => retry(msg.tempId!)}
                      className="px-2 py-0.5 rounded text-[10px] bg-white/20 hover:bg-white/30 transition"
                    >
                      Retry
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-white/10 px-4 py-3">
        <div className="flex gap-2">
          <textarea
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type a message..."
            disabled={sending || !isBootstrapped}
            className="flex-1 px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={1}
            style={{ minHeight: '40px', maxHeight: '120px' }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!messageText.trim() || sending || !isBootstrapped}
            className="px-6 py-2 rounded-lg bg-blue-500 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-600 transition"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

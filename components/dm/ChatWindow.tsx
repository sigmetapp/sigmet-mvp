"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { DMMessage } from "@/lib/dm/useDirectMessages";
import { Loader2, Send } from "lucide-react";

export type DMChatWindowProps = {
  userId: string | null;
  title?: string;
  messages: DMMessage[];
  sending: boolean;
  onSend: (text: string) => Promise<void>;
  isOtherTyping: boolean;
  onTyping: (typing: boolean) => void;
  onLoadMore: () => Promise<void>;
  hasMore: boolean;
  onMarkRead?: (upToId?: number) => void;
};

export default function DMChatWindow({ userId, title, messages, sending, onSend, isOtherTyping, onTyping, onLoadMore, hasMore, onMarkRead }: DMChatWindowProps) {
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const atBottomRef = useRef(true);
  const markReadTimeoutRef = useRef<any>(null);
  const typingDebounceRef = useRef<any>(null);

  const lastMessage = useMemo(() => (messages.length > 0 ? messages[messages.length - 1]! : null), [messages]);

  // Auto-scroll on new messages if at bottom
  useEffect(() => {
    if (!scrollRef.current) return;
    if (atBottomRef.current) {
      scrollToBottom();
    }
  }, [messages]);

  useEffect(() => {
    // Auto mark-as-read when a new message from other arrives
    if (!lastMessage || !onMarkRead) return;
    if (lastMessage.sender_id === userId) return;

    if (markReadTimeoutRef.current) clearTimeout(markReadTimeoutRef.current);
    markReadTimeoutRef.current = setTimeout(() => onMarkRead(lastMessage.id), 300);
  }, [lastMessage, onMarkRead, userId]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 24;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    atBottomRef.current = atBottom;
  };

  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  };

  const handleSend = async () => {
    const value = text.trim();
    if (!value) return;
    await onSend(value);
    setText("");
    onTyping(false);
    requestAnimationFrame(scrollToBottom);
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement> = async (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      await handleSend();
    }
  };

  const handleChange: React.ChangeEventHandler<HTMLTextAreaElement> = (e) => {
    setText(e.target.value);
    if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);
    onTyping(true);
    typingDebounceRef.current = setTimeout(() => onTyping(false), 1500);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-zinc-200 p-3 dark:border-zinc-800">
        <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{title || "Диалог"}</div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3" ref={scrollRef} onScroll={onScroll}>
        {hasMore ? (
          <div className="mb-3 flex justify-center">
            <button
              onClick={() => onLoadMore()}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Загрузить ещё
            </button>
          </div>
        ) : null}

        <ul className="space-y-2">
          {messages.map((m) => {
            const mine = m.sender_id === userId;
            return (
              <li key={m.id} className="flex">
                <div className={mine ? "ml-auto max-w-[70%]" : "mr-auto max-w-[70%]"}>
                  <div className={mine ? "rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900" : "rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"}>
                    {m.body}
                  </div>
                  <div className="mt-0.5 text-right text-[10px] text-zinc-400">{new Date(m.created_at).toLocaleTimeString()}</div>
                </div>
              </li>
            );
          })}
        </ul>

        {isOtherTyping ? (
          <div className="mt-2 text-xs text-zinc-500">Печатает…</div>
        ) : null}
      </div>

      <div className="border-t border-zinc-200 p-2 dark:border-zinc-800">
        <div className="relative">
          <textarea
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Напишите сообщение"
            rows={2}
            className="block w-full resize-none rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
          />
          <button
            onClick={handleSend}
            disabled={sending || text.trim().length === 0}
            className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Отправить
          </button>
        </div>
      </div>
    </div>
  );
}

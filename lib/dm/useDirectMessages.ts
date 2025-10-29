"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { openThreadChannel, sendTyping as rtSendTyping, subscribe as rtSubscribe, unsubscribe as rtUnsubscribe } from "@/lib/dm/realtime";

export type DMMessage = {
  id: number;
  thread_id: number;
  sender_id: string;
  kind: "text";
  body: string | null;
  attachments?: any;
  created_at: string;
  edited_at?: string | null;
};

export type DMThreadSummary = {
  thread: {
    id: number;
    is_group: boolean;
    title: string | null;
    created_by: string;
    created_at: string;
    updated_at: string | null;
    last_message_at: string | null;
    last_message_id: number | null;
    last_message?: DMMessage | null;
  };
  participant: {
    thread_id: number;
    role: string;
    last_read_message_id: number | null;
    notifications_muted: boolean | null;
  };
  unread_count: number;
};

export type UseDMOptions = {
  useMock?: boolean;
};

export type UseDMReturn = {
  mode: "mock" | "api";
  userId: string | null;
  threads: DMThreadSummary[];
  threadsLoading: boolean;
  refreshThreads: () => Promise<void>;
  selectedThreadId: number | null;
  selectThread: (id: number) => void;

  messages: DMMessage[];
  messagesLoading: boolean;
  hasMore: boolean;
  loadMore: () => Promise<void>;

  sendMessage: (body: string) => Promise<void>;
  sending: boolean;

  markRead: (upToMessageId?: number) => Promise<void>;

  isOtherTyping: boolean;
  setTyping: (typing: boolean) => void;

  muteThread: (muted: boolean) => Promise<void>;
  createThread: (participantIds: string[], title?: string | null) => Promise<number | null>;
};

function nowISO() {
  return new Date().toISOString();
}

// Simple in-memory mock store shared per hook instance
function createMockData(currentUserId: string | null) {
  // Deterministic users
  const me = currentUserId ?? "user_me";
  const other = "user_alice";

  const threadId = 1;
  let nextMsgId = 4;

  const threads: DMThreadSummary[] = [
    {
      thread: {
        id: threadId,
        is_group: false,
        title: "Alice",
        created_by: other,
        created_at: nowISO(),
        updated_at: nowISO(),
        last_message_at: nowISO(),
        last_message_id: 3,
        last_message: {
          id: 3,
          thread_id: threadId,
          sender_id: other,
          kind: "text",
          body: "See you soon!",
          created_at: nowISO(),
        },
      },
      participant: {
        thread_id: threadId,
        role: "member",
        last_read_message_id: 2,
        notifications_muted: false,
      },
      unread_count: 1,
    },
  ];

  const messages: DMMessage[] = [
    { id: 1, thread_id: threadId, sender_id: other, kind: "text", body: "Hey there 👋", created_at: nowISO() },
    { id: 2, thread_id: threadId, sender_id: me, kind: "text", body: "Hi! How are you?", created_at: nowISO() },
    { id: 3, thread_id: threadId, sender_id: other, kind: "text", body: "See you soon!", created_at: nowISO() },
  ];

  return {
    me,
    other,
    threads,
    messages,
    nextId: () => ++nextMsgId,
  };
}

export function useDirectMessages(options?: UseDMOptions): UseDMReturn {
  const [userId, setUserId] = useState<string | null>(null);

  // Mode toggling: default to mock unless NEXT_PUBLIC_DM_USE_MOCK === 'false'
  const prefersMock = typeof process !== "undefined" && process.env.NEXT_PUBLIC_DM_USE_MOCK !== "false";
  const mode: "mock" | "api" = options?.useMock ?? prefersMock ? "mock" : "api";

  // Mock store per instance
  const mockRef = useRef<ReturnType<typeof createMockData> | null>(null);

  const [threads, setThreads] = useState<DMThreadSummary[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);

  const [messages, setMessages] = useState<DMMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const oldestMessageIdRef = useRef<number | null>(null);

  const [sending, setSending] = useState(false);
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const typingLocalRef = useRef(false);
  const typingTimeoutRef = useRef<any>(null);

  // Resolve current user id
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!mounted) return;
        setUserId(data.user?.id ?? null);
      } catch {
        if (!mounted) return;
        setUserId(null);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Initialize mock store
  useEffect(() => {
    if (mode === "mock" && !mockRef.current) {
      mockRef.current = createMockData(userId);
      setThreads(mockRef.current.threads);
      setSelectedThreadId(mockRef.current.threads[0]?.thread.id ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, userId]);

  // Fetch threads (API)
  const refreshThreads = useCallback(async () => {
    if (mode === "mock") return; // mock threads are local
    setThreadsLoading(true);
    try {
      const res = await fetch("/api/dms/threads.list");
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Failed to load threads");
      const data = (json.threads || []) as DMThreadSummary[];
      setThreads(data);
      if (selectedThreadId == null && data.length > 0) {
        setSelectedThreadId(data[0]!.thread.id);
      }
    } catch (e) {
      // no-op, keep prior state
    } finally {
      setThreadsLoading(false);
    }
  }, [mode, selectedThreadId]);

  // Load initial threads for API mode
  useEffect(() => {
    if (mode === "api") {
      void refreshThreads();
    }
  }, [mode, refreshThreads]);

  // Select thread
  const selectThread = useCallback((id: number) => {
    setSelectedThreadId(id);
  }, []);

  // Load messages for a thread
  const loadMessages = useCallback(async (threadId: number, beforeId?: number) => {
    if (mode === "mock") {
      const store = mockRef.current!;
      const all = store.messages.filter((m) => m.thread_id === threadId);
      // No pagination for mock; pretend all loaded
      setMessages(all);
      oldestMessageIdRef.current = all.length > 0 ? all[0]!.id : null;
      setHasMore(false);
      return;
    }

    setMessagesLoading(true);
    try {
      const url = new URL(location.origin + "/api/dms/messages.list");
      url.searchParams.set("thread_id", String(threadId));
      if (beforeId) url.searchParams.set("before", String(beforeId));
      const res = await fetch(url.toString());
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Failed to load messages");
      const page: DMMessage[] = json.messages || [];

      if (beforeId) {
        setMessages((prev) => [...page.reverse(), ...prev]);
      } else {
        setMessages(page.reverse()); // newest last
      }
      const oldest = page.length > 0 ? page[page.length - 1]!.id : null;
      oldestMessageIdRef.current = oldest;
      setHasMore(Boolean(oldest));
    } catch (e) {
      // leave previous state
    } finally {
      setMessagesLoading(false);
    }
  }, [mode]);

  // Load on thread change
  useEffect(() => {
    if (selectedThreadId == null) return;
    void loadMessages(selectedThreadId);
  }, [selectedThreadId, loadMessages]);

  const loadMore = useCallback(async () => {
    if (selectedThreadId == null) return;
    const before = oldestMessageIdRef.current ?? undefined;
    if (!before) return;
    await loadMessages(selectedThreadId, before);
  }, [selectedThreadId, loadMessages]);

  // Sending
  const sendMessage = useCallback(async (body: string) => {
    if (!body.trim() || selectedThreadId == null) return;

    if (mode === "mock") {
      const store = mockRef.current!;
      setSending(true);
      try {
        const optimistic: DMMessage = {
          id: store.nextId(),
          thread_id: selectedThreadId,
          sender_id: store.me,
          kind: "text",
          body,
          created_at: nowISO(),
        };
        setMessages((prev) => [...prev, optimistic]);
        // Simulate other user typing and replying
        setIsOtherTyping(true);
        setTimeout(() => {
          setIsOtherTyping(false);
          const reply: DMMessage = {
            id: store.nextId(),
            thread_id: selectedThreadId,
            sender_id: store.other,
            kind: "text",
            body: "👍",
            created_at: nowISO(),
          };
          store.messages.push(reply);
          setMessages((prev) => [...prev, reply]);
          // Update threads unread counts
          setThreads((prev) => prev.map((t) => t.thread.id === selectedThreadId ? { ...t, unread_count: (t.unread_count ?? 0) + 1, thread: { ...t.thread, last_message: reply, last_message_id: reply.id, last_message_at: reply.created_at } } : t));
        }, 800);
      } finally {
        setSending(false);
      }
      return;
    }

    setSending(true);
    try {
      const res = await fetch("/api/dms/messages.send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thread_id: selectedThreadId, body, attachments: [] }),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Failed to send");
      const message: DMMessage = json.message;
      setMessages((prev) => [...prev, message]);
    } finally {
      setSending(false);
    }
  }, [mode, selectedThreadId]);

  // Mark read
  const markRead = useCallback(async (upToMessageId?: number) => {
    if (selectedThreadId == null) return;
    if (mode === "mock") {
      setThreads((prev) => prev.map((t) => t.thread.id === selectedThreadId ? { ...t, unread_count: 0, participant: { ...t.participant, last_read_message_id: upToMessageId ?? t.thread.last_message_id ?? t.participant.last_read_message_id ?? 0 } } : t));
      return;
    }

    const lastId = upToMessageId ?? (messages.length > 0 ? messages[messages.length - 1]!.id : undefined);
    if (!lastId) return;
    try {
      await fetch("/api/dms/messages.read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thread_id: selectedThreadId, up_to_message_id: lastId }),
      });
      // Update local unread
      setThreads((prev) => prev.map((t) => t.thread.id === selectedThreadId ? { ...t, unread_count: 0, participant: { ...t.participant, last_read_message_id: lastId } } : t));
    } catch {
      // ignore
    }
  }, [mode, selectedThreadId, messages]);

  // Typing
  const setTyping = useCallback((typing: boolean) => {
    typingLocalRef.current = typing;

    if (mode === "mock") {
      // In mock mode, only local echo is shown via send flow
      return;
    }

    if (selectedThreadId == null) return;
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    void rtSendTyping(typing, { userId: userId ?? undefined });

    if (typing) {
      typingTimeoutRef.current = setTimeout(() => {
        typingLocalRef.current = false;
        void rtSendTyping(false, { userId: userId ?? undefined });
      }, 4000);
    }
  }, [mode, selectedThreadId, userId]);

  // Mute
  const muteThread = useCallback(async (muted: boolean) => {
    if (selectedThreadId == null) return;
    if (mode === "mock") {
      setThreads((prev) => prev.map((t) => t.thread.id === selectedThreadId ? { ...t, participant: { ...t.participant, notifications_muted: muted } } : t));
      return;
    }

    await fetch("/api/dms/thread.mute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ thread_id: selectedThreadId, muted }),
    });
    setThreads((prev) => prev.map((t) => t.thread.id === selectedThreadId ? { ...t, participant: { ...t.participant, notifications_muted: muted } } : t));
  }, [mode, selectedThreadId]);

  // Create thread
  const createThread = useCallback(async (participantIds: string[], title?: string | null) => {
    if (mode === "mock") {
      const id = Math.floor(Math.random() * 100000) + 2;
      const summary: DMThreadSummary = {
        thread: {
          id,
          is_group: participantIds.length > 1,
          title: title ?? (participantIds.length === 1 ? "New chat" : "New group"),
          created_by: userId ?? "me",
          created_at: nowISO(),
          updated_at: nowISO(),
          last_message_at: null,
          last_message_id: null,
          last_message: null,
        },
        participant: { thread_id: id, role: "owner", last_read_message_id: null, notifications_muted: false },
        unread_count: 0,
      };
      setThreads((prev) => [summary, ...prev]);
      setSelectedThreadId(id);
      return id;
    }

    const res = await fetch("/api/dms/threads.create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participant_ids: participantIds, title: title ?? null }),
    });
    const json = await res.json();
    if (!json?.ok) return null;
    const summary: DMThreadSummary = {
      thread: json.thread,
      participant: { thread_id: json.thread.id, role: "member", last_read_message_id: null, notifications_muted: false },
      unread_count: 0,
    };
    setThreads((prev) => [summary, ...prev]);
    setSelectedThreadId(json.thread.id);
    return json.thread.id as number;
  }, [mode, userId]);

  // Realtime subscriptions for API mode
  useEffect(() => {
    if (mode !== "api" || selectedThreadId == null) return;

    const channel = openThreadChannel(selectedThreadId);
    let cancelled = false;

    (async () => {
      await rtSubscribe(
        // onMessage
        ({ type, payload }) => {
          if (cancelled) return;
          if (type === "message.insert") {
            const row = payload.new as DMMessage;
            if (row.thread_id !== selectedThreadId) return;
            setMessages((prev) => [...prev, row]);
          } else if (type === "message.update") {
            const row = payload.new as DMMessage;
            setMessages((prev) => prev.map((m) => (m.id === row.id ? { ...m, ...row } : m)));
          }
        },
        // onReceipt
        () => {
          // Best-effort: refresh threads to update unread counts
          void refreshThreads();
        },
        // onTyping
        (evt) => {
          if (evt.threadId === selectedThreadId) {
            setIsOtherTyping(Boolean(evt.typing && evt.userId !== userId));
          }
        }
      );
    })();

    return () => {
      cancelled = true;
      void rtUnsubscribe();
    };
  }, [mode, selectedThreadId, userId, refreshThreads]);

  // Memo mode
  const modeValue = useMemo(() => mode, [mode]);

  return {
    mode: modeValue,
    userId,
    threads,
    threadsLoading,
    refreshThreads,
    selectedThreadId,
    selectThread: setSelectedThreadId,

    messages,
    messagesLoading,
    hasMore,
    loadMore,

    sendMessage,
    sending,

    markRead,

    isOtherTyping,
    setTyping,

    muteThread,
    createThread,
  };
}

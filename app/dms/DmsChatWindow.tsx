'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { getOrCreateThread, listMessages, sendMessage, type Message, type Thread } from '@/lib/dms';
import { useDmRealtime } from '@/hooks/useDmRealtime';

type Props = {
  partnerId: string;
};

export default function DmsChatWindow({ partnerId }: Props) {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [partnerProfile, setPartnerProfile] = useState<{
    username: string | null;
    full_name: string | null;
    avatar_url: string | null;
  } | null>(null);
  const [isOnline, setIsOnline] = useState<boolean | null>(null);

  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);

  const [initialMessages, setInitialMessages] = useState<Message[]>([]);
  const [messages, setMessages] = useDmRealtime(thread?.id || null, initialMessages);

  const scrollRef = useRef<HTMLDivElement>(null);
  const presenceChannelRef = useRef<any>(null);

  const AVATAR_FALLBACK =
    "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='100%' height='100%' fill='%23222'/><circle cx='32' cy='24' r='14' fill='%23555'/><rect x='12' y='44' width='40' height='12' rx='6' fill='%23555'/></svg>";

  // Get current user
  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setCurrentUserId(user?.id || null);
    })();
  }, []);

  // Load partner profile
  useEffect(() => {
    if (!partnerId) return;
    (async () => {
      try {
        const { data, error: profError } = await supabase
          .from('profiles')
          .select('user_id, username, full_name, avatar_url')
          .eq('user_id', partnerId)
          .maybeSingle();

        if (profError) {
          console.error('Error loading profile:', profError);
          return;
        }

        if (data) {
          setPartnerProfile({
            username: data.username,
            full_name: data.full_name,
            avatar_url: data.avatar_url,
          });
        }
      } catch (err) {
        console.error('Error loading profile:', err);
      }
    })();
  }, [partnerId]);

  // Subscribe to partner presence
  useEffect(() => {
    if (!partnerId) return;

    const channel = supabase.channel(`presence:${partnerId}`, {
      config: { presence: { key: partnerId } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const isPartnerOnline = !!state[partnerId]?.[0];
        setIsOnline(isPartnerOnline);
      })
      .on('presence', { event: 'join' }, () => {
        setIsOnline(true);
      })
      .on('presence', { event: 'leave' }, () => {
        setIsOnline(false);
      })
      .subscribe();

    presenceChannelRef.current = channel;

    return () => {
      channel.unsubscribe();
      presenceChannelRef.current = null;
    };
  }, [partnerId]);

  // Get or create thread and load messages
  useEffect(() => {
    if (!currentUserId || !partnerId || currentUserId === partnerId) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      try {
        // Get or create thread
        const threadData = await getOrCreateThread(currentUserId, partnerId);
        if (cancelled) return;

        setThread(threadData);

        // Load messages
        const messagesData = await listMessages(threadData.id, 50);
        if (cancelled) return;

        // Reverse to show oldest first
        const reversed = messagesData.reverse();
        setInitialMessages(reversed);
        setMessages(reversed);
      } catch (err: any) {
        if (!cancelled) {
          console.error('Error loading thread/messages:', err);
          setError(err?.message || 'Failed to load conversation');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentUserId, partnerId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  // Handle send message with optimistic update
  async function handleSend() {
    if (!thread || !messageText.trim() || sending) return;

    const textToSend = messageText.trim();
    setMessageText('');
    setSending(true);

    // Optimistic update
    const optimisticMessage: Message = {
      id: Date.now(), // Temporary ID
      thread_id: thread.id,
      sender_id: currentUserId!,
      kind: 'text',
      body: textToSend,
      attachments: [],
      created_at: new Date().toISOString(),
      edited_at: null,
      deleted_at: null,
    };

    const previousMessages = messages;
    setMessages([...messages, optimisticMessage]);

    try {
      const sentMessage = await sendMessage(thread.id, textToSend, []);
      // Replace optimistic message with real one
      setMessages((prev) =>
        prev.map((m) => (m.id === optimisticMessage.id ? sentMessage : m))
      );
    } catch (err: any) {
      console.error('Error sending message:', err);
      // Rollback on error
      setMessages(previousMessages);
      setMessageText(textToSend);
      setError(err?.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  }

  function formatTime(date: string): string {
    return new Date(date).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function formatDate(date: string): string {
    const d = new Date(date);
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);

    if (d.toDateString() === now.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString();
  }

  if (loading) {
    return (
      <div className="card card-glow h-full flex items-center justify-center">
        <div className="text-white/70">Loading conversation...</div>
      </div>
    );
  }

  if (error && !thread) {
    return (
      <div className="card card-glow h-full flex items-center justify-center">
        <div className="text-red-400">{error}</div>
      </div>
    );
  }

  const partnerName =
    partnerProfile?.full_name ||
    partnerProfile?.username ||
    partnerId.slice(0, 8);
  const partnerAvatar = partnerProfile?.avatar_url || AVATAR_FALLBACK;

  return (
    <div className="card card-glow flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={partnerAvatar}
            alt={partnerName}
            className="h-10 w-10 rounded-full object-cover border border-white/10"
          />
          <div>
            <div className="text-white text-sm font-medium">{partnerName}</div>
            <div className="text-xs text-white/60 flex items-center gap-2">
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  isOnline ? 'bg-emerald-400' : 'bg-white/30'
                }`}
              />
              {isOnline ? 'online' : 'offline'}
            </div>
          </div>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="px-4 py-2 bg-red-500/20 text-red-400 text-sm border-b border-red-500/30">
          {error}
        </div>
      )}

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto smooth-scroll px-3 py-4"
      >
        {messages.length === 0 ? (
          <div className="text-center text-white/50 text-sm py-8">
            No messages yet. Start the conversation!
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg, idx) => {
              const isMine = msg.sender_id === currentUserId;
              const prevMsg = idx > 0 ? messages[idx - 1] : null;
              const showDate =
                !prevMsg ||
                formatDate(prevMsg.created_at) !== formatDate(msg.created_at);

              return (
                <div key={msg.id}>
                  {showDate && (
                    <div className="text-center text-xs text-white/50 py-2">
                      {formatDate(msg.created_at)}
                    </div>
                  )}

                  <div
                    className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[78%] flex flex-col ${
                        isMine ? 'items-end' : 'items-start'
                      }`}
                    >
                      <div
                        className={`px-4 py-2 rounded-2xl ${
                          isMine
                            ? 'bg-gradient-to-br from-sky-500/80 to-fuchsia-500/80 text-white rounded-br-sm'
                            : 'bg-white/8 text-white rounded-bl-sm border border-white/10'
                        }`}
                      >
                        {msg.deleted_at ? (
                          <div className="italic text-white/60">
                            Message deleted
                          </div>
                        ) : (
                          <div className="whitespace-pre-wrap leading-relaxed">
                            {msg.body}
                          </div>
                        )}
                      </div>
                      <div
                        className={`text-[11px] text-white/60 mt-1 ${
                          isMine ? 'text-right' : 'text-left'
                        }`}
                      >
                        {formatTime(msg.created_at)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-3 pb-3 pt-2 border-t border-white/10">
        <div className="relative flex items-center gap-2 bg-white/5 border border-white/10 rounded-2xl px-2 py-1.5">
          <input
            className="input flex-1 bg-transparent border-0 focus:ring-0 placeholder-white/40"
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            type="text"
            placeholder="Type a message..."
            disabled={sending}
          />
          <button
            className="btn btn-primary rounded-xl px-3 py-2"
            onClick={handleSend}
            disabled={!messageText.trim() || sending}
          >
            {sending ? '...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}

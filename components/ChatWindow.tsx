'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { uploadAttachment, getSignedUrlForAttachment, type DmAttachment } from '@/lib/dm/attachments';
import { openThreadChannel, subscribe, unsubscribe, sendTyping } from '@/lib/dm/realtime';
import { supabase } from '@/lib/supabaseClient';
import { getPresenceMap } from '@/lib/dm/presence';

type Receipt = { user_id: string; status: 'delivered' | 'read'; updated_at?: string };
type DmMessage = {
  id: number;
  thread_id: number;
  sender_id: string;
  kind: 'text' | 'system';
  body: string | null;
  attachments: unknown[];
  created_at: string;
  edited_at?: string | null;
  deleted_at?: string | null;
  receipts?: Receipt[];
};

type Props = {
  threadId?: number;
  currentUserId?: string;
  // Optional explicit DM partner user id for 1:1 threads
  targetUserId?: string;
  onBack?: () => void;
};

export default function ChatWindow({ threadId, currentUserId, targetUserId: explicitTargetUserId, onBack }: Props) {
  const [text, setText] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<DmAttachment[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const lastReadUpToRef = useRef<number | null>(null);
  const [targetUserId, setTargetUserId] = useState<string | null>(explicitTargetUserId ?? null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isTypingOther, setIsTypingOther] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [partner, setPartner] = useState<{ user_id: string; name: string; avatar: string | null } | null>(null);
  const [isOnline, setIsOnline] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lastReadId, setLastReadId] = useState<number | null>(null);
  const [muted, setMuted] = useState<boolean>(false);
  const emojiChoices = useMemo(
    () => [
      '😀','😁','😂','🤣','😊','😍','😎','🤔','😅','🙂',
      '🙃','😉','😭','👍','👎','🙏','👏','🔥','💯','🎉',
      '❤️','💜','💙','💚','💛','🧡','✨','🌟','⭐','🤝'
    ],
    []
  );

  const refreshPreview = useCallback(async (att: DmAttachment) => {
    try {
      const url = await getSignedUrlForAttachment({ path: att.path }, 60);
      setPreviews((prev) => ({ ...prev, [att.path]: url }));
    } catch {
      // ignore preview errors
    }
  }, []);

  useEffect(() => {
    // Generate previews for any missing ones
    attachments.forEach((att) => {
      if (!previews[att.path]) void refreshPreview(att);
    });
  }, [attachments, previews, refreshPreview]);

  async function onSelectFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    for (const file of files) {
      try {
        const att = await uploadAttachment(file);
        setAttachments((prev) => [...prev, att]);
        void refreshPreview(att);
      } catch (err) {
        console.error('Upload failed', err);
      }
    }
    // reset input to allow re-selecting same file
    e.target.value = '';
  }

  function onPickEmoji(e: string) {
    setText((prev) => `${prev}${e}`);
    // keep the picker open for multiple inserts
  }

  // Load messages for active thread (if provided)
  useEffect(() => {
    if (!threadId) return;
    let aborted = false;
    (async () => {
      setIsLoading(true);
      try {
        const resp = await fetch(`/api/dms/messages.list?thread_id=${threadId}&limit=30`);
        const json = await resp.json();
        if (!json?.ok || aborted) return;
        const list: DmMessage[] = (json.messages || []).slice().reverse();
        setMessages(list);
        setHasMore((json.messages || []).length >= 30);
      } catch {
        setMessages([]);
        setHasMore(false);
      } finally {
        setIsLoading(false);
      }
    })();
    return () => {
      aborted = true;
    };
  }, [threadId]);

  // Load my participant state (last_read_message_id and mute)
  useEffect(() => {
    (async () => {
      if (!threadId || !currentUserId) { setLastReadId(null); setMuted(false); return; }
      try {
        const { data } = await supabase
          .from('dms_thread_participants')
          .select('last_read_message_id, notifications_muted')
          .eq('thread_id', threadId)
          .eq('user_id', currentUserId)
          .maybeSingle();
        setLastReadId(((data as any)?.last_read_message_id as number | null) ?? null);
        setMuted(Boolean((data as any)?.notifications_muted));
      } catch {
        setLastReadId(null);
        setMuted(false);
      }
    })();
  }, [threadId, currentUserId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);

  // Infinite scroll: load older when scrolled to top
  const oldestMessageId = useMemo(() => (messages.length > 0 ? messages[0]!.id : null), [messages]);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !threadId) return;
    const onScroll = async () => {
      if (el.scrollTop <= 32 && !isLoadingMore && hasMore) {
        setIsLoadingMore(true);
        try {
          const resp = await fetch(`/api/dms/messages.list?thread_id=${threadId}&before=${oldestMessageId}&limit=30`);
          const json = await resp.json();
          if (json?.ok) {
            const batch: DmMessage[] = (json.messages || []).slice().reverse();
            if (batch.length > 0) {
              const prevHeight = el.scrollHeight;
              setMessages((prev) => [...batch, ...prev]);
              // allow DOM to render then adjust scroll to keep viewport stable
              setTimeout(() => {
                const newHeight = el.scrollHeight;
                el.scrollTop = newHeight - prevHeight;
              }, 0);
            }
            setHasMore((json.messages || []).length >= 30);
          }
        } catch {
          // ignore
        } finally {
          setIsLoadingMore(false);
        }
      }
    };
    el.addEventListener('scroll', onScroll);
    return () => { el.removeEventListener('scroll', onScroll); };
  }, [threadId, hasMore, isLoadingMore, oldestMessageId]);

  // Resolve target user id for 1:1 threads if not explicitly provided
  useEffect(() => {
    if (explicitTargetUserId) {
      setTargetUserId(explicitTargetUserId);
      return;
    }
    if (!threadId || !currentUserId) return;
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(`/api/dms/thread.participants?thread_id=${threadId}`);
        const json = await resp.json();
        if (!json?.ok || cancelled) return;
        const ids: string[] = json.participants || [];
        if (ids.length === 2) {
          const other = ids.find((id) => id !== currentUserId) || null;
          setTargetUserId(other ?? null);
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [explicitTargetUserId, threadId, currentUserId]);

  // Load partner profile once we know targetUserId
  useEffect(() => {
    (async () => {
      if (!targetUserId) { setPartner(null); return; }
      try {
        const { data: prof } = await supabase
          .from('profiles')
          .select('user_id, username, full_name, avatar_url')
          .eq('user_id', targetUserId)
          .maybeSingle();
        if (prof) {
          const name = (prof as any).full_name || (prof as any).username || (prof as any).user_id?.slice(0, 8) || 'User';
          setPartner({ user_id: (prof as any).user_id, name, avatar: (prof as any).avatar_url || null });
        } else {
          setPartner({ user_id: targetUserId, name: targetUserId.slice(0, 8), avatar: null });
        }
      } catch {
        setPartner({ user_id: targetUserId, name: targetUserId.slice(0, 8), avatar: null });
      }
    })();
  }, [targetUserId]);

  // Presence: basic polling to reflect online/offline
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    (async () => {
      if (!partner?.user_id) { setIsOnline(false); return; }
      try {
        const map = await getPresenceMap(partner.user_id);
        setIsOnline(Object.keys(map || {}).length > 0);
      } catch { setIsOnline(false); }
      timer = setInterval(async () => {
        try {
          const map = await getPresenceMap(partner!.user_id);
          setIsOnline(Object.keys(map || {}).length > 0);
        } catch { /* ignore */ }
      }, 15000);
    })();
    return () => { if (timer) clearInterval(timer); };
  }, [partner?.user_id]);

  // After render of an active, open thread, mark messages as read up to the latest
  useEffect(() => {
    if (!threadId || messages.length === 0) return;
    const latestId = messages[messages.length - 1]?.id;
    if (!latestId || lastReadUpToRef.current === latestId) return;
    lastReadUpToRef.current = latestId;
    (async () => {
      try {
        await fetch('/api/dms/messages.read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ thread_id: threadId, up_to_message_id: latestId }),
        });
        setLastReadId((prev) => (prev && prev > latestId ? prev : latestId));
      } catch {}
    })();
  }, [threadId, messages]);

  const computeStatus = useCallback(
    (msg: DmMessage): 'sent' | 'delivered' | 'read' | null => {
      if (!currentUserId || msg.sender_id !== currentUserId) return null;
      const receipts = msg.receipts || [];
      if (receipts.length === 0) return 'sent';
      const nonSelf = receipts.filter((r) => r.user_id !== currentUserId);
      if (nonSelf.length === 0) return 'sent';
      const allRead = nonSelf.every((r) => r.status === 'read');
      if (allRead) return 'read';
      const allDeliveredOrRead = nonSelf.every((r) => r.status === 'delivered' || r.status === 'read');
      return allDeliveredOrRead ? 'delivered' : 'sent';
    },
    [currentUserId]
  );

  const StatusChecks: React.FC<{ status: 'sent' | 'delivered' | 'read' }> = ({ status }) => {
    if (status === 'sent') return <span className="text-gray-400">✓</span>;
    if (status === 'delivered') return <span className="text-gray-400">✓✓</span>;
    return <span className="text-green-500">✓✓</span>;
  };

  // Realtime channel: new messages, edits, deletes, receipts, typing indicators
  useEffect(() => {
    if (!threadId) return;
    openThreadChannel(threadId);
    void subscribe(
      (change) => {
        const row = (change.payload as any)?.new;
        if (!row) return;
        if (change.type === 'message.insert') {
          const msg: DmMessage = {
            id: row.id,
            thread_id: row.thread_id,
            sender_id: row.sender_id,
            kind: row.kind,
            body: row.body,
            attachments: row.attachments || [],
            created_at: row.created_at,
            edited_at: row.edited_at || null,
            deleted_at: row.deleted_at || null,
            receipts: [],
          };
          setMessages((prev) => [...prev, msg]);
        } else if (change.type === 'message.update') {
          setMessages((prev) => prev.map((m) => (m.id === row.id ? { ...m, body: row.body, edited_at: row.edited_at, deleted_at: row.deleted_at } : m)));
        }
      },
      // receipt updates
      (receiptChange) => {
        const r = (receiptChange.payload as any)?.new;
        if (!r) return;
        setMessages((prev) => prev.map((m) => {
          if (m.id !== r.message_id) return m;
          const receipts = Array.isArray(m.receipts) ? [...m.receipts] : [];
          const idx = receipts.findIndex((x) => x.user_id === r.user_id);
          const next: Receipt = { user_id: r.user_id, status: r.status, updated_at: r.updated_at };
          if (idx >= 0) receipts[idx] = next; else receipts.push(next);
          return { ...m, receipts };
        }));
      },
      (evt) => {
        if (!evt) return;
        if (evt.userId && evt.userId !== currentUserId) {
          setIsTypingOther(Boolean(evt.typing));
        }
      }
    );
    return () => { void unsubscribe(); };
  }, [threadId, currentUserId]);

  // Send typing events while user types
  const onUserTyping = useCallback(() => {
    void sendTyping(true, { userId: currentUserId });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => { void sendTyping(false, { userId: currentUserId }); }, 1200);
  }, [currentUserId]);

  // Local reactions state (ephemeral)
  const [reactions, setReactions] = useState<Record<number, Record<string, number>>>({});
  const addReaction = (messageId: number, emoji: string) => {
    setReactions((prev) => {
      const byEmoji = { ...(prev[messageId] || {}) };
      byEmoji[emoji] = (byEmoji[emoji] || 0) + 1;
      return { ...prev, [messageId]: byEmoji };
    });
  };

  async function send() {
    if (!text.trim() && attachments.length === 0) return;
    const bodyText = text.trim();
    setText('');
    const sendAttachments = attachments.slice();
    setAttachments([]);
    setPreviews({});
    if (!threadId) {
      setLog((prev) => [...prev, `me: ${bodyText || '(no text)'}${sendAttachments.length ? ` [${sendAttachments.length} attachment(s)]` : ''}`]);
      return;
    }
    try {
      const resp = await fetch('/api/dms/messages.send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id: threadId, body: bodyText || null, attachments: sendAttachments }),
      });
      const json = await resp.json();
      if (json?.ok && json.message) {
        setMessages((prev) => [...prev, json.message]);
      } else {
        setLog((prev) => [...prev, `Send failed: ${json?.error || 'unknown error'}`]);
      }
    } catch {
      setLog((prev) => [...prev, 'Send failed: network error']);
    }
  }

  // Mute/unmute current thread
  async function toggleMute() {
    if (!threadId) return;
    try {
      const next = !muted;
      setMuted(next);
      await fetch('/api/dms/thread.mute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id: threadId, muted: next }),
      });
      // Notify thread list to refresh
      try { window.dispatchEvent(new CustomEvent('dm:threads:refresh')); } catch {}
    } catch {
      // rollback UI on error
      setMuted((v) => !v);
    }
  }

  // Edit and delete actions (last message only for simplicity)
  const canEditOrDelete = useMemo(() => {
    if (!currentUserId || messages.length === 0) return false;
    const last = messages[messages.length - 1]!;
    return last.sender_id === currentUserId && !last.deleted_at;
  }, [messages, currentUserId]);

  async function onEditLast() {
    const last = messages[messages.length - 1];
    if (!last) return;
    const nextBody = prompt('Изменить сообщение:', last.body || '');
    if (nextBody == null) return;
    try {
      const resp = await fetch('/api/dms/messages.edit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_id: last.id, body: nextBody })
      });
      const json = await resp.json();
      if (json?.ok && json.message) {
        setMessages((prev) => prev.map((m) => (m.id === last.id ? json.message : m)));
      }
    } catch {}
  }

  async function onDeleteLast() {
    const last = messages[messages.length - 1];
    if (!last) return;
    if (!confirm('Удалить сообщение для всех участников?')) return;
    try {
      const resp = await fetch('/api/dms/messages.delete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_id: last.id, mode: 'everyone' })
      });
      const json = await resp.json();
      if (json?.ok) {
        setMessages((prev) => prev.map((m) => (m.id === last.id ? { ...m, deleted_at: new Date().toISOString(), body: null, attachments: [] } : m)));
      }
    } catch {}
  }

  // Block/Unblock controls moved to the profile sidebar

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="card card-glow overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="md:hidden btn btn-ghost px-2 py-1 text-white/70 hover:text-white"
            onClick={onBack}
            aria-label="Back"
          >
            ←
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={partner?.avatar || 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'64\' height=\'64\'><rect width=\'100%\' height=\'100%\' fill=\'%23222\'/><circle cx=\'32\' cy=\'24\' r=\'14\' fill=\'%23555\'/><rect x=\'12\' y=\'44\' width=\'40\' height=\'12\' rx=\'6\' fill=\'%23555\'/></svg>'}
            alt=""
            className="h-9 w-9 rounded-full object-cover border border-white/10"
          />
          <div>
            <div className="text-white text-sm font-medium leading-tight">{partner?.name || 'Direct Message'}</div>
            <div className="text-xs text-white/60 flex items-center gap-2">
              <span className={`inline-block h-2 w-2 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-white/30'}`} />
              {isOnline ? 'online' : 'offline'}
              {isTypingOther && <span className="ml-2 text-white/70">печатает…</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={`btn btn-ghost px-2 py-1 ${muted ? 'text-white/40' : 'text-white/80'} hover:text-white`}
            title={muted ? 'Включить уведомления' : 'Выключить уведомления'}
            onClick={toggleMute}
          >🔔</button>
          {canEditOrDelete && (
            <>
              <button type="button" className="btn btn-ghost px-2 py-1 text-white/70 hover:text-white" title="Редактировать последнее" onClick={onEditLast}>✏️</button>
              <button type="button" className="btn btn-ghost px-2 py-1 text-white/70 hover:text-white" title="Удалить последнее" onClick={onDeleteLast}>🗑️</button>
            </>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto smooth-scroll px-3 py-4 bg-gradient-to-b from-white/0 to-white/0">
        {threadId ? (
          <div className="space-y-3">
            {/* Skeletons while loading */}
            {isLoading && (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className={`flex ${i % 2 ? 'justify-end' : 'justify-start'}`}>
                    <div className="h-6 w-40 bg-white/10 rounded-xl" />
                  </div>
                ))}
              </div>
            )}
            {/* Older loader marker */}
            {isLoadingMore && (
              <div className="text-center text-xs text-white/50 py-1">Загрузка…</div>
            )}
            {messages.map((m, idx) => {
              const mine = m.sender_id === currentUserId;
              const status = computeStatus(m);
              const time = new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              const thisDateKey = new Date(m.created_at).toDateString();
              const prevDateKey = idx > 0 ? new Date(messages[idx - 1]!.created_at).toDateString() : '';
              const showDateHeader = thisDateKey !== prevDateKey;
              const createdAtDate = new Date(m.created_at);
              const now = new Date();
              const isToday = createdAtDate.toDateString() === now.toDateString();
              const yesterday = new Date(now);
              yesterday.setDate(now.getDate() - 1);
              const isYesterday = createdAtDate.toDateString() === yesterday.toDateString();
              const dateLabel = isToday ? 'Сегодня' : isYesterday ? 'Вчера' : createdAtDate.toLocaleDateString();
              const showNewDivider = lastReadId != null && m.id > lastReadId && (idx === 0 || messages[idx - 1]!.id <= lastReadId);

              const messageContainerClass = `group max-w-[78%] flex flex-col ${mine ? 'items-end' : 'items-start'}`;
              const bubbleClass =
                'relative px-4 py-2 rounded-2xl shadow-sm ' +
                (mine
                  ? 'bg-gradient-to-br from-sky-500/80 to-fuchsia-500/80 text-white rounded-br-sm'
                  : 'bg-white/8 text-white rounded-bl-sm backdrop-blur border border-white/10');
              const metaRowClass = `flex items-center gap-2 mt-1 ${mine ? 'justify-end' : 'justify-start'} text-[11px] text-white/60`;
              const reactionsRowClass = `flex gap-1 mt-1 ${mine ? 'justify-end' : 'justify-start'}`;

              return (
                <div key={m.id}>
                  {showDateHeader && (
                    <div className="text-center text-xs text-white/50 py-2">{dateLabel}</div>
                  )}
                  {showNewDivider && (
                    <div className="text-center text-[11px] text-white/70 py-1">New messages</div>
                  )}
                  <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div className={messageContainerClass}>
                      <div className={bubbleClass}>
                        {m.deleted_at ? (
                          <div className="italic text-white/60">Сообщение удалено</div>
                        ) : (
                          <>
                            {m.body && <div className="whitespace-pre-wrap leading-relaxed">{m.body}</div>}
                            {Array.isArray(m.attachments) && m.attachments.length > 0 && (
                              <div className="mt-2 grid grid-cols-2 gap-2">
                                {m.attachments.map((att: any, i: number) => {
                                  const key = att?.path as string | undefined;
                                  const url = key ? previews[key] : undefined;
                                  if (key && !url) {
                                    void (async () => {
                                      try {
                                        const signed = await getSignedUrlForAttachment({ path: key }, 60);
                                        setPreviews((prev) => ({ ...prev, [key]: signed }));
                                      } catch {}
                                    })();
                                  }

                                  return (
                                    <div key={key || i} className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
                                      {att?.type === 'image' ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img alt={key || ''} src={url} className="object-cover w-full h-40" />
                                      ) : url ? (
                                        <a href={url} target="_blank" rel="noreferrer" className="text-xs underline block px-2 py-2">
                                          {att?.mime || 'attachment'}
                                        </a>
                                      ) : (
                                        <div className="h-10" />
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </>
                        )}
                        <div className="absolute -bottom-7 opacity-0 group-hover:opacity-100 transition-opacity duration-200 left-2 flex gap-2">
                          {['👍', '❤️', '😂'].map((emoji) => (
                            <button
                              key={emoji}
                              type="button"
                              className="text-xs bg-white/10 hover:bg-white/20 rounded-full px-2 py-0.5"
                              onClick={() => addReaction(m.id, emoji)}
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className={metaRowClass}>
                        <span>{time}</span>
                        {mine && status && (
                          <span className="ml-1">
                            <StatusChecks status={status} />
                          </span>
                        )}
                      </div>

                      {reactions[m.id] && (
                        <div className={reactionsRowClass}>
                          {Object.entries(reactions[m.id]).map(([emoji, count]) => (
                            <span key={emoji} className="text-xs px-1.5 py-0.5 rounded-full bg-white/10">
                              {emoji} {count}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {isTypingOther && (
              <div className="flex justify-start">
                <div className="px-3 py-2 rounded-2xl bg-white/8 border border-white/10">
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                </div>
              </div>
            )}
          </div>
        ) : (
          log.map((l, i) => <div key={i}>{l}</div>)
        )}
      </div>

      {/* Attachments preview */}
      {attachments.length > 0 && (
        <div className="px-3 pb-2">
          <div className="grid grid-cols-3 gap-2">
            {attachments.map((att) => (
              <div key={att.path} className="w-full h-24 bg-black/5 rounded-xl flex items-center justify-center overflow-hidden border border-white/10">
                {att.type === 'image' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt={att.path} src={previews[att.path]} className="object-cover w-full h-full" />
                ) : (
                  <a href={previews[att.path]} target="_blank" rel="noreferrer" className="text-xs underline px-2 text-center">
                    {att.mime} ({Math.ceil(att.size / 1024)} KB)
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Composer */}
      <div className="px-3 pb-3 pt-2">
        <div className="relative flex items-center gap-2 bg-white/5 border border-white/10 rounded-2xl px-2 py-1.5">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={onSelectFiles}
          />
          <button
            type="button"
            className="px-2 py-1 rounded-xl text-white/80 hover:bg-white/10"
            title="Прикрепить фото/видео"
            onClick={() => fileInputRef.current?.click()}
          >
            📎
          </button>
          <input
            className="input flex-1 bg-transparent border-0 focus:ring-0 placeholder-white/40"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              onUserTyping();
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            type="text"
            inputMode="text"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            autoFocus={Boolean(threadId)}
            placeholder="Напишите сообщение…"
          />
          <div className="relative">
            <button
              type="button"
              className="px-2 py-1 rounded-xl text-white/80 hover:bg-white/10"
              title="Эмодзи"
              onClick={() => setShowEmojiPicker((v) => !v)}
            >
              😀
            </button>
            {showEmojiPicker && (
              <div className="absolute bottom-full right-0 mb-2 z-10 p-2 rounded-2xl border border-white/10 bg-[#0f1628]/95 backdrop-blur min-w-[260px] shadow-xl">
                <div className="grid grid-cols-10 gap-1">
                  {emojiChoices.map((e) => (
                    <button
                      key={e}
                      type="button"
                      className="hover:bg-white/10 rounded text-lg leading-none p-1"
                      onClick={() => onPickEmoji(e)}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button
            className="btn btn-primary rounded-xl px-3 py-2"
            onClick={send}
            title="Отправить"
          >
            ✈️
          </button>
        </div>
      </div>
    </div>
  );
}

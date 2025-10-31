'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { subscribeToThread, sendTypingIndicator } from '@/lib/dm/realtime';
import { uploadAttachment, getSignedUrlForAttachment, type DmAttachment } from '@/lib/dm/attachments';

type Message = {
  id: number;
  thread_id: number;
  sender_id: string;
  kind: 'text' | 'system';
  body: string | null;
  attachments: unknown[];
  created_at: string;
  edited_at?: string | null;
  deleted_at?: string | null;
};

type Props = {
  threadId: number;
  currentUserId: string;
  partnerId?: string;
  partnerName?: string;
  partnerAvatar?: string | null;
  isOnline?: boolean;
  onBack?: () => void;
};

export default function ChatWindow({
  threadId,
  currentUserId,
  partnerId,
  partnerName = 'User',
  partnerAvatar,
  isOnline = false,
  onBack,
}: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<DmAttachment[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [lastReadId, setLastReadId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const AVATAR_FALLBACK = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='100%' height='100%' fill='%23222'/><circle cx='32' cy='24' r='14' fill='%23555'/><rect x='12' y='44' width='40' height='12' rx='6' fill='%23555'/></svg>";

  // Load initial messages
  useEffect(() => {
    let cancelled = false;
    
    (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const resp = await fetch(`/api/dms/messages.list?thread_id=${threadId}&limit=30`);
        
        if (!resp.ok) {
          const errorText = await resp.text();
          throw new Error(errorText || 'Failed to load messages');
        }
        
        const json = await resp.json();
        
        if (!json?.ok || cancelled) {
          if (!cancelled) {
            setError(json?.error || 'Failed to load messages');
          }
          return;
        }
        
        const loadedMessages = (json.messages || []).slice().reverse();
        setMessages(loadedMessages);
        setHasMore((json.messages || []).length >= 30);
        
        // Set last read
        if (loadedMessages.length > 0) {
          const latestId = loadedMessages[loadedMessages.length - 1]!.id;
          setLastReadId(latestId);
          await markAsRead(latestId);
        }
      } catch (error) {
        console.error('Failed to load messages:', error);
        if (!cancelled) {
          setError((error as Error).message || 'Failed to load messages');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  // Load mute status
  useEffect(() => {
    (async () => {
      try {
        const { data, error: muteError } = await supabase
          .from('dms_thread_participants')
          .select('notifications_muted')
          .eq('thread_id', threadId)
          .eq('user_id', currentUserId)
          .maybeSingle();
        
        if (!muteError && data) {
          setIsMuted(Boolean(data.notifications_muted));
        }
      } catch (err) {
        console.error('Error loading mute status:', err);
      }
    })();
  }, [threadId, currentUserId]);

  // Subscribe to realtime updates
  useEffect(() => {
    let cancelled = false;
    
    (async () => {
      try {
        const unsubscribe = await subscribeToThread(threadId, {
          onMessage: (change) => {
            if (cancelled) return;
            
            const row = change.payload.new || change.payload.old;
            
            if (change.type === 'INSERT' && row) {
              const newMessage: Message = {
                id: row.id,
                thread_id: row.thread_id,
                sender_id: row.sender_id,
                kind: row.kind,
                body: row.body,
                attachments: row.attachments || [],
                created_at: row.created_at,
                edited_at: row.edited_at,
                deleted_at: row.deleted_at,
              };
              setMessages((prev) => [...prev, newMessage]);
              
              // Mark as read if it's from someone else
              if (newMessage.sender_id !== currentUserId) {
                void markAsRead(newMessage.id);
              }
            } else if (change.type === 'UPDATE' && row) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === row.id
                    ? {
                        ...m,
                        body: row.body,
                        edited_at: row.edited_at,
                        deleted_at: row.deleted_at,
                      }
                    : m
                )
              );
            } else if (change.type === 'DELETE' && row) {
              setMessages((prev) => prev.filter((m) => m.id !== row.id));
            }
          },
          onTyping: (event) => {
            if (event.userId !== currentUserId && !cancelled) {
              setIsTyping(event.typing);
              if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current);
              }
              if (event.typing) {
                typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 3000);
              }
            }
          },
        });
        
        unsubscribeRef.current = unsubscribe;
      } catch (err) {
        console.error('Error subscribing to thread:', err);
        setError('Failed to connect to chat');
      }
    })();
    
    return () => {
      cancelled = true;
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [threadId, currentUserId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  // Infinite scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || isLoadingMore || !hasMore) return;
    
    const handleScroll = async () => {
      if (el.scrollTop <= 32 && messages.length > 0) {
        setIsLoadingMore(true);
        try {
          const oldestId = messages[0]!.id;
          const resp = await fetch(`/api/dms/messages.list?thread_id=${threadId}&before=${oldestId}&limit=30`);
          
          if (!resp.ok) {
            throw new Error('Failed to load more messages');
          }
          
          const json = await resp.json();
          
          if (json?.ok && json.messages?.length > 0) {
            const prevHeight = el.scrollHeight;
            const batch = (json.messages || []).slice().reverse();
            setMessages((prev) => [...batch, ...prev]);
            setHasMore(json.messages.length >= 30);
            
            // Maintain scroll position
            setTimeout(() => {
              const newHeight = el.scrollHeight;
              el.scrollTop = newHeight - prevHeight;
            }, 0);
          } else {
            setHasMore(false);
          }
        } catch (error) {
          console.error('Failed to load more messages:', error);
        } finally {
          setIsLoadingMore(false);
        }
      }
    };
    
    el.addEventListener('scroll', handleScroll);
    return () => el.removeEventListener('scroll', handleScroll);
  }, [threadId, messages, isLoadingMore, hasMore]);

  // Generate previews for attachments
  useEffect(() => {
    attachments.forEach((att) => {
      if (!previews[att.path]) {
        void (async () => {
          try {
            const url = await getSignedUrlForAttachment({ path: att.path }, 60);
            setPreviews((prev) => ({ ...prev, [att.path]: url }));
          } catch (err) {
            console.error('Error loading attachment preview:', err);
          }
        })();
      }
    });
  }, [attachments, previews]);

  async function markAsRead(messageId: number) {
    try {
      const resp = await fetch('/api/dms/messages.read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id: threadId, up_to_message_id: messageId }),
      });
      
      if (resp.ok) {
        setLastReadId((prev) => (prev && prev > messageId ? prev : messageId));
      }
    } catch (err) {
      console.error('Error marking as read:', err);
    }
  }

  async function handleSend() {
    if (!text.trim() && attachments.length === 0) return;
    
    const bodyText = text.trim();
    const sendAttachments = attachments.slice();
    
    setText('');
    setAttachments([]);
    setPreviews({});
    setError(null);
    
    try {
      const resp = await fetch('/api/dms/messages.send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thread_id: threadId,
          body: bodyText || null,
          attachments: sendAttachments,
        }),
      });
      
      if (!resp.ok) {
        const errorText = await resp.text();
        throw new Error(errorText || 'Failed to send message');
      }
      
      const json = await resp.json();
      if (!json?.ok) {
        throw new Error(json?.error || 'Failed to send message');
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      setError((error as Error).message || 'Failed to send message');
      // Restore on error
      setText(bodyText);
      setAttachments(sendAttachments);
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    
    setError(null);
    
    for (const file of files) {
      try {
        const att = await uploadAttachment(file);
        setAttachments((prev) => [...prev, att]);
      } catch (error) {
        console.error('Upload failed:', error);
        setError((error as Error).message || 'Failed to upload file');
      }
    }
    
    e.target.value = '';
  }

  function handleTyping() {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    void sendTypingIndicator(threadId, currentUserId, true);
    
    typingTimeoutRef.current = setTimeout(() => {
      void sendTypingIndicator(threadId, currentUserId, false);
    }, 2000);
  }

  async function toggleMute() {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    
    try {
      const resp = await fetch('/api/dms/thread.mute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id: threadId, muted: newMuted }),
      });
      
      if (!resp.ok) {
        throw new Error('Failed to update mute status');
      }
      
      // Notify thread list to refresh
      window.dispatchEvent(new CustomEvent('dm:threads:refresh'));
    } catch (err) {
      console.error('Error toggling mute:', err);
      setIsMuted(!newMuted);
    }
  }

  function formatTime(date: string): string {
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function formatDate(date: string): string {
    const d = new Date(date);
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    
    if (d.toDateString() === now.toDateString()) return '???????';
    if (d.toDateString() === yesterday.toDateString()) return '?????';
    return d.toLocaleDateString();
  }

  return (
    <div className="card card-glow overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="md:hidden btn btn-ghost px-2 py-1 text-white/70 hover:text-white"
            onClick={onBack}
          >
            ?
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={partnerAvatar || AVATAR_FALLBACK}
            alt={partnerName}
            className="h-9 w-9 rounded-full object-cover border border-white/10"
          />
          <div>
            <div className="text-white text-sm font-medium">{partnerName}</div>
            <div className="text-xs text-white/60 flex items-center gap-2">
              <span className={`inline-block h-2 w-2 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-white/30'}`} />
              {isOnline ? 'online' : 'offline'}
              {isTyping && <span className="ml-2 text-white/70">?????????</span>}
            </div>
          </div>
        </div>
        <button
          type="button"
          className={`btn btn-ghost px-2 py-1 ${isMuted ? 'text-white/40' : 'text-white/80'} hover:text-white`}
          onClick={toggleMute}
          title={isMuted ? '???????? ???????????' : '????????? ???????????'}
        >
          ??
        </button>
      </div>

      {/* Error message */}
      {error && (
        <div className="px-4 py-2 bg-red-500/20 text-red-400 text-sm border-b border-red-500/30">
          {error}
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto smooth-scroll px-3 py-4">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={`flex ${i % 2 ? 'justify-end' : 'justify-start'}`}>
                <div className="h-6 w-40 bg-white/10 rounded-xl" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {isLoadingMore && (
              <div className="text-center text-xs text-white/50 py-1">?????????</div>
            )}
            
            {messages.map((msg, idx) => {
              const isMine = msg.sender_id === currentUserId;
              const prevMsg = idx > 0 ? messages[idx - 1] : null;
              const showDate = !prevMsg || formatDate(prevMsg.created_at) !== formatDate(msg.created_at);
              
              return (
                <div key={msg.id}>
                  {showDate && (
                    <div className="text-center text-xs text-white/50 py-2">
                      {formatDate(msg.created_at)}
                    </div>
                  )}
                  
                  <div className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[78%] flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                      <div
                        className={`px-4 py-2 rounded-2xl ${
                          isMine
                            ? 'bg-gradient-to-br from-sky-500/80 to-fuchsia-500/80 text-white rounded-br-sm'
                            : 'bg-white/8 text-white rounded-bl-sm border border-white/10'
                        }`}
                      >
                        {msg.deleted_at ? (
                          <div className="italic text-white/60">????????? ???????</div>
                        ) : (
                          <>
                            {msg.body && (
                              <div className="whitespace-pre-wrap leading-relaxed">{msg.body}</div>
                            )}
                            {Array.isArray(msg.attachments) && msg.attachments.length > 0 && (
                              <div className="mt-2 grid grid-cols-2 gap-2">
                                {msg.attachments.map((att: any, i: number) => {
                                  const key = att?.path;
                                  const url = key ? previews[key] : undefined;
                                  
                                  if (key && !url) {
                                    void (async () => {
                                      try {
                                        const signed = await getSignedUrlForAttachment({ path: key }, 60);
                                        setPreviews((prev) => ({ ...prev, [key]: signed }));
                                      } catch (err) {
                                        console.error('Error loading attachment:', err);
                                      }
                                    })();
                                  }
                                  
                                  return (
                                    <div key={key || i} className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
                                      {att?.type === 'image' ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img alt="" src={url} className="object-cover w-full h-40" />
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
                      </div>
                      <div className={`text-[11px] text-white/60 mt-1 ${isMine ? 'text-right' : 'text-left'}`}>
                        {formatTime(msg.created_at)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            
            {isTyping && (
              <div className="flex justify-start">
                <div className="px-3 py-2 rounded-2xl bg-white/8 border border-white/10">
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                </div>
              </div>
            )}
          </div>
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
                  <img alt="" src={previews[att.path]} className="object-cover w-full h-full" />
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

      {/* Input */}
      <div className="px-3 pb-3 pt-2 border-t border-white/10">
        <div className="relative flex items-center gap-2 bg-white/5 border border-white/10 rounded-2xl px-2 py-1.5">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />
          <button
            type="button"
            className="px-2 py-1 rounded-xl text-white/80 hover:bg-white/10"
            onClick={() => fileInputRef.current?.click()}
            title="?????????? ????"
          >
            ??
          </button>
          <input
            className="input flex-1 bg-transparent border-0 focus:ring-0 placeholder-white/40"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              handleTyping();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            type="text"
            placeholder="???????? ??????????"
          />
          <button
            className="btn btn-primary rounded-xl px-3 py-2"
            onClick={handleSend}
            disabled={!text.trim() && attachments.length === 0}
          >
            ??
          </button>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import ChatWindow from '@/components/ChatWindow';

type Thread = {
  id: number;
  is_group: boolean;
  title: string | null;
  last_message_at: string | null;
};

type Participant = {
  thread_id: number;
  role: string;
  last_read_message_id?: number | null;
  notifications_muted?: boolean | null;
};

type ThreadListItem = {
  thread: Thread;
  participant: Participant;
  unread_count: number;
};

type Profile = {
  user_id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
};

export default function DmPageClient({ currentUserId }: { currentUserId: string }) {
  const AVATAR_FALLBACK = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='100%' height='100%' fill='%23222'/><circle cx='32' cy='24' r='14' fill='%23555'/><rect x='12' y='44' width='40' height='12' rx='6' fill='%23555'/></svg>";

  const [threads, setThreads] = useState<ThreadListItem[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [threadMeta, setThreadMeta] = useState<Record<number, {
    name: string;
    avatar: string | null;
    lastText: string;
    online: boolean;
    partnerId: string | null;
  }>>({});
  
  const [onlineStatus, setOnlineStatus] = useState<Record<string, boolean>>({});
  
  const [showListOnMobile, setShowListOnMobile] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);

  // Load threads
  async function loadThreads() {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch('/api/dms/threads.list');
      
      if (!resp.ok) {
        const errorText = await resp.text();
        throw new Error(errorText || 'Failed to load threads');
      }
      
      const json = await resp.json();
      
      if (!json?.ok) {
        throw new Error(json?.error || 'Failed to load threads');
      }
      
      const loadedThreads = json.threads || [];
      setThreads(loadedThreads);
      
      // Auto-select first thread if none selected
      if (!selectedThreadId && loadedThreads.length > 0) {
        setSelectedThreadId(loadedThreads[0]!.thread.id);
      }
    } catch (e: any) {
      console.error('Error loading threads:', e);
      setError(e?.message || 'Network error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadThreads();
    
    // Listen for refresh events
    const handleRefresh = () => void loadThreads();
    window.addEventListener('dm:threads:refresh', handleRefresh);
    
    return () => {
      window.removeEventListener('dm:threads:refresh', handleRefresh);
    };
  }, []);

  // Load thread metadata
  useEffect(() => {
    if (!threads.length || !currentUserId) {
      setThreadMeta({});
      return;
    }

    let cancelled = false;

    (async () => {
      const meta: typeof threadMeta = {};
      const partnerIds = new Set<string>();
      
      // Process top 20 threads
      const topThreads = threads.slice(0, 20);
      
      await Promise.all(
        topThreads.map(async (item) => {
          if (cancelled) return;
          
          try {
            // Get participants
            const resp = await fetch(`/api/dms/thread.participants?thread_id=${item.thread.id}`);
            const json = await resp.json();
            const participantIds: string[] = json?.participants || [];
            
            let name = item.thread.title || (item.thread.is_group ? 'Group' : `Thread #${item.thread.id}`);
            let avatar: string | null = null;
            let partnerId: string | null = null;
            
            // For 1:1 threads, get partner info
            if (participantIds.length === 2) {
              const otherId = participantIds.find((id) => id !== currentUserId);
              if (otherId) {
                partnerId = otherId;
                partnerIds.add(otherId);
                
                try {
                  const { data: prof, error: profError } = await supabase
                    .from('profiles')
                    .select('full_name, username, avatar_url')
                    .eq('user_id', otherId)
                    .maybeSingle();
                  
                  if (!profError && prof) {
                    name = prof.full_name || prof.username || name;
                    avatar = prof.avatar_url || null;
                  }
                } catch (err) {
                  console.error('Error loading profile:', err);
                }
              }
            }
            
            // Get last message
            let lastText = '';
            try {
              const r = await fetch(`/api/dms/messages.list?thread_id=${item.thread.id}&limit=1`);
              const j = await r.json();
              const last = (j?.messages || [])[0];
              lastText = last?.body || '';
            } catch (err) {
              console.error('Error loading last message:', err);
            }
            
            meta[item.thread.id] = {
              name,
              avatar,
              lastText,
              online: false,
              partnerId,
            };
          } catch (err) {
            console.error('Error loading thread metadata:', err);
            meta[item.thread.id] = {
              name: item.thread.title || `Thread #${item.thread.id}`,
              avatar: null,
              lastText: '',
              online: false,
              partnerId: null,
            };
          }
        })
      );
      
      if (!cancelled) {
        setThreadMeta(meta);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [threads, currentUserId]);

  // Simple online status via presence
  useEffect(() => {
    if (!threads.length || !currentUserId) return;
    
    let cancelled = false;
    const channels: any[] = [];
    
    (async () => {
      const partnerIds = new Set<string>();
      
      for (const item of threads.slice(0, 20)) {
        try {
          const resp = await fetch(`/api/dms/thread.participants?thread_id=${item.thread.id}`);
          const json = await resp.json();
          const participantIds: string[] = json?.participants || [];
          
          if (participantIds.length === 2) {
            const otherId = participantIds.find((id) => id !== currentUserId);
            if (otherId) {
              partnerIds.add(otherId);
            }
          }
        } catch {
          // ignore
        }
      }
      
      // Subscribe to presence for partners
      const userIds = Array.from(partnerIds);
      if (userIds.length === 0 || cancelled) return;
      
      for (const userId of userIds) {
        try {
          const channel = supabase.channel(`presence:${userId}`, {
            config: { presence: { key: userId } },
          });
          
          channel.on('presence', { event: 'sync' }, () => {
            if (cancelled) return;
            const state = channel.presenceState();
            const isOnline = !!state[userId]?.[0];
            setOnlineStatus(prev => {
              const updated = { ...prev, [userId]: isOnline };
              // Update thread meta
              setThreadMeta(prevMeta => {
                const updatedMeta = { ...prevMeta };
                for (const [threadId, meta] of Object.entries(updatedMeta)) {
                  if (meta.partnerId === userId) {
                    updatedMeta[Number(threadId)] = { ...meta, online: isOnline };
                  }
                }
                return updatedMeta;
              });
              return updated;
            });
          });
          
          channel.on('presence', { event: 'join' }, () => {
            if (cancelled) return;
            setOnlineStatus(prev => {
              const updated = { ...prev, [userId]: true };
              setThreadMeta(prevMeta => {
                const updatedMeta = { ...prevMeta };
                for (const [threadId, meta] of Object.entries(updatedMeta)) {
                  if (meta.partnerId === userId) {
                    updatedMeta[Number(threadId)] = { ...meta, online: true };
                  }
                }
                return updatedMeta;
              });
              return updated;
            });
          });
          
          channel.on('presence', { event: 'leave' }, () => {
            if (cancelled) return;
            setOnlineStatus(prev => {
              const updated = { ...prev, [userId]: false };
              setThreadMeta(prevMeta => {
                const updatedMeta = { ...prevMeta };
                for (const [threadId, meta] of Object.entries(updatedMeta)) {
                  if (meta.partnerId === userId) {
                    updatedMeta[Number(threadId)] = { ...meta, online: false };
                  }
                }
                return updatedMeta;
              });
              return updated;
            });
          });
          
          await channel.subscribe();
          channels.push(channel);
        } catch (err) {
          console.error(`Error setting up presence for ${userId}:`, err);
        }
      }
    })();
    
    return () => {
      cancelled = true;
      channels.forEach(ch => {
        try {
          ch.unsubscribe();
        } catch (err) {
          console.error('Error unsubscribing from presence channel:', err);
        }
      });
    };
  }, [threads, currentUserId]);

  // Search users
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const { data, error: searchError } = await supabase
          .from('profiles')
          .select('user_id, username, full_name, avatar_url')
          .ilike('username', `%${searchQuery}%`)
          .limit(10);
        
        if (!cancelled && !searchError && data) {
          setSearchResults(
            data.map((p: any) => ({
              user_id: p.user_id,
              username: p.username ?? null,
              full_name: p.full_name ?? null,
              avatar_url: p.avatar_url ?? null,
            }))
          );
        } else if (!cancelled) {
          setSearchResults([]);
        }
      } catch (err) {
        console.error('Error searching:', err);
        if (!cancelled) setSearchResults([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [searchQuery]);

  async function createThreadWithUser(userId: string) {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch('/api/dms/threads.create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participant_ids: [userId] }),
      });
      
      if (!resp.ok) {
        const errorText = await resp.text();
        throw new Error(errorText || 'Failed to create thread');
      }
      
      const json = await resp.json();
      if (!json?.ok) {
        throw new Error(json?.error || 'Failed to create thread');
      }
      
      await loadThreads();
      setSelectedThreadId(json.thread?.id || null);
      setSearchQuery('');
      setShowListOnMobile(false);
    } catch (e: any) {
      console.error('Error creating thread:', e);
      setError(e?.message || 'Network error');
    } finally {
      setLoading(false);
    }
  }

  const selectedThread = useMemo(() => {
    return threads.find((t) => t.thread.id === selectedThreadId) || null;
  }, [threads, selectedThreadId]);

  const selectedMeta = selectedThread ? threadMeta[selectedThread.thread.id] : null;
  const selectedPartnerId = selectedMeta?.partnerId || null;

  return (
    <div className="grid grid-cols-12 gap-4 h-[calc(100vh-220px)] md:h-[70vh]">
      {/* Threads list */}
      <div className={`${selectedThreadId && !showListOnMobile ? 'hidden' : 'col-span-12'} md:col-span-4`}>
        <div className="card card-glow h-full flex flex-col">
          {/* Search header */}
          <div className="p-3 border-b border-white/10">
            <input
              className="input w-full"
              placeholder="????? ?????????????..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {error && <div className="text-red-400 text-sm mt-2">{error}</div>}
            
            {/* Search results */}
            {searchQuery.length >= 2 && (
              <div className="mt-2 space-y-1 max-h-56 overflow-y-auto">
                {searchResults.length === 0 ? (
                  <div className="text-xs text-white/50">?????? ?? ???????</div>
                ) : (
                  searchResults.map((p) => (
                    <div
                      key={p.user_id}
                      className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-white/5 cursor-pointer"
                      onClick={() => createThreadWithUser(p.user_id)}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.avatar_url || AVATAR_FALLBACK}
                        alt=""
                        className="h-6 w-6 rounded-full border border-white/10"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-white/90 text-sm truncate">
                          {p.full_name || p.username || p.user_id.slice(0, 8)}
                        </div>
                        <div className="text-white/50 text-xs truncate">@{p.username || '?'}</div>
                      </div>
                      <button
                        className="text-xs px-2 py-1 rounded-lg bg-white/90 text-black hover:bg-white"
                        onClick={(e) => {
                          e.stopPropagation();
                          createThreadWithUser(p.user_id);
                        }}
                      >
                        ???????
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Threads list */}
          <div className="flex-1 overflow-y-auto smooth-scroll p-2">
            {loading ? (
              <div className="text-sm text-white/60 py-2">????????...</div>
            ) : threads.length === 0 ? (
              <div className="text-sm text-white/60 py-2">??? ?????????.</div>
            ) : (
              threads.map((item) => {
                const meta = threadMeta[item.thread.id];
                return (
                  <button
                    key={item.thread.id}
                    className={`w-full text-left p-2 rounded-xl flex items-center gap-3 hover:bg-white/5 transition ${
                      selectedThreadId === item.thread.id ? 'bg-white/5' : ''
                    }`}
                    onClick={() => {
                      setSelectedThreadId(item.thread.id);
                      setShowListOnMobile(false);
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={meta?.avatar || AVATAR_FALLBACK}
                      alt=""
                      className="h-10 w-10 rounded-full object-cover border border-white/10"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-white/90 font-medium truncate">
                          {meta?.name || item.thread.title || `Thread #${item.thread.id}`}
                        </span>
                        <span
                          className={`h-2 w-2 rounded-full ${
                            meta?.online ? 'bg-emerald-400' : 'bg-white/30'
                          }`}
                        />
                      </div>
                      <div className="text-xs text-white/60 truncate">
                        {meta?.lastText || '??? ?????????'}
                      </div>
                    </div>
                    {item.unread_count > 0 && !item.participant?.notifications_muted && (
                      <span className="text-xs bg-blue-500/90 text-white rounded-full px-2 py-0.5">
                        {item.unread_count}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Chat window */}
      <div className={`${selectedThreadId ? 'col-span-12' : 'hidden'} md:col-span-8`}>
        {selectedThreadId && selectedMeta ? (
          <ChatWindow
            threadId={selectedThreadId}
            currentUserId={currentUserId}
            partnerId={selectedPartnerId || undefined}
            partnerName={selectedMeta.name}
            partnerAvatar={selectedMeta.avatar}
            isOnline={selectedMeta.online}
            onBack={() => setShowListOnMobile(true)}
          />
        ) : (
          <div className="card card-glow h-full flex items-center justify-center text-white/70">
            ???????? ??? ??? ?????? ???????.
          </div>
        )}
      </div>
    </div>
  );
}

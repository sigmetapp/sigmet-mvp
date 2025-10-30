"use client";

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import ChatWindow from '@/components/ChatWindow';
import { getPresenceMap } from '@/lib/dm/presence';

type ThreadListItem = {
  thread: {
    id: number;
    is_group: boolean;
    title: string | null;
    last_message_at: string | null;
  };
  participant: {
    thread_id: number;
    role: string;
    last_read_message_id?: number | null;
    notifications_muted?: boolean | null;
  };
  unread_count: number;
};

export default function DmPageClient({ currentUserId }: { currentUserId: string }) {
  const AVATAR_FALLBACK =
    "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='100%' height='100%' fill='%23222'/><circle cx='32' cy='24' r='14' fill='%23555'/><rect x='12' y='44' width='40' height='12' rx='6' fill='%23555'/></svg>";
  const [threads, setThreads] = useState<ThreadListItem[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);
  const [selectedPartnerProfile, setSelectedPartnerProfile] = useState<SimpleProfile | null>(null);
  const [creatingUserId, setCreatingUserId] = useState('');
  const [showListOnMobile, setShowListOnMobile] = useState(true);
  const [threadMeta, setThreadMeta] = useState<Record<number, { name: string; avatar: string | null; lastText: string; online: boolean }>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Quick contacts (following + connections)
  type SimpleProfile = { user_id: string; username: string | null; full_name: string | null; avatar_url: string | null };
  const [myUsername, setMyUsername] = useState<string | null>(null);
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const [connectionIds, setConnectionIds] = useState<string[]>([]);
  const [profiles, setProfiles] = useState<Record<string, SimpleProfile>>({});

  const selected = useMemo(() => threads.find((t) => t.thread.id === selectedThreadId) || null, [threads, selectedThreadId]);

  async function loadThreads() {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch('/api/dms/threads.list');
      const json = await resp.json();
      if (!json?.ok) throw new Error(json?.error || 'Failed to load threads');
      setThreads(json.threads || []);
      if (!selectedThreadId && (json.threads || []).length > 0) {
        setSelectedThreadId(json.threads[0].thread.id);
      }
    } catch (e: any) {
      setError(e?.message || 'Network error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadThreads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load selected thread partner and profile
  useEffect(() => {
    (async () => {
      setSelectedPartnerId(null);
      setSelectedPartnerProfile(null);
      if (!selectedThreadId || !currentUserId) return;
      try {
        const resp = await fetch(`/api/dms/thread.participants?thread_id=${selectedThreadId}`);
        const json = await resp.json();
        if (!json?.ok) return;
        const ids: string[] = json.participants || [];
        if (ids.length === 2) {
          const other = ids.find((id) => id !== currentUserId) || null;
          setSelectedPartnerId(other ?? null);
          if (other) {
            const { data: prof } = await supabase
              .from('profiles')
              .select('user_id, username, full_name, avatar_url')
              .eq('user_id', other)
              .maybeSingle();
            if (prof) {
              setSelectedPartnerProfile({
                user_id: (prof as any).user_id,
                username: (prof as any).username ?? null,
                full_name: (prof as any).full_name ?? null,
                avatar_url: (prof as any).avatar_url ?? null,
              });
            }
          }
        }
      } catch {
        // ignore
      }
    })();
  }, [selectedThreadId, currentUserId]);

  // Enrich thread list with avatar/name/last message/online
  useEffect(() => {
    (async () => {
      if (!threads.length || !currentUserId) { setThreadMeta({}); return; }
      const next: Record<number, { name: string; avatar: string | null; lastText: string; online: boolean }> = {};
      const top = threads.slice(0, 20);
      await Promise.all(top.map(async (item) => {
        try {
          // Find 1:1 partner when possible
          const resp = await fetch(`/api/dms/thread.participants?thread_id=${item.thread.id}`);
          const json = await resp.json();
          let name = item.thread.title || (item.thread.is_group ? 'Group' : `Thread #${item.thread.id}`);
          let avatar: string | null = null;
          let online = false;
          const ids: string[] = json?.participants || [];
          const other = ids.length === 2 ? (ids.find((id) => id !== currentUserId) || null) : null;
          if (other) {
            const { data: prof } = await supabase
              .from('profiles')
              .select('full_name, username, avatar_url')
              .eq('user_id', other)
              .maybeSingle();
            if (prof) {
              name = (prof as any).full_name || (prof as any).username || name;
              avatar = (prof as any).avatar_url || null;
            }
            try {
              const map = await getPresenceMap(other);
              online = Object.keys(map || {}).length > 0;
            } catch { online = false; }
          }
          // Last message snippet
          let lastText = '';
          try {
            const r = await fetch(`/api/dms/messages.list?thread_id=${item.thread.id}&limit=1`);
            const j = await r.json();
            const last = (j?.messages || [])[0];
            lastText = last?.body || '';
          } catch { lastText = ''; }
          next[item.thread.id] = { name, avatar, lastText, online };
        } catch {
          next[item.thread.id] = { name: item.thread.title || `Thread #${item.thread.id}`, avatar: null, lastText: '', online: false };
        }
      }));
      setThreadMeta(next);
    })();
  }, [threads, currentUserId]);

  // Load my username for connection discovery
  useEffect(() => {
    (async () => {
      if (!currentUserId) return;
      try {
        const { data } = await supabase.from('profiles').select('username').eq('user_id', currentUserId).maybeSingle();
        setMyUsername((data as any)?.username ?? null);
      } catch {
        setMyUsername(null);
      }
    })();
  }, [currentUserId]);

  // Load following and connection candidates
  useEffect(() => {
    (async () => {
      if (!currentUserId) return;
      try {
        // Following
        try {
          const { data: followingRows } = await supabase
            .from('follows')
            .select('followee_id')
            .eq('follower_id', currentUserId);
          setFollowingIds(((followingRows as any[]) || []).map((r) => r.followee_id as string));
        } catch {
          setFollowingIds([]);
        }

        // Simple connection heuristic: users who mentioned me in recent posts or list me in bio
        const mentionNeedles: string[] = [];
        if (myUsername && myUsername.trim() !== '') {
          mentionNeedles.push(`@${myUsername}`);
          mentionNeedles.push(`/u/${myUsername}`);
        }
        if (currentUserId) mentionNeedles.push(`/u/${currentUserId}`);

        const byUser: Record<string, true> = {};
        try {
          const { data: posts } = await supabase
            .from('posts')
            .select('user_id, body, created_at')
            .order('created_at', { ascending: false })
            .limit(300);
          for (const p of ((posts as any[]) || [])) {
            const uid = (p.user_id as string) || '';
            if (!uid || uid === currentUserId) continue;
            const body = String(p.body || '').toLowerCase();
            if (mentionNeedles.some((n) => body.includes(n.toLowerCase()))) {
              byUser[uid] = true;
            }
          }
        } catch {
          // ignore
        }

        if (myUsername && myUsername.trim() !== '') {
          try {
            const { data: profRefs } = await supabase
              .from('profiles')
              .select('user_id, bio')
              .ilike('bio', `%@${myUsername}%`)
              .limit(1000);
            for (const row of ((profRefs as any[]) || [])) {
              const uid = row.user_id as string;
              if (uid && uid !== currentUserId) byUser[uid] = true;
            }
          } catch {
            // ignore
          }
        }

        const connIds = Object.keys(byUser);
        setConnectionIds(connIds);

        // Load profiles for union of following + connections
        const unionIds = Array.from(new Set([...connIds, ...followingIds]));
        const idsToLoad = unionIds.slice(0, 50); // cap for UI
        if (idsToLoad.length > 0) {
          const { data: profs } = await supabase
            .from('profiles')
            .select('user_id, username, full_name, avatar_url')
            .in('user_id', idsToLoad);
          const map: Record<string, SimpleProfile> = {};
          for (const p of ((profs as any[]) || [])) {
            map[p.user_id as string] = {
              user_id: p.user_id as string,
              username: (p.username as string | null) ?? null,
              full_name: (p.full_name as string | null) ?? null,
              avatar_url: (p.avatar_url as string | null) ?? null,
            };
          }
          setProfiles(map);
        } else {
          setProfiles({});
        }
      } catch {
        // ignore
      }
    })();
    // We intentionally exclude followingIds from deps to avoid loops on initial load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, myUsername]);

  const quickContactIds = useMemo(() => {
    const merged = Array.from(new Set([...followingIds, ...connectionIds]));
    return merged.filter((id) => id && id !== currentUserId);
  }, [followingIds, connectionIds, currentUserId]);

  async function createThreadWithUser(targetUserId: string) {
    if (!targetUserId) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch('/api/dms/threads.create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participant_ids: [targetUserId] }),
      });
      const json = await resp.json();
      if (!json?.ok) throw new Error(json?.error || 'Failed to create thread');
      await loadThreads();
      setSelectedThreadId(json.thread?.id || null);
    } catch (e: any) {
      setError(e?.message || 'Network error');
    } finally {
      setLoading(false);
    }
  }

  function onQuickMessage(targetUserId: string) {
    void createThreadWithUser(targetUserId);
  }

  async function onCreateThread() {
    if (!creatingUserId.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch('/api/dms/threads.create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participant_ids: [creatingUserId.trim()] }),
      });
      const json = await resp.json();
      if (!json?.ok) throw new Error(json?.error || 'Failed to create thread');
      await loadThreads();
      setSelectedThreadId(json.thread?.id || null);
      setCreatingUserId('');
    } catch (e: any) {
      setError(e?.message || 'Network error');
    } finally {
      setLoading(false);
    }
  }

  async function blockUser() {
    if (!selectedPartnerId) return;
    try {
      const resp = await fetch('/api/dms/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: selectedPartnerId }),
      });
      const json = await resp.json();
      if (!json?.ok) throw new Error(json?.error || 'Block failed');
    } catch {
      // ignore
    }
  }

  async function unblockUser() {
    if (!selectedPartnerId) return;
    try {
      const resp = await fetch('/api/dms/unblock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: selectedPartnerId }),
      });
      const json = await resp.json();
      if (!json?.ok) throw new Error(json?.error || 'Unblock failed');
    } catch {
      // ignore
    }
  }

  return (
    <div className="grid grid-cols-12 gap-4 h-[calc(100vh-220px)] md:h-[70vh]">
      {/* Threads list */}
      <div className={`${selectedThreadId && !showListOnMobile ? 'hidden' : 'col-span-12'} md:col-span-4`}>
        <div className="card card-glow h-full flex flex-col">
          <div className="p-3 border-b border-white/10">
            <div className="flex gap-2">
              <input
                className="input flex-1"
                placeholder="ID пользователя для нового диалога"
                value={creatingUserId}
                onChange={(e) => setCreatingUserId(e.target.value)}
              />
              <button className="btn btn-primary" onClick={onCreateThread} disabled={loading}>
                Начать
              </button>
            </div>
            {error && <div className="text-red-400 text-sm mt-2">{error}</div>}
          </div>
          <div className="flex-1 overflow-y-auto smooth-scroll p-2">
            {threads.map((item) => {
              const meta = threadMeta[item.thread.id];
              return (
                <button
                  key={item.thread.id}
                  className={`w-full text-left p-2 rounded-xl flex items-center gap-3 hover:bg-white/5 transition ${selectedThreadId === item.thread.id ? 'bg-white/5' : ''}`}
                  onClick={() => {
                    setSelectedThreadId(item.thread.id);
                    setShowListOnMobile(false);
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={meta?.avatar || AVATAR_FALLBACK} alt="" className="h-10 w-10 rounded-full object-cover border border-white/10" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-white/90 font-medium truncate">{meta?.name || item.thread.title || (item.thread.is_group ? 'Group' : `Thread #${item.thread.id}`)}</span>
                      <span className={`h-2 w-2 rounded-full ${meta?.online ? 'bg-emerald-400' : 'bg-white/30'}`} />
                    </div>
                    <div className="text-xs text-white/60 truncate">{meta?.lastText || 'Без сообщений'}</div>
                  </div>
                  {item.unread_count > 0 && (
                    <span className="text-xs bg-blue-500/90 text-white rounded-full px-2 py-0.5">{item.unread_count}</span>
                  )}
                </button>
              );
            })}
            {threads.length === 0 && !loading && (
              <div className="text-sm text-white/60 py-2">Пока нет диалогов.</div>
            )}
          </div>
          {/* Quick contacts */}
          <div className="border-t border-white/10 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-white/80 font-medium">Быстрые контакты</div>
              <div className="text-white/50 text-xs">Подписки и связи</div>
            </div>
            {quickContactIds.length === 0 ? (
              <div className="text-white/60 text-sm">Нет предложений.</div>
            ) : (
              <div className="flex flex-wrap gap-3">
                {quickContactIds.slice(0, 16).map((uid) => {
                  const p = profiles[uid];
                  const name = p?.full_name || p?.username || uid.slice(0, 8);
                  const avatar = p?.avatar_url || AVATAR_FALLBACK;
                  return (
                    <div key={uid} className="flex items-center gap-2 px-2 py-1.5 rounded-xl border border-white/10 bg-white/5">
                      <img src={avatar} alt="" className="h-7 w-7 rounded-full object-cover border border-white/10" />
                      <div className="text-white/80 text-sm max-w-[120px] truncate">{name}</div>
                      <button className="ml-1 text-xs px-2 py-1 rounded-lg bg-white/90 text-black hover:bg-white" onClick={() => onQuickMessage(uid)}>
                        Написать
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chat window */}
      <div className={`${selectedThreadId ? 'col-span-12' : 'col-span-12'} md:col-span-8`}>
        {selectedThreadId ? (
          <ChatWindow
            threadId={selectedThreadId}
            currentUserId={currentUserId}
            targetUserId={selectedPartnerId ?? undefined}
            onBack={() => setShowListOnMobile(true)}
          />
        ) : (
          <div className="card card-glow h-full flex items-center justify-center text-white/70">Выберите диалог или создайте новый.</div>
        )}
      </div>
    </div>
  );
}

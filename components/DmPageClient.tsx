"use client";

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import ChatWindow from '@/components/ChatWindow';

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
  const [threads, setThreads] = useState<ThreadListItem[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);
  const [creatingUserId, setCreatingUserId] = useState('');
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
        const unionIds = Array.from(new Set([...connIds, ...(((await (async () => followingIds)) as any) || followingIds)]));
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
    return Array.from(new Set([...followingIds, ...connectionIds]));
  }, [followingIds, connectionIds]);

  function onQuickMessage(targetUserId: string) {
    setCreatingUserId(targetUserId);
    void onCreateThread();
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

  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-4">
        <div className="card p-3 grid gap-3">
          <div className="flex gap-2">
            <input
              className="input flex-1"
              placeholder="Start DM with user id"
              value={creatingUserId}
              onChange={(e) => setCreatingUserId(e.target.value)}
            />
            <button className="btn" onClick={onCreateThread} disabled={loading}>
              Start
            </button>
          </div>
          {error && <div className="text-red-400 text-sm">{error}</div>}
          <div className="divide-y divide-white/10">
            {threads.map((item) => (
              <button
                key={item.thread.id}
                className={`w-full text-left py-2 px-2 hover:bg-white/5 rounded flex items-center justify-between ${selectedThreadId === item.thread.id ? 'bg-white/5' : ''}`}
                onClick={() => setSelectedThreadId(item.thread.id)}
              >
                <span className="truncate">
                  {item.thread.title || (item.thread.is_group ? 'Group' : `Thread #${item.thread.id}`)}
                </span>
                {item.unread_count > 0 && (
                  <span className="text-xs bg-blue-500 text-white rounded px-1 py-0.5 ml-2">{item.unread_count}</span>
                )}
              </button>
            ))}
            {threads.length === 0 && !loading && (
              <div className="text-sm text-white/60 py-2">No conversations yet.</div>
            )}
          </div>
        </div>
      </div>
      <div className="col-span-8">
        {selectedThreadId ? (
          <ChatWindow threadId={selectedThreadId} currentUserId={currentUserId} />
        ) : (
          <div className="card p-4 text-white/70">Select a conversation or create a new one.</div>
        )}
      </div>
      {/* Quick contacts row – following + connections */}
      <div className="col-span-12">
        <div className="card p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-white/80 font-medium">Quick contacts</div>
            <div className="text-white/50 text-xs">Following and connections</div>
          </div>
          {quickContactIds.length === 0 ? (
            <div className="text-white/60 text-sm">No suggestions yet.</div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {quickContactIds.slice(0, 24).map((uid) => {
                const p = profiles[uid];
                const name = p?.full_name || p?.username || uid.slice(0, 8);
                const avatar = p?.avatar_url || '/avatar-fallback.png';
                return (
                  <div key={uid} className="flex items-center gap-2 px-2 py-1.5 rounded-xl border border-white/10 bg-white/5">
                    <img src={avatar} alt="" className="h-7 w-7 rounded-full object-cover border border-white/10" />
                    <div className="text-white/80 text-sm max-w-[140px] truncate">{name}</div>
                    <button className="ml-1 text-xs px-2 py-1 rounded-lg bg-white/90 text-black hover:bg-white" onClick={() => onQuickMessage(uid)}>
                      Message
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

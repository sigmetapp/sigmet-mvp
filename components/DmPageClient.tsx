"use client";

import { useEffect, useMemo, useState } from 'react';
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
    </div>
  );
}

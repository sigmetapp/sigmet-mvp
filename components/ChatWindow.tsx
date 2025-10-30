'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { uploadAttachment, getSignedUrlForAttachment, type DmAttachment } from '@/lib/dm/attachments';

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
  receipts?: Receipt[];
};

type Props = {
  threadId?: number;
  currentUserId?: string;
  // Optional explicit DM partner user id for 1:1 threads
  targetUserId?: string;
};

export default function ChatWindow({ threadId, currentUserId, targetUserId: explicitTargetUserId }: Props) {
  const [text, setText] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<DmAttachment[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const lastReadUpToRef = useRef<number | null>(null);
  const [targetUserId, setTargetUserId] = useState<string | null>(explicitTargetUserId ?? null);

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

  // Load messages for active thread (if provided)
  useEffect(() => {
    if (!threadId) return;
    let aborted = false;
    (async () => {
      try {
        const resp = await fetch(`/api/dms/messages.list?thread_id=${threadId}`);
        const json = await resp.json();
        if (!json?.ok || aborted) return;
        // Server returns newest first; display oldest first
        const list: DmMessage[] = (json.messages || []).slice().reverse();
        setMessages(list);
      } catch {}
    })();
    return () => {
      aborted = true;
    };
  }, [threadId]);

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

  async function blockUser() {
    if (!targetUserId) return;
    try {
      const resp = await fetch('/api/dms/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: targetUserId }),
      });
      const json = await resp.json();
      if (json?.ok) setLog((prev) => [...prev, `You blocked user ${targetUserId}`]);
      else setLog((prev) => [...prev, `Block failed: ${json?.error || 'unknown error'}`]);
    } catch (e) {
      setLog((prev) => [...prev, 'Block failed: network error']);
    }
  }

  async function unblockUser() {
    if (!targetUserId) return;
    try {
      const resp = await fetch('/api/dms/unblock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: targetUserId }),
      });
      const json = await resp.json();
      if (json?.ok) setLog((prev) => [...prev, `You unblocked user ${targetUserId}`]);
      else setLog((prev) => [...prev, `Unblock failed: ${json?.error || 'unknown error'}`]);
    } catch (e) {
      setLog((prev) => [...prev, 'Unblock failed: network error']);
    }
  }

  return (
    <div className="card grid gap-3">
      <div className="min-h-[160px] bg-black/10 rounded p-2 text-sm">
        {threadId ? (
          <div className="space-y-1">
            {messages.map((m) => {
              const status = computeStatus(m);
              return (
                <div key={m.id} className="flex gap-2 items-end">
                  <div className="flex-1">
                    <div>{m.body || ''}</div>
                  </div>
                  {status && (
                    <div className="shrink-0">
                      <StatusChecks status={status} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          log.map((l, i) => <div key={i}>{l}</div>)
        )}
      </div>
      {attachments.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {attachments.map((att) => (
            <div key={att.path} className="w-full h-24 bg-black/5 rounded flex items-center justify-center overflow-hidden">
              {att.type === 'image' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt={att.path}
                  src={previews[att.path]}
                  className="object-cover w-full h-full"
                />
              ) : (
                <a
                  href={previews[att.path]}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs underline px-2 text-center"
                >
                  {att.mime} ({Math.ceil(att.size / 1024)} KB)
                </a>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2 items-center">
        <input
          type="file"
          multiple
          onChange={onSelectFiles}
          className="file:mr-3 file:btn file:btn-sm"
        />
        <input
          className="input flex-1"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write a message"
        />
        <button className="btn" onClick={send}>
          Send
        </button>
        <button className="btn btn-outline" onClick={blockUser} disabled={!targetUserId} title={!targetUserId ? 'Select a user' : ''}>
          Block
        </button>
        <button className="btn btn-outline" onClick={unblockUser} disabled={!targetUserId} title={!targetUserId ? 'Select a user' : ''}>
          Unblock
        </button>
      </div>
    </div>
  );
}

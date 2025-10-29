'use client';

import { useCallback, useEffect, useState } from 'react';
import { uploadAttachment, getSignedUrlForAttachment, type DmAttachment } from '@/lib/dm/attachments';

export default function ChatWindow() {
  const [text, setText] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<DmAttachment[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});

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

  async function send() {
    if (!text.trim() && attachments.length === 0) return;
    setLog((prev) => [
      ...prev,
      `me: ${text.trim() || '(no text)'}${attachments.length ? ` [${attachments.length} attachment(s)]` : ''}`,
    ]);
    setText('');
    setAttachments([]);
    setPreviews({});
    // NOTE: Wire to /api/dms/messages.send with thread_id when available.
    // await fetch('/api/dms/messages.send', { method: 'POST', body: JSON.stringify({ thread_id, body: text, attachments }) })
  }

  return (
    <div className="card grid gap-3">
      <div className="min-h-[160px] bg-black/10 rounded p-2 text-sm">
        {log.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
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
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { Message } from '@/lib/dms';

function createClientComponentClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    }
  );
}

export type MessageChange = RealtimePostgresChangesPayload<{
  [key: string]: any;
}>;

/**
 * Hook to subscribe to realtime updates for messages in a thread.
 * Returns [messages, setMessages] tuple.
 */
export function useDmRealtime(
  threadId: number | null,
  initialMessages: Message[]
): [Message[], React.Dispatch<React.SetStateAction<Message[]>>] {
  const [messages, setMessages] = useState<Message[]>(initialMessages);

  useEffect(() => {
    if (!threadId) {
      setMessages(initialMessages);
      return;
    }

    // Update messages if initialMessages change
    setMessages(initialMessages);

    const supabase = createClientComponentClient();
    let cancelled = false;

    const channel = supabase
      .channel(`dms_messages:${threadId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'dms_messages',
          filter: `thread_id=eq.${threadId}`,
        },
        (payload: MessageChange) => {
          if (cancelled) return;

          const row = (payload.new || payload.old) as any;

          if (!row || typeof row !== 'object') return;

          if (payload.eventType === 'INSERT' && row) {
            const newMessage: Message = {
              id: row.id,
              thread_id: row.thread_id,
              sender_id: row.sender_id,
              kind: row.kind,
              body: row.body,
              attachments: row.attachments || [],
              created_at: row.created_at,
              edited_at: row.edited_at || null,
              deleted_at: row.deleted_at || null,
            };

            setMessages((prev) => {
              // Check if message already exists (avoid duplicates)
              if (prev.some((m) => m.id === newMessage.id)) {
                return prev;
              }
              // Insert message in correct position sorted by created_at and id
              const sorted = [...prev, newMessage].sort((a, b) => {
                const timeA = new Date(a.created_at).getTime();
                const timeB = new Date(b.created_at).getTime();
                if (timeA !== timeB) return timeA - timeB;
                return a.id - b.id;
              });
              return sorted;
            });
          } else if (payload.eventType === 'UPDATE' && row) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === row.id
                  ? {
                      ...m,
                      body: row.body,
                      edited_at: row.edited_at || null,
                      deleted_at: row.deleted_at || null,
                    }
                  : m
              )
            );
          } else if (payload.eventType === 'DELETE' && row) {
            setMessages((prev) => prev.filter((m) => m.id !== row.id));
          }
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [threadId, initialMessages]);

  return [messages, setMessages];
}

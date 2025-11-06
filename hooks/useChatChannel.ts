'use client';

import { useEffect, useRef, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import type { Message } from '@/lib/messages/types';

type UpsertLocal = (m: Partial<Message> & { client_msg_id: string }) => void;
type AddIncoming = (m: Message) => void;
type HasLocal = (clientMsgId: string) => boolean;

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

export function useChatChannel(
  threadId: number | string | null,
  {
    upsertLocal,
    addIncoming,
    hasLocal,
  }: {
    upsertLocal: UpsertLocal;
    addIncoming: AddIncoming;
    hasLocal: HasLocal;
  }
) {
  const supabase = useRef(createClientComponentClient()).current;
  const bc = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pg = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!threadId) {
      bc.current?.unsubscribe();
      pg.current?.unsubscribe();
      bc.current = null;
      pg.current = null;
      return;
    }

    const threadIdNum = typeof threadId === 'string' ? Number(threadId) : threadId;
    const threadIdStr = String(threadIdNum);

    // Broadcast channel for instant delivery
    bc.current = supabase
      .channel(`bc:${threadIdStr}`, { config: { broadcast: { self: false } } })
      .subscribe();

    // Postgres changes channel for durable source of truth
    pg.current = supabase
      .channel(`chat:${threadIdStr}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'dms_messages',
          filter: `thread_id=eq.${threadIdNum}`,
        },
        (payload) => {
          const msg = payload.new as any as Message;
          const clientMsgId = msg.client_msg_id || '';
          if (clientMsgId && hasLocal(clientMsgId)) {
            upsertLocal({
              client_msg_id: clientMsgId,
              id: typeof msg.id === 'string' ? parseInt(msg.id, 10) : msg.id,
              created_at: msg.created_at,
              status: 'sent',
            });
            return;
          }
          addIncoming({ 
            ...msg, 
            id: typeof msg.id === 'string' ? parseInt(msg.id, 10) : msg.id,
            status: 'sent' 
          });
        }
      )
      .subscribe();

    // Handle broadcast messages
    const handleBroadcast = (payload: any) => {
      const msg = payload as {
        client_msg_id: string;
        body: string | null;
        sender_id: string;
        thread_id: number | string;
        created_at: number;
      };
      if (msg.client_msg_id && !hasLocal(msg.client_msg_id)) {
        addIncoming({
          id: undefined,
          thread_id: msg.thread_id,
          sender_id: msg.sender_id,
          client_msg_id: msg.client_msg_id,
          body: msg.body || null,
          created_at: new Date(msg.created_at).toISOString(),
          status: 'sent',
        });
      }
    };

    bc.current?.on('broadcast', { event: 'message' }, ({ payload }) => {
      handleBroadcast(payload);
    });

    return () => {
      bc.current?.unsubscribe();
      pg.current?.unsubscribe();
      bc.current = null;
      pg.current = null;
    };
  }, [threadId, supabase, upsertLocal, addIncoming, hasLocal]);

  const sendBroadcast = useCallback(
    (m: Pick<Message, 'client_msg_id' | 'body' | 'sender_id'>) => {
      if (!threadId) return;
      bc.current?.send({
        type: 'broadcast',
        event: 'message',
        payload: {
          ...m,
          thread_id: threadId,
          created_at: Date.now(),
        },
      });
    },
    [threadId]
  );

  return { sendBroadcast };
}

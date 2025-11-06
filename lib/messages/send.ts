import { newClientMsgId } from '@/lib/id';
import type { Message } from '@/lib/messages/types';
import { createClient } from '@supabase/supabase-js';

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

export async function sendMessage(
  threadId: number | string,
  body: string | null,
  sessionUserId: string,
  upsertLocal: (m: Partial<Message> & { client_msg_id: string }) => void,
  sendBroadcast: (m: { client_msg_id: string; body: string | null; sender_id: string }) => void,
  attachments: unknown[] = []
): Promise<{ ok: boolean; error?: any; data?: any }> {
  const supabase = createClientComponentClient();
  const client_msg_id = newClientMsgId();

  // Optimistic local update
  upsertLocal({
    client_msg_id,
    thread_id: threadId,
    sender_id: sessionUserId,
    body,
    attachments: attachments.length > 0 ? attachments : undefined,
    created_at: new Date().toISOString(),
    status: 'sending',
  });

  // Instant broadcast for recipients
  sendBroadcast({ client_msg_id, body, sender_id: sessionUserId });

  // Single idempotent RPC call
  const { data, error } = await supabase.rpc('send_message', {
    p_thread_id: Number(threadId),
    p_client_msg_id: client_msg_id,
    p_body: body,
    p_kind: attachments.length > 0 ? 'media' : 'text',
    p_attachments: attachments.length > 0 ? attachments : [],
  });

  if (error) {
    upsertLocal({ client_msg_id, status: 'failed' });
    return { ok: false, error };
  }

  upsertLocal({
    client_msg_id,
    id: data.id,
    created_at: data.created_at,
    status: 'sent',
  });

  return { ok: true, data };
}

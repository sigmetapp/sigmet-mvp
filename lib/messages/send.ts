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

  // Use existing API endpoint which already handles idempotency via insert_dms_message
  // The insert_dms_message function checks for duplicate client_msg_id
  try {
    const response = await fetch('/api/dms/messages.send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        thread_id: Number(threadId),
        body: body,
        attachments: attachments.length > 0 ? attachments : [],
        client_msg_id: client_msg_id, // Pass client_msg_id for idempotency
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      upsertLocal({ client_msg_id, status: 'failed' });
      return { ok: false, error: errorData.error || `Failed to send: ${response.statusText}` };
    }

    const result = await response.json();
    if (!result.ok || !result.message) {
      upsertLocal({ client_msg_id, status: 'failed' });
      return { ok: false, error: result.error || 'Failed to send message' };
    }

    const message = result.message;
    upsertLocal({
      client_msg_id,
      id: typeof message.id === 'string' ? parseInt(message.id, 10) : message.id,
      created_at: message.created_at,
      status: 'sent',
    });

    return { ok: true, data: message };
  } catch (err: any) {
    upsertLocal({ client_msg_id, status: 'failed' });
    return { ok: false, error: err };
  }
}

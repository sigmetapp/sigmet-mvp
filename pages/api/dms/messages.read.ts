import type { NextApiRequest, NextApiResponse } from 'next';
import { createSupabaseForRequest, getAuthedClient } from '@/lib/dm/supabaseServer';
import { assertThreadId } from '@/lib/dm/threadId';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const { client, user } = await getAuthedClient(req);
    
    // Validate user.id is a valid UUID
    if (!user?.id || typeof user.id !== 'string') {
      return res.status(401).json({ ok: false, error: 'Invalid user ID' });
    }
    
    const execOrFetch = async (q: any): Promise<{ data: any; error: any }> => {
      if (typeof q?.exec === 'function') return await q.exec();
      return await q;
    };

      const threadId = (() => {
      try {
        return assertThreadId(req.body?.thread_id, 'Invalid thread_id');
      } catch {
        return null;
      }
    })();
    const upTo = String(req.body?.up_to_message_id || '');
      const rawSequence =
        req.body?.up_to_sequence_number ??
        req.body?.sequence_number ??
        req.body?.sequenceNumber ??
        null;
      const upToSequence =
        typeof rawSequence === 'number' && Number.isFinite(rawSequence)
          ? Math.trunc(rawSequence)
          : typeof rawSequence === 'string' && rawSequence.trim()
            ? Number.parseInt(rawSequence.trim(), 10)
            : null;

    if (!threadId || !upTo) {
      return res.status(400).json({ ok: false, error: 'Invalid input' });
    }

    // Ensure membership and get current last_read where supported. If the
    // column does not exist in the database, fall back to a membership-only check.
    let participant: any | null = null;
    {
      const { data, error } = await client
        .from('dms_thread_participants')
        .select('thread_id, last_read_message_id')
        .eq('thread_id', threadId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!error) {
        participant = data;
      } else if (String(error.message || '').toLowerCase().includes('last_read_message_id')) {
        const { data: data2, error: err2 } = await client
          .from('dms_thread_participants')
          .select('thread_id')
          .eq('thread_id', threadId)
          .eq('user_id', user.id)
          .maybeSingle();

        if (err2) {
          return res.status(400).json({ ok: false, error: err2.message });
        }

        participant = data2 ? { ...data2, last_read_message_id: null } : null;
      } else {
        return res.status(400).json({ ok: false, error: error.message });
      }
    }

    if (!participant) {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }

      let targetMessage: any | null = null;
      let targetError: any = null;

      const { data: msgCheck, error: msgCheckError } = await client
      .from('dms_messages')
      .select('id, created_at, sender_id')
      .eq('thread_id', threadId)
      .eq('id', upTo)
      .maybeSingle();

    if (msgCheckError) {
        targetError = msgCheckError;
      } else {
        targetMessage = msgCheck;
      }

      if (!targetMessage && upToSequence != null && !Number.isNaN(upToSequence)) {
        const { data: bySequence, error: sequenceError } = await client
          .from('dms_messages')
          .select('id, created_at, sender_id')
          .eq('thread_id', threadId)
          .eq('sequence_number', upToSequence)
          .maybeSingle();

        if (sequenceError) {
          targetError = sequenceError;
        } else {
          targetMessage = bySequence;
        }
      }

      if (!targetMessage) {
        const message = targetError?.message || 'up_to_message_id not in thread';
        console.error('Message not found in thread:', { threadId, upTo, upToSequence, error: targetError });
        return res.status(400).json({ ok: false, error: message });
      }

        const nextId = String(targetMessage.id ?? upTo);
        const serviceClient =
          process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY.trim() !== ''
            ? createSupabaseForRequest(req, true)
            : null;

        const privilegedClient = serviceClient ?? client;

    // Mark receipts via SQL helper to avoid client-side batching limits
    const { data: rpcData, error: rpcError } = await privilegedClient.rpc('dms_mark_receipts_up_to', {
      p_user_id: user.id,
      p_thread_id: threadId,
      p_message_id: nextId,
      p_sequence_number: upToSequence,
      p_status: 'read',
    });

    if (rpcError) {
      console.error('dms_mark_receipts_up_to failed:', rpcError);
      return res.status(400).json({ ok: false, error: rpcError.message || 'Failed to mark messages as read' });
    }

    const responsePayload = Array.isArray(rpcData) && rpcData.length > 0 ? rpcData[0] : null;

    return res.status(200).json({
      ok: true,
      last_read_message_id: responsePayload?.last_read_message_id ?? nextId,
      last_read_at: responsePayload?.last_read_at ?? targetMessage.created_at ?? new Date().toISOString(),
    });
  } catch (e: any) {
    const status = e?.status || 500;
    return res.status(status).json({ ok: false, error: e?.message || 'Internal error' });
  }
}

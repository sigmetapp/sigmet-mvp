import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthedClient } from '@/lib/dm/supabaseServer';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const { client, user } = await getAuthedClient(req);
    const messageId = Number(req.body?.message_id);
    const mode = (req.body?.mode as string | undefined) || 'everyone';

    if (!messageId || Number.isNaN(messageId)) {
      return res.status(400).json({ ok: false, error: 'Invalid message_id' });
    }

    // Ensure the message exists and requester is a participant
    const { data: msg, error: msgErr } = await client
      .from('dms_messages')
      .select('id, thread_id, sender_id, created_at')
      .eq('id', messageId)
      .maybeSingle();
    if (msgErr) return res.status(400).json({ ok: false, error: msgErr.message });
    if (!msg) return res.status(404).json({ ok: false, error: 'Not found' });

    // Only sender can delete for everyone in this simplified version
    if (mode === 'everyone' && msg.sender_id !== user.id) {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }

    // Soft-delete for everyone by setting deleted_at
    if (mode === 'everyone') {
      const { error } = await client
        .from('dms_messages')
        .update({ deleted_at: new Date().toISOString(), body: null, attachments: [] })
        .eq('id', messageId);
      if (error) return res.status(400).json({ ok: false, error: error.message });
      return res.status(200).json({ ok: true });
    }

    // TODO: delete for me only. Requires per-user hide (additional table). For now, no-op.
    return res.status(200).json({ ok: true });
  } catch (e: any) {
    const status = e?.status || 500;
    return res.status(status).json({ ok: false, error: e?.message || 'Internal error' });
  }
}

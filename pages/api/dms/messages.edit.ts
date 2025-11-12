import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthedClient } from '@/lib/dm/supabaseServer';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const { client, user } = await getAuthedClient(req);
    const messageId = Number(req.body?.message_id);
    const body = (req.body?.body as string | undefined) ?? '';

    if (!messageId || Number.isNaN(messageId)) {
      return res.status(400).json({ ok: false, error: 'Invalid message_id' });
    }
    if (typeof body !== 'string' || body.length > 4000) {
      return res.status(400).json({ ok: false, error: 'Invalid body' });
    }

    // Ensure the message exists and belongs to the user
    const { data: msg, error: msgErr } = await client
      .from('dms_messages')
      .select('id, thread_id, sender_id')
      .eq('id', messageId)
      .maybeSingle();
    if (msgErr) return res.status(400).json({ ok: false, error: msgErr.message });
    if (!msg) return res.status(404).json({ ok: false, error: 'Not found' });
    if (msg.sender_id !== user.id) return res.status(403).json({ ok: false, error: 'Forbidden' });

    let { data: updated, error: updErr } = await client
      .from('dms_messages')
      .update({ body, edited_at: new Date().toISOString() })
      .eq('id', messageId)
      .select('*, receipts:dms_message_receipts(user_id, status, updated_at)')
      .single();

    // If error is about updated_at column not existing, retry without it
    if (updErr && updErr.message?.includes('updated_at')) {
      console.warn('updated_at column not found in receipts, retrying without it');
      const retryResult = await client
        .from('dms_messages')
        .update({ body, edited_at: new Date().toISOString() })
        .eq('id', messageId)
        .select('*, receipts:dms_message_receipts(user_id, status)')
        .single();
      updated = retryResult.data;
      updErr = retryResult.error;
    }

    if (updErr || !updated) return res.status(400).json({ ok: false, error: updErr?.message || 'Failed to edit' });

    return res.status(200).json({ ok: true, message: updated });
  } catch (e: any) {
    const status = e?.status || 500;
    return res.status(status).json({ ok: false, error: e?.message || 'Internal error' });
  }
}

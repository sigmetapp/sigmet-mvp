import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthedClient } from '@/lib/dm/supabaseServer';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const { client, user } = await getAuthedClient(req);

    const threadId = Number(req.query.thread_id);
    if (!threadId || Number.isNaN(threadId)) {
      return res.status(400).json({ ok: false, error: 'Invalid thread_id' });
    }

    // Ensure membership
    const { data: membership } = await client
      .from('dms_thread_participants')
      .select('thread_id')
      .eq('thread_id', threadId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership) return res.status(403).json({ ok: false, error: 'Forbidden' });

    const before = req.query.before ? Number(req.query.before) : undefined;
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 50));

    // Include per-message receipts so the client can compute sent/delivered/read
    // Note: receipts are created by DB trigger on insert and updated to 'read'
    // via the messages.read endpoint.
    let q = client
      .from('dms_messages')
      .select('*, receipts:dms_message_receipts(user_id, status, updated_at)')
      .eq('thread_id', threadId)
      .order('id', { ascending: false })
      .limit(limit);

    if (before && !Number.isNaN(before)) {
      q = q.lt('id', before);
    }

    const { data: messages, error } = await q;
    if (error) return res.status(400).json({ ok: false, error: error.message });

    return res.status(200).json({ ok: true, messages });
  } catch (e: any) {
    const status = e?.status || 500;
    return res.status(status).json({ ok: false, error: e?.message || 'Internal error' });
  }
}

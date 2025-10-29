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

    // Ensure requester is a participant
    const { data: membership } = await client
      .from('dms_thread_participants')
      .select('thread_id')
      .eq('thread_id', threadId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!membership) return res.status(403).json({ ok: false, error: 'Forbidden' });

    const { data, error } = await client
      .from('dms_thread_participants')
      .select('user_id')
      .eq('thread_id', threadId);
    if (error) return res.status(400).json({ ok: false, error: error.message });

    const participants = (data || []).map((r: any) => r.user_id);
    return res.status(200).json({ ok: true, participants });
  } catch (e: any) {
    const status = e?.status || 500;
    return res.status(status).json({ ok: false, error: e?.message || 'Internal error' });
  }
}

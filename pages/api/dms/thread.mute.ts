import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthedClient } from '@/lib/dm/supabaseServer';
import { assertThreadId } from '@/lib/dm/threadId';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const { client, user } = await getAuthedClient(req);

    const threadId = (() => {
      try {
        return assertThreadId(req.body?.thread_id, 'Invalid thread_id');
      } catch {
        return null;
      }
    })();
    const muted = Boolean(req.body?.muted);
    // muted_until is accepted but not persisted in current schema

    if (!threadId) {
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

    const { error } = await client
      .from('dms_thread_participants')
      .update({ notifications_muted: muted })
      .eq('thread_id', threadId)
      .eq('user_id', user.id);

    if (error) return res.status(400).json({ ok: false, error: error.message });

    return res.status(200).json({ ok: true });
  } catch (e: any) {
    const status = e?.status || 500;
    return res.status(status).json({ ok: false, error: e?.message || 'Internal error' });
  }
}

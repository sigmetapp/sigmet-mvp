import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthedClient } from '@/lib/dm/supabaseServer';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const { client, user } = await getAuthedClient(req);

    const targetId = (req.body?.user_id as string | undefined)?.trim();
    if (!targetId || targetId === user.id) {
      return res.status(400).json({ ok: false, error: 'Invalid user_id' });
    }

    const { error } = await client
      .from('dms_blocks')
      .delete()
      .eq('blocker', user.id)
      .eq('blocked', targetId);

    if (error) return res.status(400).json({ ok: false, error: error.message });

    return res.status(200).json({ ok: true });
  } catch (e: any) {
    const status = e?.status || 500;
    return res.status(status).json({ ok: false, error: e?.message || 'Internal error' });
  }
}

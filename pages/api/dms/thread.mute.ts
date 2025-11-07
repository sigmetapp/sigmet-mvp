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
      const muteUntilRaw = typeof req.body?.mute_until === 'string' ? req.body.mute_until : null;
      const muteUntil =
        muted && muteUntilRaw && !Number.isNaN(Date.parse(muteUntilRaw))
          ? new Date(muteUntilRaw).toISOString()
          : null;

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
        .update({
          notifications_muted: muted,
          mute_until: muteUntil,
        })
        .eq('thread_id', threadId)
        .eq('user_id', user.id);

    if (error) return res.status(400).json({ ok: false, error: error.message });

      return res.status(200).json({
        ok: true,
        muted,
        mute_until: muteUntil,
      });
  } catch (e: any) {
    const status = e?.status || 500;
    return res.status(status).json({ ok: false, error: e?.message || 'Internal error' });
  }
}

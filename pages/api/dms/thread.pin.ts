import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthedClient } from '@/lib/dm/supabaseServer';
import { assertThreadId } from '@/lib/dm/threadId';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const { client, user } = await getAuthedClient(req);

    const threadId = (() => {
      try {
        return assertThreadId(req.body?.thread_id, 'Invalid thread_id');
      } catch {
        return null;
      }
    })();

    if (!threadId) {
      return res.status(400).json({ ok: false, error: 'Invalid thread_id' });
    }

    const pinned = Boolean(req.body?.pinned);
    const pinnedAtInput = typeof req.body?.pinned_at === 'string' ? req.body.pinned_at : null;
    const pinnedAt = pinned
      ? pinnedAtInput && !Number.isNaN(Date.parse(pinnedAtInput))
        ? new Date(pinnedAtInput).toISOString()
        : new Date().toISOString()
      : null;

    const { data: membership, error: membershipError } = await client
      .from('dms_thread_participants')
      .select('thread_id')
      .eq('thread_id', threadId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (membershipError) {
      return res.status(400).json({ ok: false, error: membershipError.message });
    }
    if (!membership) {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }

    const { error: updateError } = await client
      .from('dms_thread_participants')
      .update({
        is_pinned: pinned,
        pinned_at: pinnedAt,
      })
      .eq('thread_id', threadId)
      .eq('user_id', user.id);

    if (updateError) {
      return res.status(400).json({ ok: false, error: updateError.message });
    }

    return res.status(200).json({
      ok: true,
      pinned,
      pinned_at: pinnedAt,
    });
  } catch (e: any) {
    const status = e?.status || 500;
    return res.status(status).json({ ok: false, error: e?.message || 'Internal error' });
  }
}

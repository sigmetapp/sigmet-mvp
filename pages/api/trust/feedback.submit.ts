import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { getAuthedClient } from '@/lib/dm/supabaseServer';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const { user } = await getAuthedClient(req);

    const target_user_id = String(req.body?.target_user_id || '').trim();
    const valueRaw = String(req.body?.value || '').trim();
    const comment = (req.body?.comment as string | undefined) ?? null;

    if (!target_user_id) return res.status(400).json({ ok: false, error: 'target_user_id is required' });
    if (valueRaw !== 'up' && valueRaw !== 'down') return res.status(400).json({ ok: false, error: 'value must be "up" or "down"' });

    const value = valueRaw === 'up' ? 1 : -1;

    const admin = supabaseAdmin();
    const { error } = await admin.from('trust_feedback').insert({
      target_user_id,
      author_id: user.id,
      value,
      comment: comment || null,
    });

    if (error) return res.status(400).json({ ok: false, error: error.message });

    return res.status(200).json({ ok: true });
  } catch (e: any) {
    const status = e?.status || 500;
    return res.status(status).json({ ok: false, error: e?.message || 'Internal error' });
  }
}

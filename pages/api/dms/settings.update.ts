import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthedClient } from '@/lib/dm/supabaseServer';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const { client, user } = await getAuthedClient(req);

    const input = req.body || {};
    const allowed = [
      'dms_privacy',
      'push_enabled',
      'email_enabled',
      'mute_unknown',
      // notifications page fields
      'global_mute',
      'dnd_start',
      'dnd_end',
      'timezone',
      'sound_enabled',
    ] as const;
    const payload: Record<string, any> = { user_id: user.id, updated_at: new Date().toISOString() };
    for (const key of allowed) {
      if (key in input) payload[key] = input[key];
    }

    const { error } = await client
      .from('user_settings')
      .upsert(payload, { onConflict: 'user_id' });

    if (error) return res.status(400).json({ ok: false, error: error.message });

    return res.status(200).json({ ok: true });
  } catch (e: any) {
    const status = e?.status || 500;
    return res.status(status).json({ ok: false, error: e?.message || 'Internal error' });
  }
}

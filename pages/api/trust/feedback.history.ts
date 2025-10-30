import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { getServerSession } from '@/lib/auth/getServerSession';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const { user } = await getServerSession();
    if (!user) return res.status(401).json({ ok: false, error: 'Unauthorized' });

    const target_user_id = String(req.query?.target_user_id || '').trim();
    if (!target_user_id) return res.status(400).json({ ok: false, error: 'target_user_id is required' });

    // Only the owner can view their detailed change history
    if (user.id !== target_user_id) return res.status(403).json({ ok: false, error: 'Forbidden' });

    const admin = supabaseAdmin();
    const { data, error } = await admin
      .from('trust_feedback')
      .select('author_id, value, comment, created_at')
      .eq('target_user_id', target_user_id)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) return res.status(400).json({ ok: false, error: error.message });

    return res.status(200).json({ ok: true, items: data || [] });
  } catch (e: any) {
    const status = e?.status || 500;
    return res.status(status).json({ ok: false, error: e?.message || 'Internal error' });
  }
}

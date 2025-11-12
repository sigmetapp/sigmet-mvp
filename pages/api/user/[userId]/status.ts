import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabaseServer';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { userId } = req.query;
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'userId is required' });
    }

    const admin = supabaseAdmin();
    const { data, error } = await admin.auth.admin.getUserById(userId);
    
    if (error) throw error;
    if (!data?.user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isSuspended = data.user.user_metadata?.suspended === true;

    return res.status(200).json({ suspended: isSuspended });
  } catch (e: any) {
    console.error('user.status error', e);
    return res.status(500).json({ error: e?.message || 'Internal error' });
  }
}

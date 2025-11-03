import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabaseServer';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const admin = supabaseAdmin();

    const { data: badges, error } = await admin
      .from('badges')
      .select('*')
      .eq('is_active', true)
      .order('category', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching badges:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ badges: badges || [] });
  } catch (error: any) {
    console.error('badges/catalog error:', error);
    return res.status(500).json({ error: error?.message || 'Internal error' });
  }
}

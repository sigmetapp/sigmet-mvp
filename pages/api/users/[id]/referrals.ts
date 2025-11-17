import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabaseServer';

type ReferralsResponse = {
  count: number;
};

type ErrorResponse = {
  error: string;
  message?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ReferralsResponse | ErrorResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'User ID is required' });
  }

  try {
    const supabase = supabaseAdmin();

    // Try to read from invite_stats view first (aggregated counts)
    const { data, error } = await supabase
      .from('invite_stats')
      .select('accepted_count')
      .eq('user_id', id)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.error('Error loading invite_stats for user', id, error);
      throw error;
    }

    let count = data?.accepted_count ?? 0;

    // If invite_stats has no row (user never sent invites), fall back to direct count
    if (!data || error?.code === 'PGRST116') {
      const { count: fallbackCount, error: fallbackError } = await supabase
        .from('invites')
        .select('id', { count: 'exact', head: true })
        .eq('inviter_user_id', id)
        .eq('status', 'accepted');

      if (fallbackError) {
        console.error('Error loading fallback invites count for user', id, fallbackError);
        throw fallbackError;
      }

      count = fallbackCount || 0;
    }

    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.status(200).json({ count });
  } catch (error: any) {
    console.error('Failed to fetch referrals count for user', id, error);
    return res.status(500).json({
      error: 'Failed to fetch referrals count',
      message: error?.message || 'Unknown error',
    });
  }
}

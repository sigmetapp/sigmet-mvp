import type { NextApiRequest, NextApiResponse } from 'next';
import { calculateTrustFlowForUser, calculateAndSaveTrustFlow } from '@/lib/trustFlow';
import { supabaseAdmin } from '@/lib/supabaseServer';

/**
 * Test endpoint to debug Trust Flow calculation
 * GET /api/admin/trust-flow/test?userId=xxx
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId } = req.query;

  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ error: 'User ID is required' });
  }

  try {
    const supabase = supabaseAdmin();

    // Check if user exists
    const { data: profile } = await supabase
      .from('profiles')
      .select('user_id, username')
      .eq('user_id', userId)
      .maybeSingle();

    if (!profile) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check pushes
    const { data: pushes, error: pushesError } = await supabase
      .from('trust_pushes')
      .select('id, from_user_id, type, created_at')
      .eq('to_user_id', userId)
      .order('created_at', { ascending: true });

    // Calculate TF
    const tf = await calculateTrustFlowForUser(userId);

    // Try to save
    const savedTF = await calculateAndSaveTrustFlow(userId, {
      changeReason: 'test',
      calculatedBy: 'admin',
      useCache: false,
    });

    return res.status(200).json({
      userId,
      username: profile.username,
      pushCount: pushes?.length || 0,
      pushes: pushes?.slice(0, 5) || [],
      pushesError: pushesError?.message,
      calculatedTF: tf,
      savedTF,
      details: {
        hasPushes: (pushes?.length || 0) > 0,
        pushTypes: pushes?.map(p => p.type) || [],
      },
    });
  } catch (error: any) {
    console.error('[TF Test] Error:', error);
    return res.status(500).json({
      error: 'Test failed',
      message: error?.message || 'Unknown error',
      stack: error?.stack,
    });
  }
}

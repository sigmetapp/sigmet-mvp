import type { NextApiRequest, NextApiResponse } from 'next';
import { canUserPush } from '@/lib/trustFlow';
import { supabaseAdmin } from '@/lib/supabaseServer';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id: toUserId } = req.query;
  const { fromUserId } = req.body;

  if (!toUserId || typeof toUserId !== 'string') {
    return res.status(400).json({ error: 'User ID is required' });
  }

  if (!fromUserId || typeof fromUserId !== 'string') {
    return res.status(400).json({ error: 'fromUserId is required' });
  }

  // Verify user is authenticated
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const supabase = supabaseAdmin();
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user || user.id !== fromUserId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Prevent self-push
    if (fromUserId === toUserId) {
      return res.status(400).json({
        canPush: false,
        reason: 'Cannot push yourself',
      });
    }

    // Check if user can push (anti-gaming)
    const result = await canUserPush(fromUserId, toUserId, 5); // Max 5 pushes per month

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error checking push limit:', error);
    return res.status(500).json({
      error: 'Failed to check push limit',
      message: error?.message || 'Unknown error',
    });
  }
}

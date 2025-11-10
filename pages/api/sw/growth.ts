import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabaseServer';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = supabaseAdmin();

  // Get current user from session
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let userId: string | undefined;

  try {
    const token = authHeader.replace('Bearer ', '');
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !authUser) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    userId = (req.query.user_id as string) || authUser.id;
  } catch (authErr: any) {
    console.error('sw/growth auth error:', authErr);
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Get SW growth from sw_ledger for last 24 hours
    const { data: growth24h, error: error24h } = await supabase
      .from('sw_ledger')
      .select('points')
      .eq('user_id', userId)
      .gte('created_at', last24Hours.toISOString());

    // Get SW growth from sw_ledger for last 7 days
    const { data: growth7d, error: error7d } = await supabase
      .from('sw_ledger')
      .select('points')
      .eq('user_id', userId)
      .gte('created_at', last7Days.toISOString());

    if (error24h || error7d) {
      console.error('Error fetching SW growth:', error24h || error7d);
      return res.status(500).json({ 
        error: 'Failed to fetch SW growth',
        growth24h: 0,
        growth7d: 0
      });
    }

    const growth24hTotal = growth24h?.reduce((sum, item) => sum + (item.points || 0), 0) || 0;
    const growth7dTotal = growth7d?.reduce((sum, item) => sum + (item.points || 0), 0) || 0;

    return res.status(200).json({
      growth24h: growth24hTotal,
      growth7d: growth7dTotal
    });
  } catch (error: any) {
    console.error('Error in sw/growth:', error);
    return res.status(500).json({ 
      error: error.message || 'Failed to fetch SW growth',
      growth24h: 0,
      growth7d: 0
    });
  }
}

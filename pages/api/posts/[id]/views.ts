import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabaseServer';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  const postId = parseInt(id as string, 10);

  if (isNaN(postId)) {
    return res.status(400).json({ error: 'Invalid post ID' });
  }

  try {
    const supabase = supabaseAdmin();
    
    // Fetch views
    const { data: viewsData, error: viewsError } = await supabase.rpc('get_post_views_last_7_days', {
      p_post_id: postId,
    });

    if (viewsError) {
      console.error('Error fetching views:', viewsError);
      return res.status(500).json({ error: 'Failed to fetch views' });
    }

    // Fetch link clicks
    const { data: clicksData, error: clicksError } = await supabase.rpc('get_post_link_clicks_last_7_days', {
      p_post_id: postId,
    });

    if (clicksError) {
      console.error('Error fetching link clicks:', clicksError);
      // Don't fail if clicks table doesn't exist yet, just return empty array
    }

    return res.status(200).json({ 
      views: viewsData || [],
      linkClicks: clicksData || []
    });
  } catch (error: any) {
    console.error('Error in views API:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

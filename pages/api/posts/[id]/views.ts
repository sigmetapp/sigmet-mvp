import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

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
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const { data, error } = await supabase.rpc('get_post_views_last_7_days', {
      p_post_id: postId,
    });

    if (error) {
      console.error('Error fetching views:', error);
      return res.status(500).json({ error: 'Failed to fetch views' });
    }

    return res.status(200).json({ views: data || [] });
  } catch (error: any) {
    console.error('Error in views API:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

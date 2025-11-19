import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '@/lib/supabaseClient';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { data, error } = await supabase
      .from('educational_posts')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) {
      console.error('Error fetching educational posts:', error);
      return res.status(500).json({ error: 'Failed to fetch educational posts' });
    }

    return res.status(200).json({ posts: data || [] });
  } catch (error) {
    console.error('Error in educational-posts/list:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

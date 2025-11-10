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
    const { post_id } = req.query;
    if (!post_id) {
      return res.status(400).json({ error: 'Post ID is required' });
    }

    const admin = supabaseAdmin();
    const { data, error } = await admin
      .from('blog_comments')
      .select(`
        id,
        content,
        created_at,
        updated_at,
        author_id,
        profiles:author_id (
          username,
          full_name,
          avatar_url
        )
      `)
      .eq('post_id', parseInt(post_id as string, 10))
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching blog comments:', error);
      return res.status(500).json({ error: 'Failed to fetch blog comments' });
    }

    return res.status(200).json({ comments: data || [] });
  } catch (error: any) {
    console.error('Error in blog comments list API:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

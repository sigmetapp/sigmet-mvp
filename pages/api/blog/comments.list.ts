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
    // Try to select with parent_id, fallback to without if column doesn't exist
    let result = await admin
      .from('blog_comments')
      .select(`
        id,
        content,
        created_at,
        updated_at,
        author_id,
        parent_id
      `)
      .eq('post_id', parseInt(post_id as string, 10))
      .order('created_at', { ascending: true });
    
    let { data, error } = result;
    
    // If parent_id column doesn't exist (error code 42703), select without it
    if (error && (error.code === '42703' || error.message?.includes('parent_id') || error.message?.includes('column'))) {
      result = await admin
        .from('blog_comments')
        .select(`
          id,
          content,
          created_at,
          updated_at,
          author_id
        `)
        .eq('post_id', parseInt(post_id as string, 10))
        .order('created_at', { ascending: true });
      data = result.data;
      error = result.error;
      // Add null parent_id to all comments for backward compatibility
      if (data) {
        data = data.map((comment: any) => ({ ...comment, parent_id: null }));
      }
    }

    if (error) {
      console.error('Error fetching blog comments:', error);
      return res.status(500).json({ error: 'Failed to fetch blog comments' });
    }

    // Fetch profiles for all comments
    const comments = data || [];
    const authorIds = [...new Set(comments.map((c: any) => c.author_id))];
    
    let profilesMap = new Map();
    if (authorIds.length > 0) {
      const { data: profilesData } = await admin
        .from('profiles')
        .select('user_id, username, full_name, avatar_url')
        .in('user_id', authorIds);
      
      if (profilesData) {
        profilesMap = new Map(profilesData.map((p: any) => [p.user_id, p]));
      }
    }

    // Join profiles with comments
    const commentsWithProfiles = comments.map((comment: any) => ({
      ...comment,
      profiles: profilesMap.get(comment.author_id) || null
    }));

    return res.status(200).json({ comments: commentsWithProfiles });
  } catch (error: any) {
    console.error('Error in blog comments list API:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

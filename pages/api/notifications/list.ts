import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthedClient } from '@/lib/dm/supabaseServer';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { client, user } = await getAuthedClient(req);
    const userId = user.id;

    const { limit = 50, offset = 0 } = req.query;
    const limitNum = Math.min(Number(limit) || 50, 100);
    const offsetNum = Number(offset) || 0;

    // Get notifications with related data
    const { data: notifications, error } = await client
      .from('notifications')
      .select(`
        *,
        actor:profiles!notifications_actor_id_fkey(user_id, username, full_name, avatar_url),
        post:posts!notifications_post_id_fkey(id, text, author_id),
        comment:comments!notifications_comment_id_fkey(id, text, post_id, author_id),
        trust_feedback:trust_feedback!notifications_trust_feedback_id_fkey(id, value, comment, author_id)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offsetNum, offsetNum + limitNum - 1);

    if (error) throw error;

    // Get unread count
    const { count: unreadCount } = await client
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('read_at', null);

    return res.json({
      notifications: notifications || [],
      unreadCount: unreadCount || 0,
    });
  } catch (error: any) {
    console.error('Error fetching notifications:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthedClient } from '@/lib/dm/supabaseServer';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { client, user } = await getAuthedClient(req);
    const userId = user.id;

    const { notificationId, markAll } = req.body;

    if (markAll) {
      // Mark all notifications as read
      const { error } = await client
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', userId)
        .is('read_at', null);

      if (error) throw error;
      return res.json({ success: true });
    }

    if (!notificationId) {
      return res.status(400).json({ error: 'notificationId is required' });
    }

    // Mark single notification as read
    const { error } = await client
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', notificationId)
      .eq('user_id', userId);

    if (error) throw error;

    return res.json({ success: true });
  } catch (error: any) {
    console.error('Error marking notification as read:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

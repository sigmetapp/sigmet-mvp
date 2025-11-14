import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthedClient } from '@/lib/dm/supabaseServer';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { client, user } = await getAuthedClient(req);
    const userId = user.id;

    const { notificationId } = req.body;

    if (!notificationId || typeof notificationId !== 'number') {
      return res.status(400).json({ error: 'Invalid notification ID' });
    }

    // Mark notification as hidden
    const { error } = await client
      .from('notifications')
      .update({ hidden: true })
      .eq('id', notificationId)
      .eq('user_id', userId);

    if (error) throw error;

    return res.json({ success: true });
  } catch (error: any) {
    console.error('Error hiding notification:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

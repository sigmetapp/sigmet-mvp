import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabaseServer';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const admin = supabaseAdmin();
    const now = new Date();
    
    // Calculate time ranges
    const day24hAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const week7dAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const month30dAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Helper function to count records
    async function countRecords(table: string, filter?: (q: any) => any): Promise<number> {
      try {
        let q = admin.from(table).select('*', { count: 'exact', head: true });
        if (filter) q = filter(q);
        const { count, error } = await q;
        if (error) {
          console.warn(`Error counting ${table}:`, error);
          return 0;
        }
        return typeof count === 'number' ? count : 0;
      } catch (err) {
        console.warn(`Exception counting ${table}:`, err);
        return 0;
      }
    }

    // Fetch all statistics in parallel
    const [
      newUsers24h,
      newUsers7d,
      newUsers30d,
      newPosts24h,
      newPosts7d,
      newPosts30d,
      newComments24h,
      newComments7d,
      newComments30d,
      newReactions24h,
      newReactions7d,
      newReactions30d,
    ] = await Promise.all([
      // New users (profiles)
      countRecords('profiles', (q) => q.gte('created_at', day24hAgo)),
      countRecords('profiles', (q) => q.gte('created_at', week7dAgo)),
      countRecords('profiles', (q) => q.gte('created_at', month30dAgo)),
      
      // New posts
      countRecords('posts', (q) => q.gte('created_at', day24hAgo)),
      countRecords('posts', (q) => q.gte('created_at', week7dAgo)),
      countRecords('posts', (q) => q.gte('created_at', month30dAgo)),
      
      // New comments
      countRecords('comments', (q) => q.gte('created_at', day24hAgo)),
      countRecords('comments', (q) => q.gte('created_at', week7dAgo)),
      countRecords('comments', (q) => q.gte('created_at', month30dAgo)),
      
      // New reactions
      countRecords('post_reactions', (q) => q.gte('created_at', day24hAgo)),
      countRecords('post_reactions', (q) => q.gte('created_at', week7dAgo)),
      countRecords('post_reactions', (q) => q.gte('created_at', month30dAgo)),
    ]);

    return res.status(200).json({
      newUsers: {
        '24h': newUsers24h,
        '7d': newUsers7d,
        '30d': newUsers30d,
      },
      newPosts: {
        '24h': newPosts24h,
        '7d': newPosts7d,
        '30d': newPosts30d,
      },
      newComments: {
        '24h': newComments24h,
        '7d': newComments7d,
        '30d': newComments30d,
      },
      newReactions: {
        '24h': newReactions24h,
        '7d': newReactions7d,
        '30d': newReactions30d,
      },
    });
  } catch (error: any) {
    console.error('Error fetching public stats:', error);
    return res.status(500).json({ 
      error: error?.message || 'Internal server error',
      // Return zeros on error so UI doesn't break
      newUsers: { '24h': 0, '7d': 0, '30d': 0 },
      newPosts: { '24h': 0, '7d': 0, '30d': 0 },
      newComments: { '24h': 0, '7d': 0, '30d': 0 },
      newReactions: { '24h': 0, '7d': 0, '30d': 0 },
    });
  }
}

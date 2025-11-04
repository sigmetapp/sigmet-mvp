import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const ADMIN_EMAILS = new Set<string>(['seosasha@gmail.com']);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  // Get current user from session
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  
  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const email = user.email || '';
  const isAdmin = ADMIN_EMAILS.has(email);

  if (req.method === 'GET') {
    try {
      const { data: weights, error } = await supabase
        .from('sw_weights')
        .select('*')
        .eq('id', 1)
        .single();

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      return res.status(200).json({ weights });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  }

  if (req.method === 'POST' || req.method === 'PUT') {
    if (!isAdmin) {
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }

    try {
      const {
        registration_points,
        profile_complete_points,
        growth_total_points_multiplier,
        follower_points,
        connection_first_points,
        connection_repeat_points,
        post_points,
        comment_points,
        reaction_points,
      } = req.body;

      const { data: weights, error } = await supabase
        .from('sw_weights')
        .update({
          registration_points: registration_points ?? 50,
          profile_complete_points: profile_complete_points ?? 20,
          growth_total_points_multiplier: growth_total_points_multiplier ?? 1,
          follower_points: follower_points ?? 5,
          connection_first_points: connection_first_points ?? 100,
          connection_repeat_points: connection_repeat_points ?? 40,
          post_points: post_points ?? 20,
          comment_points: comment_points ?? 10,
          reaction_points: reaction_points ?? 1,
          updated_at: new Date().toISOString(),
          updated_by: user.id,
        })
        .eq('id', 1)
        .select()
        .single();

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      return res.status(200).json({ weights });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const toNumberOrNull = (value: any) => {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.replace('Bearer ', '');
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { recordId, recordType } = req.query;

  if (!recordId || typeof recordId !== 'string') {
    return res.status(400).json({ error: 'recordId is required' });
  }

  if (!recordType || typeof recordType !== 'string') {
    return res.status(400).json({ error: 'recordType is required' });
  }

  const normalizedType = recordType as 'habit_checkin' | 'user_achievement' | 'user_task';

  if (!['habit_checkin', 'user_achievement', 'user_task'].includes(normalizedType)) {
    return res.status(400).json({ error: 'Invalid record type' });
  }

  try {
    let postId: number | null = null;
    let needsMigration = false;

    if (normalizedType === 'habit_checkin') {
      let { data, error } = await supabase
        .from('habit_checkins')
        .select('post_id')
        .eq('id', recordId)
        .maybeSingle();

      if (error && error.message?.includes('post_id')) {
        needsMigration = true;
        const fallback = await supabase
          .from('habit_checkins')
          .select('id')
          .eq('id', recordId)
          .maybeSingle();

        if (fallback.error && fallback.error.code !== 'PGRST116') {
          return res.status(500).json({ error: fallback.error.message });
        }
        data = null;
        error = null;
      } else if (error) {
        return res.status(500).json({ error: error.message });
      }

      postId = toNumberOrNull(data?.post_id);
    } else if (normalizedType === 'user_achievement') {
      let { data, error } = await supabase
        .from('user_achievements')
        .select('post_id')
        .eq('id', recordId)
        .maybeSingle();

      if (error && error.message?.includes('post_id')) {
        needsMigration = true;
        const fallback = await supabase
          .from('user_achievements')
          .select('id')
          .eq('id', recordId)
          .maybeSingle();

        if (fallback.error && fallback.error.code !== 'PGRST116') {
          return res.status(500).json({ error: fallback.error.message });
        }
        data = null;
        error = null;
      } else if (error) {
        return res.status(500).json({ error: error.message });
      }

      postId = toNumberOrNull(data?.post_id);
    } else {
      // user_task fallback has no associated post link
      postId = null;
    }

    return res.status(200).json({ postId, needsMigration });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

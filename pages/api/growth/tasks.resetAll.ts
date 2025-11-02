import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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

  try {
    // Get all active user tasks
    const { data: activeTasks, error: fetchError } = await supabase
      .from('user_tasks')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'active');

    if (fetchError) {
      return res.status(500).json({ error: fetchError.message });
    }

    if (!activeTasks || activeTasks.length === 0) {
      return res.status(200).json({ 
        success: true, 
        message: 'No active tasks to reset',
        count: 0 
      });
    }

    // Archive all active tasks
    const { data: updated, error: updateError } = await supabase
      .from('user_tasks')
      .update({ status: 'archived' })
      .eq('user_id', user.id)
      .eq('status', 'active')
      .select('id');

    if (updateError) {
      return res.status(500).json({ error: updateError.message });
    }

    return res.status(200).json({ 
      success: true, 
      message: `Reset ${updated?.length || 0} tasks`,
      count: updated?.length || 0 
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

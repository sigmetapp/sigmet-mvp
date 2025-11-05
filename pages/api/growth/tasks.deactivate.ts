import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabaseServer';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = supabaseAdmin();

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

  const { userTaskId } = req.body;

  if (!userTaskId) {
    return res.status(400).json({ error: 'userTaskId is required' });
  }

  try {
    // Verify user owns this task
    const { data: userTask, error: fetchError } = await supabase
      .from('user_tasks')
      .select('*')
      .eq('id', userTaskId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !userTask) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Update to archived
    const { data: updated, error: updateError } = await supabase
      .from('user_tasks')
      .update({ status: 'archived' })
      .eq('id', userTaskId)
      .select()
      .single();

    if (updateError) {
      return res.status(500).json({ error: updateError.message });
    }

    return res.status(200).json({ success: true, userTask: updated });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

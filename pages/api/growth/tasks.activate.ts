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

  const { taskId } = req.body;

  if (!taskId) {
    return res.status(400).json({ error: 'taskId is required' });
  }

  try {
    // Check if task exists and get its direction
    const { data: task, error: taskError } = await supabase
      .from('growth_tasks')
      .select('id, direction_id, growth_directions!inner(slug)')
      .eq('id', taskId)
      .single();

    if (taskError || !task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Check if direction is in development (inactive)
    const inactiveDirections = ['creativity', 'mindfulness_purpose', 'relationships', 'career', 'finance'];
    const directionSlug = (task.growth_directions as any)?.slug;
    if (directionSlug && inactiveDirections.includes(directionSlug)) {
      return res.status(400).json({ error: 'Cannot activate tasks from directions that are currently in development' });
    }

    // Check if already activated
    const { data: existing, error: checkError } = await supabase
      .from('user_tasks')
      .select('id, status')
      .eq('user_id', user.id)
      .eq('task_id', taskId)
      .maybeSingle();

    if (checkError && checkError.code !== 'PGRST116') {
      return res.status(500).json({ error: checkError.message });
    }

    if (existing) {
      // Update to active if it was archived
      const { data: updated, error: updateError } = await supabase
        .from('user_tasks')
        .update({
          status: 'active',
          started_at: new Date().toISOString(),
          completed_at: null,
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (updateError) {
        return res.status(500).json({ error: updateError.message });
      }

      return res.status(200).json({ success: true, userTask: updated });
    }

    // Create new user_task
    const { data: newUserTask, error: insertError } = await supabase
      .from('user_tasks')
      .insert({
        user_id: user.id,
        task_id: taskId,
        status: 'active',
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      return res.status(500).json({ error: insertError.message });
    }

    return res.status(200).json({ success: true, userTask: newUserTask });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

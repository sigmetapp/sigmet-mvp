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

  const { userTaskId, proofUrl, note, postId } = req.body;

  if (!userTaskId) {
    return res.status(400).json({ error: 'userTaskId is required' });
  }

  try {
    // Get user_task and task details
    const { data: userTask, error: taskError } = await supabase
      .from('user_tasks')
      .select(`
        *,
        growth_tasks!inner(*)
      `)
      .eq('id', userTaskId)
      .eq('user_id', user.id)
      .single();

    if (taskError || !userTask) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const task = userTask.growth_tasks as any;

    // Validate it's a goal
    if (task.task_type !== 'goal') {
      return res.status(400).json({ error: 'Task is not a goal' });
    }

    // Check if already completed
    if (userTask.status === 'completed') {
      return res.status(400).json({ error: 'Goal already completed' });
    }

    // Create achievement
    const completedAt = new Date().toISOString();
    const pointsAwarded = task.base_points || 50;

    const achievementPayloadBase: Record<string, any> = {
      user_task_id: userTaskId,
      user_id: user.id,
      completed_at: completedAt,
      points_awarded: pointsAwarded,
      proof_url: proofUrl || null,
      note: note || null,
    };

    let achievementPayload = { ...achievementPayloadBase };
    if (postId !== null && postId !== undefined) {
      achievementPayload.post_id = postId;
    }

    let achievementResult = await supabase
      .from('user_achievements')
      .insert(achievementPayload)
      .select()
      .single();

    if (achievementResult.error && achievementResult.error.message?.includes('post_id')) {
      achievementPayload = { ...achievementPayloadBase };
      delete achievementPayload.post_id;
      achievementResult = await supabase
        .from('user_achievements')
        .insert(achievementPayload)
        .select()
        .single();
    }

    if (achievementResult.error) {
      return res.status(500).json({ error: achievementResult.error.message });
    }

    const achievement = achievementResult.data;

    // Update user_task to completed
    const { data: updatedTask, error: updateError } = await supabase
      .from('user_tasks')
      .update({
        status: 'completed',
        completed_at: completedAt,
      })
      .eq('id', userTaskId)
      .select()
      .single();

    if (updateError) {
      return res.status(500).json({ error: updateError.message });
    }

    // Create ledger entry
    const { error: ledgerError } = await supabase
      .from('sw_ledger')
      .insert({
        user_id: user.id,
        direction_id: task.direction_id,
        user_task_id: userTaskId,
        reason: 'goal_complete',
        points: pointsAwarded,
        meta: { proof_url: proofUrl || null, note: note || null },
      });

    if (ledgerError) {
      return res.status(500).json({ error: ledgerError.message });
    }

    return res.status(200).json({
      success: true,
      achievement,
      userTask: updatedTask,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

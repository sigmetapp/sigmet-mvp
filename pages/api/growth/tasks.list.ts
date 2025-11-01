import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
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

  const { directionId } = req.query;

  if (!directionId || typeof directionId !== 'string') {
    return res.status(400).json({ error: 'directionId is required' });
  }

  try {
    // Get all tasks for this direction
    const { data: tasks, error: tasksError } = await supabase
      .from('growth_tasks')
      .select('*')
      .eq('direction_id', directionId)
      .order('sort_index', { ascending: true });

    if (tasksError) {
      return res.status(500).json({ error: tasksError.message });
    }

    // Get user's activated tasks
    const { data: userTasks, error: userTasksError } = await supabase
      .from('user_tasks')
      .select('*')
      .eq('user_id', user.id)
      .in('task_id', (tasks || []).map((t) => t.id));

    if (userTasksError) {
      return res.status(500).json({ error: userTasksError.message });
    }

    const userTaskMap = new Map((userTasks || []).map((ut) => [ut.task_id, ut]));

    // Get last check-in for habits
    const habitTaskIds = (tasks || [])
      .filter((t) => t.task_type === 'habit')
      .map((t) => t.id);

    let lastCheckins: any[] = [];
    if (habitTaskIds.length > 0) {
      const userTaskIds = (userTasks || [])
        .filter((ut) => habitTaskIds.includes(ut.task_id))
        .map((ut) => ut.id);

      if (userTaskIds.length > 0) {
        const { data: checkins, error: checkinsError } = await supabase
          .from('habit_checkins')
          .select('user_task_id, checked_at')
          .in('user_task_id', userTaskIds)
          .order('checked_at', { ascending: false })
          .limit(100);

        if (!checkinsError && checkins) {
          // Get the latest check-in per user_task_id
          const latestCheckinMap = new Map<string, any>();
          checkins.forEach((checkin) => {
            const existing = latestCheckinMap.get(checkin.user_task_id);
            if (!existing || new Date(checkin.checked_at) > new Date(existing.checked_at)) {
              latestCheckinMap.set(checkin.user_task_id, checkin);
            }
          });
          lastCheckins = Array.from(latestCheckinMap.values());
        }
      }
    }

    const checkinMap = new Map(
      lastCheckins.map((c) => {
        const userTask = (userTasks || []).find((ut) => ut.id === c.user_task_id);
        return userTask ? [userTask.task_id, c.checked_at] : [null, null];
      }).filter(([taskId]) => taskId !== null) as [string, string][]
    );

    // Group by type and combine
    const habits = (tasks || [])
      .filter((t) => t.task_type === 'habit')
      .map((task) => {
        const userTask = userTaskMap.get(task.id);
        const lastChecked = checkinMap.get(task.id);
        return {
          ...task,
          isActivated: !!userTask,
          userTask: userTask || null,
          lastChecked: lastChecked || null,
        };
      });

    const goals = (tasks || [])
      .filter((t) => t.task_type === 'goal')
      .map((task) => {
        const userTask = userTaskMap.get(task.id);
        return {
          ...task,
          isActivated: !!userTask,
          userTask: userTask || null,
        };
      });

    return res.status(200).json({ habits, goals });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

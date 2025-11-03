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

  try {
    // Get achievements (completed goals) with task details
    const { data: achievements, error: achievementsError } = await supabase
      .from('user_achievements')
      .select(`
        id,
        points_awarded,
        completed_at,
        user_task_id,
        user_tasks!inner(
          growth_tasks!inner(
            id,
            title,
            task_type,
            base_points,
            direction_id,
            growth_directions!inner(
              id,
              title,
              slug,
              emoji
            )
          )
        )
      `)
      .eq('user_id', user.id)
      .order('completed_at', { ascending: false });

    if (achievementsError) {
      return res.status(500).json({ error: achievementsError.message });
    }

    // Keep track of achievement user_task ids to prevent duplicates
    const achievementUserTaskIds = new Set(
      (achievements || []).map((achievement: any) => achievement.user_task_id)
    );

    // Get completed user tasks with task details (fallback for legacy data / habits marked completed)
    const { data: completedUserTasks, error: tasksError } = await supabase
      .from('user_tasks')
      .select(`
        id,
        status,
        completed_at,
        growth_tasks!inner(
          id,
          title,
          task_type,
          base_points,
          direction_id,
          growth_directions!inner(
            id,
            title,
            slug,
            emoji
          )
        )
      `)
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false });

    if (tasksError) {
      return res.status(500).json({ error: tasksError.message });
    }

    // Get habit check-ins with task details
    const { data: habitCheckins, error: habitCheckinsError } = await supabase
      .from('habit_checkins')
      .select(`
        id,
        points_awarded,
        checked_at,
        user_task_id,
        user_tasks!inner(
          growth_tasks!inner(
            id,
            title,
            task_type,
            base_points,
            direction_id,
            growth_directions!inner(
              id,
              title,
              slug,
              emoji
            )
          )
        )
      `)
      .eq('user_id', user.id)
      .order('checked_at', { ascending: false });

    if (habitCheckinsError) {
      return res.status(500).json({ error: habitCheckinsError.message });
    }

    const formattedGoalAchievements = (achievements || []).map((achievement: any) => {
      const userTaskInfo = achievement.user_tasks;
      const taskInfo = userTaskInfo?.growth_tasks;

      if (!taskInfo) {
        return null;
      }

      const direction = taskInfo.growth_directions;

      return {
        id: `${achievement.id}`,
        taskId: taskInfo.id,
        title: taskInfo.title,
        taskType: taskInfo.task_type,
        pointsAwarded: achievement.points_awarded ?? taskInfo.base_points ?? 0,
        basePoints: taskInfo.base_points ?? 0,
        completedAt: achievement.completed_at,
        direction: {
          id: direction.id,
          title: direction.title,
          slug: direction.slug,
          emoji: direction.emoji,
        },
      };
    }).filter(Boolean);

    const formattedHabitCheckins = (habitCheckins || []).map((checkin: any) => {
      const userTaskInfo = checkin.user_tasks;
      const taskInfo = userTaskInfo?.growth_tasks;

      if (!taskInfo) {
        return null;
      }

      const direction = taskInfo.growth_directions;

      return {
        id: `checkin-${checkin.id}`,
        taskId: taskInfo.id,
        title: taskInfo.title,
        taskType: taskInfo.task_type,
        pointsAwarded: checkin.points_awarded ?? taskInfo.base_points ?? 0,
        basePoints: taskInfo.base_points ?? 0,
        completedAt: checkin.checked_at,
        direction: {
          id: direction.id,
          title: direction.title,
          slug: direction.slug,
          emoji: direction.emoji,
        },
      };
    }).filter(Boolean);

    const formattedFallbackTasks = (completedUserTasks || [])
      .filter((task: any) => !achievementUserTaskIds.has(task.id))
      .map((task: any) => {
        const taskInfo = task.growth_tasks;
        const direction = taskInfo.growth_directions;

        return {
          id: `${task.id}`,
          taskId: taskInfo.id,
          title: taskInfo.title,
          taskType: taskInfo.task_type,
          pointsAwarded: taskInfo.base_points ?? 0,
          basePoints: taskInfo.base_points ?? 0,
          completedAt: task.completed_at,
          direction: {
            id: direction.id,
            title: direction.title,
            slug: direction.slug,
            emoji: direction.emoji,
          },
        };
      });

    const combinedCompletedTasks = [
      ...formattedGoalAchievements,
      ...formattedHabitCheckins,
      ...formattedFallbackTasks,
    ].sort(
      (a, b) => {
        const timeA = a?.completedAt ? new Date(a.completedAt).getTime() : 0;
        const timeB = b?.completedAt ? new Date(b.completedAt).getTime() : 0;
        return timeB - timeA;
      }
    );

    // Get total points from ledger
    const { data: ledgerEntries, error: ledgerError } = await supabase
      .from('sw_ledger')
      .select('points')
      .eq('user_id', user.id);

    if (ledgerError) {
      return res.status(500).json({ error: ledgerError.message });
    }

    const totalPoints = (ledgerEntries || []).reduce(
      (sum, entry) => sum + (entry.points || 0),
      0
    );

    return res.status(200).json({
      completedTasks: combinedCompletedTasks,
      totalPoints,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabaseServer';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
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

  try {
    const toNumberOrNull = (value: any) => {
      if (value === null || value === undefined) return null;
      const num = Number(value);
      return Number.isFinite(num) ? num : null;
    };

    // Get achievements (completed goals) with task details
    const achievementsSelectWithPost = `
        id,
        points_awarded,
        completed_at,
        user_task_id,
        post_id,
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
      `;

    const achievementsSelectFallback = `
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
      `;

    let { data: achievements, error: achievementsError } = await supabase
      .from('user_achievements')
      .select(achievementsSelectWithPost)
      .eq('user_id', user.id)
      .order('completed_at', { ascending: false });

    if (achievementsError && achievementsError.message?.includes('post_id')) {
      const fallback = await supabase
        .from('user_achievements')
        .select(achievementsSelectFallback)
        .eq('user_id', user.id)
        .order('completed_at', { ascending: false });
      achievements = fallback.data;
      achievementsError = fallback.error;
    }

    if (achievementsError) {
      console.warn('[Completed Tasks API] Error loading achievements:', achievementsError);
      // Continue with empty achievements if it's a permission/not found issue
      if (achievementsError.code === 'PGRST116' || achievementsError.code === '42501') {
        achievements = [];
      } else {
        return res.status(500).json({ error: achievementsError.message || 'Failed to load achievements' });
      }
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
      console.warn('[Completed Tasks API] Error loading tasks:', tasksError);
      // Continue with empty tasks if it's a permission/not found issue
      if (tasksError.code === 'PGRST116' || tasksError.code === '42501') {
        // tasks will be empty array
      } else {
        return res.status(500).json({ error: tasksError.message || 'Failed to load tasks' });
      }
    }

    // Get habit check-ins with task details
    const habitCheckinsSelectWithPost = `
        id,
        points_awarded,
        checked_at,
        user_task_id,
        post_id,
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
      `;

    const habitCheckinsSelectFallback = `
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
      `;

    let { data: habitCheckins, error: habitCheckinsError } = await supabase
      .from('habit_checkins')
      .select(habitCheckinsSelectWithPost)
      .eq('user_id', user.id)
      .order('checked_at', { ascending: false });

    if (habitCheckinsError && habitCheckinsError.message?.includes('post_id')) {
      const fallback = await supabase
        .from('habit_checkins')
        .select(habitCheckinsSelectFallback)
        .eq('user_id', user.id)
        .order('checked_at', { ascending: false });
      habitCheckins = fallback.data;
      habitCheckinsError = fallback.error;
    }

    if (habitCheckinsError) {
      console.warn('[Completed Tasks API] Error loading habit checkins:', habitCheckinsError);
      // Continue with empty checkins if it's a permission/not found issue
      if (habitCheckinsError.code === 'PGRST116' || habitCheckinsError.code === '42501') {
        habitCheckins = [];
      } else {
        return res.status(500).json({ error: habitCheckinsError.message || 'Failed to load habit checkins' });
      }
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
        recordId: String(achievement.id),
        recordType: 'user_achievement' as const,
        taskId: taskInfo.id,
        title: taskInfo.title,
        taskType: taskInfo.task_type,
        pointsAwarded: achievement.points_awarded ?? taskInfo.base_points ?? 0,
        basePoints: taskInfo.base_points ?? 0,
        completedAt: achievement.completed_at,
        postId: toNumberOrNull(achievement.post_id),
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
        recordId: String(checkin.id),
        recordType: 'habit_checkin' as const,
        taskId: taskInfo.id,
        title: taskInfo.title,
        taskType: taskInfo.task_type,
        pointsAwarded: checkin.points_awarded ?? taskInfo.base_points ?? 0,
        basePoints: taskInfo.base_points ?? 0,
        completedAt: checkin.checked_at,
        postId: toNumberOrNull(checkin.post_id),
        direction: {
          id: direction.id,
          title: direction.title,
          slug: direction.slug,
          emoji: direction.emoji,
        },
      };
    }).filter(Boolean);

    const formattedFallbackTasks = completedUserTasksArray
      .filter((task: any) => !achievementUserTaskIds.has(task.id))
      .map((task: any) => {
        const taskInfo = task.growth_tasks;
        const direction = taskInfo.growth_directions;

        return {
          id: `${task.id}`,
          recordId: String(task.id),
          recordType: 'user_task' as const,
          taskId: taskInfo.id,
          title: taskInfo.title,
          taskType: taskInfo.task_type,
          pointsAwarded: taskInfo.base_points ?? 0,
          basePoints: taskInfo.base_points ?? 0,
          completedAt: task.completed_at,
          postId: null,
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
      console.warn('[Completed Tasks API] Error loading ledger:', ledgerError);
      // Continue with empty ledger if it's a permission/not found issue
      if (ledgerError.code === 'PGRST116' || ledgerError.code === '42501') {
        // ledgerEntries will be empty array
      } else {
        return res.status(500).json({ error: ledgerError.message || 'Failed to load ledger' });
      }
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
    console.error('[Completed Tasks API] Unexpected error:', error);
    return res.status(500).json({ error: error.message || 'Unexpected error' });
  }
}

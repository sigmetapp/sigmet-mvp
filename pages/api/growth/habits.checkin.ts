import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabaseServer';

function getStartOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getStartOfMonth(date: Date): Date {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function calculateStreak(
  period: 'daily' | 'weekly' | 'monthly',
  lastCheckin: string | null,
  currentStreak: number,
  checkins: Array<{ checked_at: string }>
): number {
  const now = new Date();
  let newStreak = currentStreak;

  if (period === 'daily') {
    if (!lastCheckin) {
      return 1; // First check-in
    }
    const lastDate = new Date(lastCheckin);
    const lastDay = getStartOfDay(lastDate);
    const today = getStartOfDay(now);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (lastDay.getTime() === today.getTime()) {
      // Same day - streak continues
      return currentStreak;
    } else if (lastDay.getTime() === yesterday.getTime()) {
      // Yesterday - streak continues
      return currentStreak + 1;
    } else {
      // Gap - reset streak
      return 1;
    }
  } else if (period === 'weekly') {
    if (!lastCheckin) {
      return 1;
    }
    const lastDate = new Date(lastCheckin);
    const lastWeek = getStartOfWeek(lastDate);
    const currentWeek = getStartOfWeek(now);
    const prevWeek = new Date(currentWeek);
    prevWeek.setDate(prevWeek.getDate() - 7);

    if (lastWeek.getTime() === currentWeek.getTime()) {
      // Same week
      return currentStreak;
    } else if (lastWeek.getTime() === prevWeek.getTime()) {
      // Previous week - streak continues
      return currentStreak + 1;
    } else {
      // Gap - reset streak
      return 1;
    }
  } else if (period === 'monthly') {
    if (!lastCheckin) {
      return 1;
    }
    const lastDate = new Date(lastCheckin);
    const lastMonth = getStartOfMonth(lastDate);
    const currentMonth = getStartOfMonth(now);
    const prevMonth = new Date(currentMonth);
    prevMonth.setMonth(prevMonth.getMonth() - 1);

    if (lastMonth.getTime() === currentMonth.getTime()) {
      // Same month
      return currentStreak;
    } else if (lastMonth.getTime() === prevMonth.getTime()) {
      // Previous month - streak continues
      return currentStreak + 1;
    } else {
      // Gap - reset streak
      return 1;
    }
  }

  return newStreak;
}

function getStreakMilestone(period: 'daily' | 'weekly' | 'monthly', streak: number): number | null {
  if (period === 'daily') {
    if ([7, 14, 30, 60, 90].includes(streak)) return streak;
  } else if (period === 'weekly') {
    if ([4, 12, 24].includes(streak)) return streak;
  } else if (period === 'monthly') {
    if ([3, 6, 12].includes(streak)) return streak;
  }
  return null;
}

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

  const { userTaskId, postId } = req.body;

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

    // Validate it's a habit
    if (task.task_type !== 'habit') {
      return res.status(400).json({ error: 'Task is not a habit' });
    }

    if (!task.period) {
      return res.status(400).json({ error: 'Habit period is required' });
    }

    // Get last check-in
    const { data: checkins, error: checkinsError } = await supabase
      .from('habit_checkins')
      .select('checked_at')
      .eq('user_task_id', userTaskId)
      .order('checked_at', { ascending: false })
      .limit(100);

    if (checkinsError) {
      return res.status(500).json({ error: checkinsError.message });
    }

    const lastCheckin = checkins && checkins.length > 0 ? checkins[0].checked_at : null;

    // Calculate new streak
    const newStreak = calculateStreak(
      task.period,
      lastCheckin,
      userTask.current_streak || 0,
      checkins || []
    );
    const newLongestStreak = Math.max(userTask.longest_streak || 0, newStreak);
    const newTotalCheckins = (userTask.total_checkins || 0) + 1;

    // Create check-in
    const checkedAt = new Date().toISOString();
    const pointsAwarded = task.base_points || 20;

    const baseInsertPayload: Record<string, any> = {
      user_task_id: userTaskId,
      user_id: user.id,
      checked_at: checkedAt,
      points_awarded: pointsAwarded,
    };

    let insertPayload = { ...baseInsertPayload };
    if (postId !== null && postId !== undefined) {
      insertPayload.post_id = postId;
    }

    let checkinResult = await supabase
      .from('habit_checkins')
      .insert(insertPayload)
      .select()
      .single();

    if (checkinResult.error && checkinResult.error.message?.includes('post_id')) {
      insertPayload = { ...baseInsertPayload };
      delete insertPayload.post_id;
      checkinResult = await supabase
        .from('habit_checkins')
        .insert(insertPayload)
        .select()
        .single();
    }

    if (checkinResult.error) {
      return res.status(500).json({ error: checkinResult.error.message });
    }

    const checkin = checkinResult.data;

    // Update user_task with new streak and counters, ensure status remains active
    const { data: updatedTask, error: updateError } = await supabase
      .from('user_tasks')
      .update({
        current_streak: newStreak,
        longest_streak: newLongestStreak,
        total_checkins: newTotalCheckins,
        status: 'active', // Ensure status remains active after check-in
      })
      .eq('id', userTaskId)
      .select()
      .single();

    if (updateError) {
      return res.status(500).json({ error: updateError.message });
    }

    // Create ledger entry for check-in
    const { error: ledgerError } = await supabase
      .from('sw_ledger')
      .insert({
        user_id: user.id,
        direction_id: task.direction_id,
        user_task_id: userTaskId,
        reason: 'habit_checkin',
        points: pointsAwarded,
        meta: { period: task.period, streak: newStreak },
      });

    if (ledgerError) {
      return res.status(500).json({ error: ledgerError.message });
    }

    // Check for streak milestone bonus
    const milestone = getStreakMilestone(task.period, newStreak);
    if (milestone) {
      const bonusPoints = Math.ceil((task.base_points || 20) * 2);
      await supabase.from('sw_ledger').insert({
        user_id: user.id,
        direction_id: task.direction_id,
        user_task_id: userTaskId,
        reason: 'streak_bonus',
        points: bonusPoints,
        meta: { period: task.period, streak: milestone },
      });
    }

    return res.status(200).json({
      success: true,
      checkin,
      userTask: updatedTask,
      streak: newStreak,
      bonus: milestone ? { milestone, points: Math.ceil((task.base_points || 20) * 2) } : null,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

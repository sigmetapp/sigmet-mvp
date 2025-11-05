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
    // Get all user tasks
    const { data: userTasks, error: tasksError } = await supabase
      .from('user_tasks')
      .select(`
        *,
        growth_tasks!inner(
          direction_id,
          task_type
        )
      `)
      .eq('user_id', user.id)
      .in('status', ['active', 'completed']);

    if (tasksError) {
      return res.status(500).json({ error: tasksError.message });
    }

    // Get all directions
    const { data: directions, error: dirError } = await supabase
      .from('growth_directions')
      .select('id, slug, title, emoji')
      .order('sort_index', { ascending: true });

    if (dirError) {
      return res.status(500).json({ error: dirError.message });
    }

    // Get SW points per direction from ledger
    const { data: ledger, error: ledgerError } = await supabase
      .from('sw_ledger')
      .select('direction_id, points')
      .eq('user_id', user.id);

    if (ledgerError) {
      return res.status(500).json({ error: ledgerError.message });
    }

    // Calculate summaries per direction
    const directionStats = new Map<string, {
      direction: { id: string; slug: string; title: string; emoji: string };
      activeHabits: number;
      activeGoals: number;
      completedHabits: number;
      completedGoals: number;
      maxStreak: number;
      totalSWPoints: number;
      lastActivity: string | null;
    }>();

    // Initialize all directions
    (directions || []).forEach((dir) => {
      directionStats.set(dir.id, {
        direction: dir,
        activeHabits: 0,
        activeGoals: 0,
        completedHabits: 0,
        completedGoals: 0,
        maxStreak: 0,
        totalSWPoints: 0,
        lastActivity: null,
      });
    });

    // Count tasks per direction
    (userTasks || []).forEach((ut: any) => {
      const stats = directionStats.get(ut.growth_tasks.direction_id);
      if (!stats) return;

      if (ut.status === 'active') {
        if (ut.growth_tasks.task_type === 'habit') {
          stats.activeHabits++;
          stats.maxStreak = Math.max(stats.maxStreak, ut.longest_streak || 0);
        } else {
          stats.activeGoals++;
        }
      } else if (ut.status === 'completed') {
        if (ut.growth_tasks.task_type === 'habit') {
          stats.completedHabits++;
        } else {
          stats.completedGoals++;
        }
      }
    });

    // Sum SW points
    (ledger || []).forEach((entry) => {
      const stats = directionStats.get(entry.direction_id);
      if (stats) {
        stats.totalSWPoints += entry.points || 0;
      }
    });

    // Get last activity per direction from checkins and achievements
    const userTaskIds = (userTasks || []).map((ut: any) => ut.id);
    if (userTaskIds.length > 0) {
      const { data: checkins, error: checkinsError } = await supabase
        .from('habit_checkins')
        .select('user_task_id, checked_at, user_tasks!inner(growth_tasks!inner(direction_id))')
        .in('user_task_id', userTaskIds)
        .order('checked_at', { ascending: false })
        .limit(100);

      if (!checkinsError && checkins) {
        checkins.forEach((checkin: any) => {
          const stats = directionStats.get(checkin.user_tasks.growth_tasks.direction_id);
          if (stats && (!stats.lastActivity || checkin.checked_at > stats.lastActivity)) {
            stats.lastActivity = checkin.checked_at;
          }
        });
      }

      const { data: achievements, error: achievementsError } = await supabase
        .from('user_achievements')
        .select('completed_at, user_tasks!inner(growth_tasks!inner(direction_id))')
        .in('user_task_id', userTaskIds)
        .order('completed_at', { ascending: false })
        .limit(100);

      if (!achievementsError && achievements) {
        achievements.forEach((achievement: any) => {
          const stats = directionStats.get(achievement.user_tasks.growth_tasks.direction_id);
          if (stats && (!stats.lastActivity || achievement.completed_at > stats.lastActivity)) {
            stats.lastActivity = achievement.completed_at;
          }
        });
      }
    }

    // Convert to array
    const result = Array.from(directionStats.values());

    // Overall totals
    const totals = {
      activeHabits: result.reduce((sum, s) => sum + s.activeHabits, 0),
      activeGoals: result.reduce((sum, s) => sum + s.activeGoals, 0),
      completedHabits: result.reduce((sum, s) => sum + s.completedHabits, 0),
      completedGoals: result.reduce((sum, s) => sum + s.completedGoals, 0),
      totalSWPoints: result.reduce((sum, s) => sum + s.totalSWPoints, 0),
      maxStreak: Math.max(...result.map((s) => s.maxStreak), 0),
    };

    return res.status(200).json({ directions: result, totals });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

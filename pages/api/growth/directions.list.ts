import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabaseServer';

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
    // Get all directions
    const { data: directions, error: dirError } = await supabase
      .from('growth_directions')
      .select('*')
      .order('sort_index', { ascending: true });

    if (dirError) {
      return res.status(500).json({ error: dirError.message });
    }

    // Get user's selected directions
    const { data: userSelections, error: selError } = await supabase
      .from('user_selected_directions')
      .select('direction_id, is_primary')
      .eq('user_id', user.id);

    if (selError) {
      return res.status(500).json({ error: selError.message });
    }

    const selectedIds = new Set((userSelections || []).map((s) => s.direction_id));

    // Get progress summaries per direction
    const { data: tasks, error: tasksError } = await supabase
      .from('user_tasks')
      .select(`
        task_id,
        status,
        current_streak,
        longest_streak,
        growth_tasks!inner(direction_id, task_type)
      `)
      .eq('user_id', user.id)
      .in('status', ['active', 'completed']);

    if (tasksError) {
      return res.status(500).json({ error: tasksError.message });
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
      activeHabits: number;
      activeGoals: number;
      maxStreak: number;
      swPoints: number;
    }>();

    // Initialize all directions
    directions.forEach((d) => {
      directionStats.set(d.id, {
        activeHabits: 0,
        activeGoals: 0,
        maxStreak: 0,
        swPoints: 0,
      });
    });

    // Count active tasks
    (tasks || []).forEach((task: any) => {
      const stats = directionStats.get(task.growth_tasks.direction_id);
      if (stats && task.status === 'active') {
        if (task.growth_tasks.task_type === 'habit') {
          stats.activeHabits++;
          stats.maxStreak = Math.max(stats.maxStreak, task.longest_streak || 0);
        } else {
          stats.activeGoals++;
        }
      }
    });

    // Sum SW points
    (ledger || []).forEach((entry) => {
      const stats = directionStats.get(entry.direction_id);
      if (stats) {
        stats.swPoints += entry.points || 0;
      }
    });

    // Combine results
    const result = directions.map((dir) => {
      const stats = directionStats.get(dir.id) || {
        activeHabits: 0,
        activeGoals: 0,
        maxStreak: 0,
        swPoints: 0,
      };
      const isSelected = selectedIds.has(dir.id);
      const selection = (userSelections || []).find((s) => s.direction_id === dir.id);

      return {
        ...dir,
        isSelected,
        isPrimary: selection?.is_primary || false,
        stats,
      };
    });

    return res.status(200).json({ directions: result });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

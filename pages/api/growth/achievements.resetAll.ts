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

  // Get current user from session
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.replace('Bearer ', '');
  
  // Create client with user's token for RPC calls
  const supabaseAnon = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  // Verify user and get user info
  const { data: { user }, error: authError } = await supabaseAnon.auth.getUser();
  
  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Check if user is admin using user's context
    const { data: isAdmin, error: adminError } = await supabaseAnon.rpc('is_admin_uid');
    
    if (adminError || !isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Use service role client for admin operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // Delete all user achievements
    const { error: achievementsError } = await supabase
      .from('user_achievements')
      .delete()
      .eq('user_id', user.id);

    if (achievementsError) {
      return res.status(500).json({ error: `Failed to delete achievements: ${achievementsError.message}` });
    }

    // Delete all habit check-ins
    const { error: checkinsError } = await supabase
      .from('habit_checkins')
      .delete()
      .eq('user_id', user.id);

    if (checkinsError) {
      return res.status(500).json({ error: `Failed to delete check-ins: ${checkinsError.message}` });
    }

    // Delete all SW ledger entries (points)
    const { error: ledgerError } = await supabase
      .from('sw_ledger')
      .delete()
      .eq('user_id', user.id);

    if (ledgerError) {
      return res.status(500).json({ error: `Failed to delete ledger entries: ${ledgerError.message}` });
    }

    // Reset all completed user_tasks to archived
    const { data: completedTasks, error: fetchCompletedError } = await supabase
      .from('user_tasks')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'completed');

    if (fetchCompletedError) {
      return res.status(500).json({ error: `Failed to fetch completed tasks: ${fetchCompletedError.message}` });
    }

    if (completedTasks && completedTasks.length > 0) {
      const { error: updateTasksError } = await supabase
        .from('user_tasks')
        .update({ status: 'archived' })
        .eq('user_id', user.id)
        .eq('status', 'completed');

      if (updateTasksError) {
        return res.status(500).json({ error: `Failed to reset completed tasks: ${updateTasksError.message}` });
      }
    }

    return res.status(200).json({ 
      success: true, 
      message: 'All achievements have been reset',
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

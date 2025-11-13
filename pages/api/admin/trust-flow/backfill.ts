import type { NextApiRequest, NextApiResponse } from 'next';
import { calculateAndSaveTrustFlow } from '@/lib/trustFlow';
import { supabaseAdmin } from '@/lib/supabaseServer';

/**
 * Admin endpoint to backfill Trust Flow values for all users
 * This recalculates and caches TF for users who have trust pushes
 * 
 * Usage: POST /api/admin/trust-flow/backfill
 * Query params:
 *   - limit: number of users to process (default: 100)
 *   - offset: offset for pagination (default: 0)
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // TODO: Add admin authentication check
  // For now, this is open - should be restricted in production

  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;

    const supabase = supabaseAdmin();

    // Get users who have trust pushes
    const { data: users, error: usersError } = await supabase
      .rpc('get_users_needing_tf_recalc')
      .range(offset, offset + limit - 1);

    if (usersError) {
      console.error('[Backfill] Error getting users:', usersError);
      return res.status(500).json({ 
        error: 'Failed to get users',
        details: usersError.message 
      });
    }

    if (!users || users.length === 0) {
      return res.status(200).json({
        message: 'No users to process',
        processed: 0,
        results: [],
      });
    }

    console.log(`[Backfill] Processing ${users.length} users...`);

    // Process each user
    const results = [];
    for (const user of users) {
      try {
        const oldValue = Number(user.current_tf) || 5.0;
        const newValue = await calculateAndSaveTrustFlow(user.user_id, {
          changeReason: 'backfill',
          calculatedBy: 'admin',
          useCache: false, // Force recalculation
          metadata: {
            backfill_batch: true,
            push_count: Number(user.push_count) || 0,
          },
        });

        const changed = Math.abs(oldValue - newValue) > 0.01; // Consider changed if difference > 0.01

        results.push({
          user_id: user.user_id,
          old_value: oldValue,
          new_value: newValue,
          changed,
          push_count: Number(user.push_count) || 0,
        });

        console.log(`[Backfill] User ${user.user_id}: ${oldValue.toFixed(2)} -> ${newValue.toFixed(2)} ${changed ? '(CHANGED)' : ''}`);
      } catch (error: any) {
        console.error(`[Backfill] Error processing user ${user.user_id}:`, error);
        results.push({
          user_id: user.user_id,
          error: error.message || 'Unknown error',
        });
      }
    }

    const changedCount = results.filter(r => r.changed).length;

    return res.status(200).json({
      message: `Processed ${users.length} users`,
      processed: users.length,
      changed: changedCount,
      results,
    });
  } catch (error: any) {
    console.error('[Backfill] Error:', error);
    return res.status(500).json({
      error: 'Backfill failed',
      message: error.message || 'Unknown error',
    });
  }
}

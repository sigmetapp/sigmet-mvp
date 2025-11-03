// Badge evaluation utility
// Call this after user actions to evaluate and award badges

import { supabaseAdmin } from '@/lib/supabaseServer';
import { captureServer } from '@/lib/analytics.server';

/**
 * Evaluate badges for a user and award any that meet conditions
 * This should be called after events like post creation, comment creation, etc.
 */
export async function evaluateUserBadges(userId: string): Promise<number> {
  try {
    const admin = supabaseAdmin();

    // Call the database function to evaluate badges
    const { data: newBadgesCount, error } = await admin.rpc(
      'evaluate_user_badges',
      {
        user_uuid: userId,
      }
    );

    if (error) {
      console.error('Error evaluating badges:', error);
      return 0;
    }

    // Get newly awarded badges for analytics
    const { data: recentBadges } = await admin
      .from('user_badges')
      .select('badge_key')
      .eq('user_id', userId)
      .gte('awarded_at', new Date(Date.now() - 1000).toISOString()); // Last 1 second

    // Emit analytics events for newly awarded badges
    for (const badge of recentBadges || []) {
      await captureServer('badge_awarded', {
        badge_key: badge.badge_key,
        user_id: userId,
      });
    }

    return (newBadgesCount as number) || 0;
  } catch (error: any) {
    console.error('Error in evaluateUserBadges:', error);
    return 0;
  }
}

/**
 * Helper to call badge evaluation after user actions
 * Use this in API routes after creating posts, comments, likes, etc.
 */
export async function evaluateBadgesAfterAction(userId: string): Promise<void> {
  // Run asynchronously to not block the request
  evaluateUserBadges(userId).catch((error) => {
    console.error('Error evaluating badges after action:', error);
  });
}

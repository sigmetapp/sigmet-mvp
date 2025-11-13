import { supabaseAdmin } from './supabaseServer';

export type TrustPushType = 'positive' | 'negative';

// Base Trust Flow value for new users (users with no pushes)
export const BASE_TRUST_FLOW = 5.0;

export interface TrustPush {
  id: number;
  from_user_id: string;
  to_user_id: string;
  type: TrustPushType;
  reason?: string | null;
  context_type?: string | null;
  context_id?: string | null;
  created_at: string;
}

export interface UserActivityData {
  activityScore: number;
  accountAgeDays: number;
  weight: number;
}

/**
 * Calculate user activity score based on posts, comments, SW, and contributions
 */
export async function calculateUserActivityScore(userId: string): Promise<number> {
  const supabase = supabaseAdmin();
  
  try {
    // Get posts count - try author_id first, fallback to user_id if needed
    let postsCount = 0;
    const postsResult = await supabase
      .from('posts')
      .select('id', { count: 'exact', head: true })
      .eq('author_id', userId);
    if (postsResult.error && postsResult.error.message?.includes('column') && postsResult.error.message?.includes('author_id')) {
      // Fallback to user_id if author_id doesn't exist
      const fallbackResult = await supabase
        .from('posts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);
      postsCount = fallbackResult.count || 0;
    } else {
      postsCount = postsResult.count || 0;
    }
    
    // Get comments count - try author_id first, fallback to user_id if needed
    let commentsCount = 0;
    const commentsResult = await supabase
      .from('comments')
      .select('id', { count: 'exact', head: true })
      .eq('author_id', userId);
    if (commentsResult.error && commentsResult.error.message?.includes('column') && commentsResult.error.message?.includes('author_id')) {
      // Fallback to user_id if author_id doesn't exist
      const fallbackResult = await supabase
        .from('comments')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);
      commentsCount = fallbackResult.count || 0;
    } else {
      commentsCount = commentsResult.count || 0;
    }
    
    // Get SW score (cached value)
    const { data: swScore } = await supabase
      .from('sw_scores')
      .select('total')
      .eq('user_id', userId)
      .maybeSingle();
    
    const swPoints = swScore?.total || 0;
    
    // Activity score = posts + comments + SW (normalized)
    // Normalize SW by dividing by 100 to keep it in reasonable range
    const activityScore = (postsCount || 0) + (commentsCount || 0) + Math.floor(swPoints / 100);
    
    return Math.max(0, activityScore);
  } catch (error) {
    console.error('Error calculating activity score:', error);
    return 0;
  }
}

/**
 * Calculate account age in days
 */
export async function calculateAccountAgeDays(userId: string): Promise<number> {
  const supabase = supabaseAdmin();
  
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('created_at')
      .eq('user_id', userId)
      .maybeSingle();
    
    if (!profile?.created_at) {
      // Fallback to auth.users if profile doesn't exist
      const { data: authUser } = await supabase.auth.admin.getUserById(userId);
      if (authUser?.user?.created_at) {
        const created = new Date(authUser.user.created_at);
        const now = new Date();
        const diffMs = now.getTime() - created.getTime();
        return Math.floor(diffMs / (1000 * 60 * 60 * 24));
      }
      return 0;
    }
    
    const created = new Date(profile.created_at);
    const now = new Date();
    const diffMs = now.getTime() - created.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  } catch (error) {
    console.error('Error calculating account age:', error);
    return 0;
  }
}

/**
 * Calculate user weight: W_i = log(1 + Activity_i) * log(1 + AccountAge_i)
 * Minimum weight for new users to ensure their pushes are counted
 */
export const MIN_USER_WEIGHT = 0.1; // Minimum weight for new users

export async function calculateUserWeight(userId: string): Promise<UserActivityData> {
  const [activityScore, accountAgeDays] = await Promise.all([
    calculateUserActivityScore(userId),
    calculateAccountAgeDays(userId),
  ]);
  
  // Ensure minimum values to avoid zero weight for new users
  // Add 1 to activityScore and accountAgeDays to ensure log(1 + value) >= log(2) > 0
  const adjustedActivityScore = Math.max(activityScore, 0);
  const adjustedAccountAgeDays = Math.max(accountAgeDays, 0);
  
  // W_i = log(1 + Activity_i) * log(1 + AccountAge_i)
  // For new users: log(1 + 0) * log(1 + 0) = 0, so we use minimum weight
  const calculatedWeight = Math.log(1 + adjustedActivityScore) * Math.log(1 + adjustedAccountAgeDays);
  
  // Apply minimum weight to ensure new users' pushes are counted
  const weight = Math.max(calculatedWeight, MIN_USER_WEIGHT);
  
  return {
    activityScore,
    accountAgeDays,
    weight: Math.max(0, weight), // Ensure non-negative
  };
}

/**
 * Get repeat count for a push (how many times from_user has pushed to_user)
 */
export async function getRepeatCount(
  fromUserId: string,
  toUserId: string
): Promise<number> {
  const supabase = supabaseAdmin();
  
  try {
    const { data, error } = await supabase
      .rpc('get_trust_push_repeat_count', {
        p_from_user_id: fromUserId,
        p_to_user_id: toUserId,
      });
    
    if (error) {
      console.error('Error getting repeat count:', error);
      // Fallback: count manually
      const { count } = await supabase
        .from('trust_pushes')
        .select('id', { count: 'exact', head: true })
        .eq('from_user_id', fromUserId)
        .eq('to_user_id', toUserId);
      return count || 0;
    }
    
    return Number(data) || 0;
  } catch (error) {
    console.error('Error getting repeat count:', error);
    return 0;
  }
}

/**
 * Check if user can push (anti-gaming: limit N pushes per month)
 */
export async function canUserPush(
  fromUserId: string,
  toUserId: string,
  maxPushesPerMonth: number = 5
): Promise<{ canPush: boolean; reason?: string }> {
  const supabase = supabaseAdmin();
  
  try {
    const { data, error } = await supabase
      .rpc('get_trust_pushes_count_last_month', {
        p_from_user_id: fromUserId,
        p_to_user_id: toUserId,
      });
    
    if (error) {
      console.error('Error checking push limit:', error);
      // Fallback: count manually
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      
      const { count } = await supabase
        .from('trust_pushes')
        .select('id', { count: 'exact', head: true })
        .eq('from_user_id', fromUserId)
        .eq('to_user_id', toUserId)
        .gte('created_at', oneMonthAgo.toISOString());
      
      const countLastMonth = count || 0;
      if (countLastMonth >= maxPushesPerMonth) {
        return {
          canPush: false,
          reason: `Maximum ${maxPushesPerMonth} pushes per month reached`,
        };
      }
      return { canPush: true };
    }
    
    const countLastMonth = Number(data) || 0;
    if (countLastMonth >= maxPushesPerMonth) {
      return {
        canPush: false,
        reason: `Maximum ${maxPushesPerMonth} pushes per month reached`,
      };
    }
    
    return { canPush: true };
  } catch (error) {
    console.error('Error checking push limit:', error);
    return { canPush: true }; // Allow on error to not block legitimate pushes
  }
}

/**
 * Calculate Trust Flow for a user
 * TF = Σ(PositivePush_i * W_i / (1 + RepeatCount_i)) - Σ(NegativePush_j * W_j / (1 + RepeatCount_j))
 */
export async function calculateTrustFlowForUser(userId: string): Promise<number> {
  const supabase = supabaseAdmin();
  
  try {
    // Get all pushes to this user
    // Use a fresh query without cache to ensure we see the latest data
    // Query with explicit timestamp to force fresh data fetch
    const queryStartTime = Date.now();
    const { data: pushes, error } = await supabase
      .from('trust_pushes')
      .select('from_user_id, type, created_at')
      .eq('to_user_id', userId)
      .order('created_at', { ascending: true });
    
    const queryEndTime = Date.now();
    console.log(`[Trust Flow] Query executed in ${queryEndTime - queryStartTime}ms for user ${userId}`);
    
    // Double-check: verify the query actually executed and returned data
    if (error) {
      console.error('[Trust Flow] Query error details:', JSON.stringify(error, null, 2));
    }
    
    if (error) {
      console.error('[Trust Flow] Error fetching trust pushes:', error);
      // Return base value on error to ensure users always have a minimum TF
      return BASE_TRUST_FLOW;
    }
    
    console.log(`[Trust Flow] Found ${pushes?.length || 0} pushes for user ${userId}`);
    if (pushes && pushes.length > 0) {
      const latestPush = pushes[pushes.length - 1];
      const latestPushTime = new Date(latestPush.created_at).getTime();
      const now = Date.now();
      const timeSinceLatestPush = now - latestPushTime;
      console.log(`[Trust Flow] Latest push: from=${latestPush.from_user_id}, type=${latestPush.type}, created_at=${latestPush.created_at}, time_since=${timeSinceLatestPush}ms`);
      // Log all pushes for debugging
      console.log(`[Trust Flow] All pushes:`, pushes.map(p => ({ from: p.from_user_id, type: p.type, created: p.created_at })));
    }
    
    if (!pushes || pushes.length === 0) {
      // Return base Trust Flow value for new users
      console.log(`[Trust Flow] No pushes found, returning base value: ${BASE_TRUST_FLOW}`);
      return BASE_TRUST_FLOW;
    }
    
    // Group pushes by from_user_id to calculate repeat counts efficiently
    const pushesByUser = new Map<string, TrustPush[]>();
    for (const push of pushes) {
      const fromUserId = push.from_user_id;
      if (!pushesByUser.has(fromUserId)) {
        pushesByUser.set(fromUserId, []);
      }
      pushesByUser.get(fromUserId)!.push(push as TrustPush);
    }
    
    // Calculate weights for all unique pushers (cache them)
    const weightCache = new Map<string, number>();
    const weightPromises: Promise<void>[] = [];
    
    for (const fromUserId of pushesByUser.keys()) {
      weightPromises.push(
        calculateUserWeight(fromUserId).then((data) => {
          weightCache.set(fromUserId, data.weight);
        })
      );
    }
    
    await Promise.all(weightPromises);
    
    // Calculate TF
    // For each push, the repeat count is how many pushes from the same user came BEFORE it
    let positiveSum = 0;
    let negativeSum = 0;
    
    // Check if this is the first push ever from each user (to determine if they're "new")
    const firstPushCheckPromises: Promise<{ fromUserId: string; isFirstPush: boolean }>[] = [];
    for (const [fromUserId, userPushes] of pushesByUser.entries()) {
      // Get the earliest push timestamp from this user to this target user
      const sortedPushes = [...userPushes].sort((a, b) => 
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      const firstPushTimestamp = sortedPushes[0]?.created_at;
      
      firstPushCheckPromises.push(
        (async () => {
          // Check if this user has given any pushes before this one (to any user)
          const { count } = await supabase
            .from('trust_pushes')
            .select('id', { count: 'exact', head: true })
            .eq('from_user_id', fromUserId)
            .lt('created_at', firstPushTimestamp || new Date().toISOString());
          
          return {
            fromUserId,
            isFirstPush: (count || 0) === 0,
          };
        })()
      );
    }
    const firstPushChecks = await Promise.all(firstPushCheckPromises);
    const firstPushMap = new Map<string, boolean>();
    for (const check of firstPushChecks) {
      firstPushMap.set(check.fromUserId, check.isFirstPush);
    }
    
    for (const [fromUserId, userPushes] of pushesByUser.entries()) {
      // Get weight from cache, fallback to minimum weight if not found
      const weight = weightCache.get(fromUserId) ?? MIN_USER_WEIGHT;
      
      // Sort pushes by created_at to process in chronological order
      const sortedPushes = [...userPushes].sort((a, b) => 
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      
      for (let i = 0; i < sortedPushes.length; i++) {
        const push = sortedPushes[i];
        // Repeat count is how many pushes came before this one (i is the count)
        const repeatCount = i;
        
        // For new users' first push ever, use 1.5 instead of calculated weight
        const isFirstPushEver = firstPushMap.get(fromUserId) === true && repeatCount === 0;
        const effectiveWeight = isFirstPushEver ? 1.5 : weight / (1 + repeatCount);
        
        if (push.type === 'positive') {
          positiveSum += effectiveWeight;
        } else if (push.type === 'negative') {
          negativeSum += effectiveWeight;
        }
      }
    }
    
    const trustFlow = positiveSum - negativeSum;
    const roundedTF = Math.round(trustFlow * 100) / 100; // Round to 2 decimal places
    
    console.log(`[Trust Flow] Calculation for user ${userId}: positiveSum=${positiveSum.toFixed(2)}, negativeSum=${negativeSum.toFixed(2)}, rawTF=${trustFlow.toFixed(2)}, roundedTF=${roundedTF.toFixed(2)}`);
    console.log(`[Trust Flow] Weight cache:`, Array.from(weightCache.entries()).map(([uid, w]) => ({ userId: uid, weight: w.toFixed(4) })));
    console.log(`[Trust Flow] Pushes by user:`, Array.from(pushesByUser.entries()).map(([uid, ps]) => ({ userId: uid, count: ps.length, types: ps.map(p => p.type) })));
    
    // Ensure minimum base Trust Flow value for all users
    // BUT: if the calculated value is exactly BASE_TRUST_FLOW and we have pushes, 
    // it means the calculation might be wrong or the pushes aren't being counted
    const finalTF = Math.max(roundedTF, BASE_TRUST_FLOW);
    
    // Log warning if we have pushes but TF is still at base value
    if (pushes && pushes.length > 0 && finalTF === BASE_TRUST_FLOW && roundedTF < BASE_TRUST_FLOW) {
      console.warn(`[Trust Flow] WARNING: User ${userId} has ${pushes.length} pushes but TF is clamped to base value ${BASE_TRUST_FLOW}. Calculated value was ${roundedTF.toFixed(2)}`);
    }
    
    console.log(`[Trust Flow] Final TF for user ${userId}: ${finalTF.toFixed(2)} (calculated: ${roundedTF.toFixed(2)}, base: ${BASE_TRUST_FLOW})`);
    
    return finalTF;
  } catch (error) {
    console.error('Error calculating Trust Flow:', error);
    // Return base value on error to ensure users always have a minimum TF
    return BASE_TRUST_FLOW;
  }
}

/**
 * Save calculated Trust Flow to cache and log history
 * This function updates the profiles.trust_flow column and logs to trust_flow_history
 */
export async function saveTrustFlowToCache(
  userId: string,
  trustFlow: number,
  options: {
    changeReason?: string;
    pushId?: number;
    calculatedBy?: string;
    metadata?: Record<string, any>;
  } = {}
): Promise<void> {
  const supabase = supabaseAdmin();
  
  try {
    const { error } = await supabase.rpc('update_user_trust_flow', {
      p_user_id: userId,
      p_new_value: trustFlow,
      p_change_reason: options.changeReason || 'manual_recalc',
      p_push_id: options.pushId || null,
      p_calculated_by: options.calculatedBy || 'api',
      p_metadata: options.metadata || null,
    });
    
    if (error) {
      console.error('[Trust Flow] Error saving to cache:', error);
      // Don't throw - caching failure shouldn't break the flow
    } else {
      console.log(`[Trust Flow] Saved TF ${trustFlow.toFixed(2)} to cache for user ${userId}`);
    }
  } catch (error) {
    console.error('[Trust Flow] Exception saving to cache:', error);
    // Don't throw - caching failure shouldn't break the flow
  }
}

/**
 * Get cached Trust Flow value from profiles table
 * Returns null if not cached, falls back to BASE_TRUST_FLOW
 */
export async function getCachedTrustFlow(userId: string): Promise<number | null> {
  const supabase = supabaseAdmin();
  
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('trust_flow')
      .eq('user_id', userId)
      .maybeSingle();
    
    if (error) {
      console.error('[Trust Flow] Error reading cache:', error);
      return null;
    }
    
    if (data?.trust_flow !== null && data?.trust_flow !== undefined) {
      return Number(data.trust_flow);
    }
    
    return null;
  } catch (error) {
    console.error('[Trust Flow] Exception reading cache:', error);
    return null;
  }
}

/**
 * Calculate and save Trust Flow for a user
 * This is the main function that should be used when TF needs to be recalculated
 */
export async function calculateAndSaveTrustFlow(
  userId: string,
  options: {
    changeReason?: string;
    pushId?: number;
    calculatedBy?: string;
    metadata?: Record<string, any>;
    useCache?: boolean; // If true, return cached value if available
  } = {}
): Promise<number> {
  // If useCache is true, try to get cached value first
  if (options.useCache) {
    const cached = await getCachedTrustFlow(userId);
    if (cached !== null) {
      console.log(`[Trust Flow] Using cached value ${cached.toFixed(2)} for user ${userId}`);
      return cached;
    }
  }
  
  // Calculate new value
  const trustFlow = await calculateTrustFlowForUser(userId);
  
  // Save to cache and log history
  await saveTrustFlowToCache(userId, trustFlow, {
    changeReason: options.changeReason || 'manual_recalc',
    pushId: options.pushId,
    calculatedBy: options.calculatedBy || 'api',
    metadata: options.metadata,
  });
  
  return trustFlow;
}

/**
 * Get Trust Flow color based on value
 */
export function getTrustFlowColor(tf: number): {
  color: string;
  label: string;
  gradient: string;
} {
  if (tf < 0) {
    return {
      color: 'red',
      label: 'Low Trust',
      gradient: 'linear-gradient(90deg, #ef4444, #dc2626)',
    };
  } else if (tf >= 0 && tf < 10) {
    return {
      color: 'gray',
      label: 'Newcomer',
      gradient: 'linear-gradient(90deg, #9ca3af, #6b7280)',
    };
  } else if (tf >= 10 && tf < 40) {
    return {
      color: 'yellow',
      label: 'Moderate Trust',
      gradient: 'linear-gradient(90deg, #fbbf24, #f59e0b)',
    };
  } else if (tf >= 40 && tf < 100) {
    return {
      color: 'green',
      label: 'High Trust',
      gradient: 'linear-gradient(90deg, #10b981, #059669)',
    };
  } else {
    // tf >= 100
    return {
      color: 'blue',
      label: 'Elite',
      gradient: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
    };
  }
}

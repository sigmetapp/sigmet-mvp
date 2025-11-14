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
  let supabase;
  try {
    supabase = supabaseAdmin();
  } catch (error: any) {
    console.error('[Trust Flow] Error creating supabaseAdmin in calculateUserActivityScore:', error);
    return 0;
  }
  
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
  let supabase;
  try {
    supabase = supabaseAdmin();
  } catch (error: any) {
    console.error('[Trust Flow] Error creating supabaseAdmin in calculateAccountAgeDays:', error);
    return 0;
  }
  
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
  console.log(`[Trust Flow] calculateTrustFlowForUser called for user ${userId}`);
  
  let supabase;
  try {
    supabase = supabaseAdmin();
  } catch (adminError: any) {
    console.error('[Trust Flow] Error creating supabaseAdmin client:', adminError);
    console.error('[Trust Flow] Error message:', adminError?.message);
    // Return base value if we can't create admin client
    return BASE_TRUST_FLOW;
  }
  
  try {
    // Get all pushes to this user
    // Use a fresh query without cache to ensure we see the latest data
    // Query with explicit timestamp to force fresh data fetch
    const queryStartTime = Date.now();
    console.log(`[Trust Flow] Querying trust_pushes for user ${userId}...`);
    const { data: pushes, error } = await supabase
      .from('trust_pushes')
      .select('id, from_user_id, type, created_at')
      .eq('to_user_id', userId)
      .order('created_at', { ascending: true });
    
    // Debug: log the actual query result
    if (pushes) {
      console.log(`[Trust Flow] Query returned ${pushes.length} pushes:`, JSON.stringify(pushes.slice(0, 5), null, 2));
    }
    
    const queryEndTime = Date.now();
    console.log(`[Trust Flow] Query executed in ${queryEndTime - queryStartTime}ms for user ${userId}`);
    
    // Double-check: verify the query actually executed and returned data
    if (error) {
      console.error('[Trust Flow] Query error details:', JSON.stringify(error, null, 2));
    }
    
    if (error) {
      console.error('[Trust Flow] Error fetching trust pushes:', error);
      // Return base value on error to ensure users always have a minimum TF
      console.log(`[Trust Flow] Returning BASE_TRUST_FLOW (${BASE_TRUST_FLOW}) due to error`);
      return BASE_TRUST_FLOW;
    }
    
    console.log(`[Trust Flow] Found ${pushes?.length || 0} pushes for user ${userId}`);
    
    if (!pushes || pushes.length === 0) {
      // Return base Trust Flow value for new users
      console.log(`[Trust Flow] No pushes found for user ${userId}, returning base value: ${BASE_TRUST_FLOW}`);
      return BASE_TRUST_FLOW;
    }
    
    // Log pushes for debugging
    const latestPush = pushes[pushes.length - 1];
    const latestPushTime = new Date(latestPush.created_at).getTime();
    const now = Date.now();
    const timeSinceLatestPush = now - latestPushTime;
    console.log(`[Trust Flow] Latest push: from=${latestPush.from_user_id}, type=${latestPush.type}, created_at=${latestPush.created_at}, time_since=${timeSinceLatestPush}ms`);
    // Log all pushes for debugging
    console.log(`[Trust Flow] All pushes (${pushes.length} total):`, pushes.map(p => ({ id: p.id, from: p.from_user_id, type: p.type, created: p.created_at })));
    
    console.log(`[Trust Flow] Processing ${pushes.length} pushes for user ${userId}`);
    
    // Group pushes by from_user_id to calculate repeat counts efficiently
    const pushesByUser = new Map<string, TrustPush[]>();
    for (const push of pushes) {
      const fromUserId = push.from_user_id;
      if (!pushesByUser.has(fromUserId)) {
        pushesByUser.set(fromUserId, []);
      }
      pushesByUser.get(fromUserId)!.push(push as TrustPush);
    }
    
    // Get target user's Trust Flow (cached value, or use BASE_TRUST_FLOW for initial calculation)
    // Note: We can't recursively calculate target user's TF here, so we use BASE_TRUST_FLOW
    // if not cached. This is fine for the first calculation.
    let targetUserTF = await getCachedTrustFlow(userId);
    if (targetUserTF === null) {
      // If target user's TF is not cached, use BASE_TRUST_FLOW for weight calculation
      // This ensures we can calculate weights even for new users
      targetUserTF = BASE_TRUST_FLOW;
      console.log(`[Trust Flow] Target user ${userId} TF not cached, using BASE_TRUST_FLOW: ${targetUserTF.toFixed(2)}`);
    } else {
      console.log(`[Trust Flow] Target user ${userId} TF (cached): ${targetUserTF.toFixed(2)}`);
    }
    
    // Calculate base push weights for all unique pushers based on their TF relative to target user
    // New formula:
    // - If pusher's TF is 20% lower than target → weight = 1.5
    // - If pusher's TF is within ±20% of target → weight = 2.0
    // - If pusher's TF is 20% higher than target → weight = 2.5
    const weightCache = new Map<string, number>();
    const weightPromises: Promise<void>[] = [];
    
    for (const fromUserId of pushesByUser.keys()) {
      weightPromises.push(
        (async () => {
          try {
            // Get pusher's Trust Flow (cached value only, to avoid recursion)
            // If not cached, use BASE_TRUST_FLOW - this is fine for initial calculations
            let pusherTF = await getCachedTrustFlow(fromUserId);
            if (pusherTF === null) {
              // If pusher's TF is not cached, use BASE_TRUST_FLOW
              // This ensures we can calculate weights even if pusher's TF hasn't been calculated yet
              pusherTF = BASE_TRUST_FLOW;
              console.log(`[Trust Flow] Pusher ${fromUserId} TF not cached, using BASE_TRUST_FLOW: ${pusherTF.toFixed(2)}`);
            } else {
              console.log(`[Trust Flow] Pusher ${fromUserId} TF (cached): ${pusherTF.toFixed(2)}`);
            }
            
            // Calculate relative difference
            const tfDifference = (pusherTF - targetUserTF) / targetUserTF;
            const tfDifferencePercent = tfDifference * 100;
            
            // Determine base weight based on TF difference
            let baseWeight: number;
            if (tfDifferencePercent < -20) {
              // Pusher's TF is more than 20% lower
              baseWeight = 1.5;
            } else if (tfDifferencePercent > 20) {
              // Pusher's TF is more than 20% higher
              baseWeight = 2.5;
            } else {
              // Pusher's TF is within ±20%
              baseWeight = 2.0;
            }
            
            weightCache.set(fromUserId, baseWeight);
            console.log(`[Trust Flow] User ${fromUserId} TF: ${pusherTF.toFixed(2)}, target TF: ${targetUserTF.toFixed(2)}, diff: ${tfDifferencePercent.toFixed(2)}%, base weight: ${baseWeight}`);
          } catch (error) {
            console.error(`[Trust Flow] Error getting TF for user ${fromUserId}:`, error);
            // Fallback to default weight if error
            weightCache.set(fromUserId, 2.0);
          }
        })()
      );
    }
    
    await Promise.all(weightPromises);
    
    console.log(`[Trust Flow] Weight cache after calculation:`, Array.from(weightCache.entries()).map(([uid, w]) => ({ userId: uid, weight: w.toFixed(4) })));
    
    // Calculate TF
    // For each push, the repeat count is how many pushes from the same user came BEFORE it
    let positiveSum = 0;
    let negativeSum = 0;
    
    console.log(`[Trust Flow] Starting TF calculation with positiveSum=${positiveSum}, negativeSum=${negativeSum}`);
    console.log(`[Trust Flow] Processing ${pushesByUser.size} unique pushers for user ${userId}`);
    
    for (const [fromUserId, userPushes] of pushesByUser.entries()) {
      // Get base weight from cache (based on TF difference)
      const baseWeight = weightCache.get(fromUserId) ?? 2.0;
      console.log(`[Trust Flow] Processing pushes from user ${fromUserId}, base weight: ${baseWeight.toFixed(4)}, push count: ${userPushes.length}`);
      
      // Sort pushes by created_at to process in chronological order
      const sortedPushes = [...userPushes].sort((a, b) => 
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      
      for (let i = 0; i < sortedPushes.length; i++) {
        const push = sortedPushes[i];
        const pushDate = new Date(push.created_at);
        
        // Count how many pushes from this user to this target occurred within 30 days before this push
        // This is the repeat count for the 30-day window protection
        let repeatCountIn30Days = 0;
        for (let j = 0; j < i; j++) {
          const prevPush = sortedPushes[j];
          const prevPushDate = new Date(prevPush.created_at);
          const daysDiff = (pushDate.getTime() - prevPushDate.getTime()) / (1000 * 60 * 60 * 24);
          
          // If previous push was within 30 days before this push, count it
          if (daysDiff <= 30 && daysDiff >= 0) {
            repeatCountIn30Days++;
          }
        }
        
        // Calculate effective weight with 33% reduction for each repeat within 30 days
        // First push: full weight, second push: 67% of weight, third push: 44.89% of weight, etc.
        let effectiveWeight = baseWeight;
        for (let r = 0; r < repeatCountIn30Days; r++) {
          effectiveWeight = effectiveWeight * 0.67; // 33% reduction = multiply by 0.67
        }
        
        console.log(`[Trust Flow] Push ${i + 1}/${sortedPushes.length} from ${fromUserId}: type=${push.type}, repeatCountIn30Days=${repeatCountIn30Days}, baseWeight=${baseWeight.toFixed(4)}, effectiveWeight=${effectiveWeight.toFixed(4)}`);
        
        if (push.type === 'positive') {
          positiveSum += effectiveWeight;
        } else if (push.type === 'negative') {
          negativeSum += effectiveWeight;
        }
      }
    }
    
    console.log(`[Trust Flow] After processing all pushes: positiveSum=${positiveSum.toFixed(4)}, negativeSum=${negativeSum.toFixed(4)}`);
    
    // Calculate contributions: positiveSum - negativeSum
    const contributions = positiveSum - negativeSum;
    
    // Trust Flow = Base value + contributions from pushes
    // This ensures users start at BASE_TRUST_FLOW and accumulate from there
    const trustFlow = BASE_TRUST_FLOW + contributions;
    const roundedTF = Math.round(trustFlow * 100) / 100; // Round to 2 decimal places
    
    console.log(`[Trust Flow] Calculation for user ${userId}: positiveSum=${positiveSum.toFixed(2)}, negativeSum=${negativeSum.toFixed(2)}, contributions=${contributions.toFixed(2)}, base=${BASE_TRUST_FLOW}, finalTF=${roundedTF.toFixed(2)}`);
    console.log(`[Trust Flow] Weight cache:`, Array.from(weightCache.entries()).map(([uid, w]) => ({ userId: uid, weight: w.toFixed(4) })));
    console.log(`[Trust Flow] Pushes by user:`, Array.from(pushesByUser.entries()).map(([uid, ps]) => ({ userId: uid, count: ps.length, types: ps.map(p => p.type) })));
    
    // Ensure minimum base Trust Flow value (should always be >= BASE_TRUST_FLOW since we add to it)
    const finalTF = Math.max(roundedTF, BASE_TRUST_FLOW);
    
    console.log(`[Trust Flow] Final TF for user ${userId}: ${finalTF.toFixed(2)} (base: ${BASE_TRUST_FLOW}, contributions: ${contributions.toFixed(2)})`);
    
    return finalTF;
  } catch (error: any) {
    console.error('[Trust Flow] Error calculating Trust Flow:', error);
    console.error('[Trust Flow] Error message:', error?.message);
    console.error('[Trust Flow] Error stack:', error?.stack);
    // Return base value on error to ensure users always have a minimum TF
    console.log(`[Trust Flow] Returning BASE_TRUST_FLOW (${BASE_TRUST_FLOW}) due to exception`);
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
    // Try to use RPC function first (if migration is applied)
    const { error: rpcError } = await supabase.rpc('update_user_trust_flow', {
      p_user_id: userId,
      p_new_value: trustFlow,
      p_change_reason: options.changeReason || 'manual_recalc',
      p_push_id: options.pushId || null,
      p_calculated_by: options.calculatedBy || 'api',
      p_metadata: options.metadata || null,
    });
    
    if (rpcError) {
      // If RPC function doesn't exist, try direct update (fallback for when migration not applied)
      if (rpcError.message?.includes('function') || rpcError.message?.includes('does not exist')) {
        console.warn('[Trust Flow] RPC function not found, trying direct update (migration may not be applied)');
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ trust_flow: trustFlow })
          .eq('user_id', userId);
        
        if (updateError) {
          // If column doesn't exist either, just log and continue
          if (updateError.message?.includes('column') && updateError.message?.includes('trust_flow')) {
            console.warn('[Trust Flow] trust_flow column not found - migration needs to be applied');
          } else {
            console.error('[Trust Flow] Error updating cache directly:', updateError);
          }
        } else {
          console.log(`[Trust Flow] Saved TF ${trustFlow.toFixed(2)} to cache for user ${userId} (direct update)`);
        }
      } else {
        console.error('[Trust Flow] Error saving to cache via RPC:', rpcError);
      }
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
      // If column doesn't exist, return null (migration not applied yet)
      if (error.message?.includes('column') && error.message?.includes('trust_flow')) {
        console.warn('[Trust Flow] trust_flow column not found - migration may not be applied');
        return null;
      }
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
  console.log(`[Trust Flow] calculateAndSaveTrustFlow called for user ${userId}, useCache=${options.useCache}, reason=${options.changeReason}`);
  
  // If useCache is true, try to get cached value first
  if (options.useCache) {
    const cached = await getCachedTrustFlow(userId);
    if (cached !== null) {
      console.log(`[Trust Flow] Using cached value ${cached.toFixed(2)} for user ${userId}`);
      return cached;
    }
  }
  
  // Calculate new value
  console.log(`[Trust Flow] Calculating TF for user ${userId}...`);
  const trustFlow = await calculateTrustFlowForUser(userId);
  console.log(`[Trust Flow] Calculated TF: ${trustFlow.toFixed(2)} for user ${userId}`);
  
  // Save to cache and log history
  console.log(`[Trust Flow] Saving TF ${trustFlow.toFixed(2)} to cache for user ${userId}...`);
  await saveTrustFlowToCache(userId, trustFlow, {
    changeReason: options.changeReason || 'manual_recalc',
    pushId: options.pushId,
    calculatedBy: options.calculatedBy || 'api',
    metadata: options.metadata,
  });
  console.log(`[Trust Flow] Saved TF ${trustFlow.toFixed(2)} to cache for user ${userId}`);
  
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

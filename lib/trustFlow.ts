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
 * Get base effective weight based on user's Trust Flow
 * Returns 1.5, 2.0, or 2.5 depending on TF value
 */
async function getBaseEffectiveWeight(userId: string): Promise<number> {
  try {
    const cachedTF = await getCachedTrustFlow(userId);
    const tf = cachedTF !== null ? cachedTF : BASE_TRUST_FLOW;
    
    // Determine base weight based on Trust Flow
    if (tf < 10) {
      return 1.5; // Low TF
    } else if (tf < 40) {
      return 2.0; // Moderate TF
    } else {
      return 2.5; // High TF
    }
  } catch (error) {
    console.error('[Trust Flow] Error getting base effective weight:', error);
    return 1.5; // Default fallback
  }
}

/**
 * Calculate push details (weight, repeatCount, effectiveWeight, contribution) for a specific push
 * This is used to save metadata in trust_flow_history
 * 
 * New logic:
 * - Base weight depends on pusher's Trust Flow (1.5, 2.0, or 2.5)
 * - Each repeat push within 30 days is 33% less than previous (multiply by 0.67)
 * - After 30 days, next push is considered first again
 */
export async function calculatePushDetails(
  pushId: number,
  fromUserId: string,
  toUserId: string
): Promise<{
  weight: number;
  repeatCount: number;
  effectiveWeight: number;
  contribution: number;
} | null> {
  const supabase = supabaseAdmin();
  
  try {
    // Get the specific push
    const { data: push, error: pushError } = await supabase
      .from('trust_pushes')
      .select('id, from_user_id, to_user_id, type, created_at')
      .eq('id', pushId)
      .single();
    
    if (pushError || !push) {
      console.error('[Trust Flow] Error fetching push for details:', pushError);
      return null;
    }
    
    const pushDate = new Date(push.created_at);
    const thirtyDaysAgo = new Date(pushDate);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    // Get all pushes from this user to this target within 30 days before this push, sorted chronologically
    const { data: recentPushes, error: recentPushesError } = await supabase
      .from('trust_pushes')
      .select('id, from_user_id, to_user_id, type, created_at')
      .eq('from_user_id', fromUserId)
      .eq('to_user_id', toUserId)
      .gte('created_at', thirtyDaysAgo.toISOString())
      .lte('created_at', pushDate.toISOString())
      .order('created_at', { ascending: true });
    
    if (recentPushesError) {
      console.error('[Trust Flow] Error fetching recent pushes for details:', recentPushesError);
      return null;
    }
    
    // Find the index of this push in the recent pushes (repeat count within 30 days)
    const pushIndex = recentPushes?.findIndex(p => p.id === pushId) ?? -1;
    if (pushIndex === -1) {
      console.error('[Trust Flow] Push not found in recent pushes list');
      return null;
    }
    
    const repeatCount = pushIndex;
    
    // Get base effective weight based on pusher's Trust Flow
    const baseWeight = await getBaseEffectiveWeight(fromUserId);
    
    // Calculate effective weight: each repeat is 33% less (multiply by 0.67^repeatCount)
    // First push (repeatCount = 0): baseWeight * 0.67^0 = baseWeight
    // Second push (repeatCount = 1): baseWeight * 0.67^1 = baseWeight * 0.67
    // Third push (repeatCount = 2): baseWeight * 0.67^2 = baseWeight * 0.4489
    const effectiveWeight = baseWeight * Math.pow(0.67, repeatCount);
    
    // Calculate contribution
    const contribution = push.type === 'positive' ? effectiveWeight : -effectiveWeight;
    
    return {
      weight: baseWeight, // Show base weight (not used in calculation, just for display)
      repeatCount,
      effectiveWeight,
      contribution,
    };
  } catch (error) {
    console.error('[Trust Flow] Error calculating push details:', error);
    return null;
  }
}

/**
 * Calculate Trust Flow for a user
 * New formula:
 * - Base weight depends on pusher's Trust Flow (1.5, 2.0, or 2.5)
 * - Each repeat push within 30 days is 33% less than previous (multiply by 0.67)
 * - After 30 days, next push is considered first again
 * TF = BASE_TRUST_FLOW + Σ(contributions)
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
      .select('from_user_id, type, created_at')
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
      console.log(`[Trust Flow] No pushes found for user ${userId}, returning base value: ${BASE_TRUST_FLOW}`);
      return BASE_TRUST_FLOW;
    }
    
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
    
    // Calculate base effective weights for all unique pushers (cache them)
    // Base weight depends on pusher's Trust Flow (1.5, 2.0, or 2.5)
    const baseWeightCache = new Map<string, number>();
    const baseWeightPromises: Promise<void>[] = [];
    
    for (const fromUserId of pushesByUser.keys()) {
      baseWeightPromises.push(
        getBaseEffectiveWeight(fromUserId).then((baseWeight) => {
          baseWeightCache.set(fromUserId, baseWeight);
          console.log(`[Trust Flow] User ${fromUserId} base weight: ${baseWeight.toFixed(1)} (based on their TF)`);
        }).catch((error) => {
          console.error(`[Trust Flow] Error calculating base weight for user ${fromUserId}:`, error);
          baseWeightCache.set(fromUserId, 1.5); // Default fallback
        })
      );
    }
    
    await Promise.all(baseWeightPromises);
    
    console.log(`[Trust Flow] Base weight cache after calculation:`, Array.from(baseWeightCache.entries()).map(([uid, w]) => ({ userId: uid, baseWeight: w.toFixed(1) })));
    
    // Calculate TF
    // New logic: each repeat push within 30 days is 33% less than previous
    let positiveSum = 0;
    let negativeSum = 0;
    
    console.log(`[Trust Flow] Starting TF calculation with positiveSum=${positiveSum}, negativeSum=${negativeSum}`);
    
    console.log(`[Trust Flow] Processing ${pushesByUser.size} unique pushers for user ${userId}`);
    
    for (const [fromUserId, userPushes] of pushesByUser.entries()) {
      // Get base weight from cache, fallback to 1.5 if not found
      const baseWeight = baseWeightCache.get(fromUserId) ?? 1.5;
      console.log(`[Trust Flow] Processing pushes from user ${fromUserId}, base weight: ${baseWeight.toFixed(1)}, push count: ${userPushes.length}`);
      
      // Sort pushes by created_at to process in chronological order
      const sortedPushes = [...userPushes].sort((a, b) => 
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      
      for (let i = 0; i < sortedPushes.length; i++) {
        const push = sortedPushes[i];
        const pushDate = new Date(push.created_at);
        const thirtyDaysAgo = new Date(pushDate);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        // Count how many pushes from this user to this target within 30 days before this push
        // Only count pushes that came BEFORE or AT the same time as this push
        const recentPushesBeforeThis = sortedPushes.filter(p => {
          const pDate = new Date(p.created_at);
          return pDate >= thirtyDaysAgo && pDate <= pushDate;
        });
        
        // Repeat count is the index of this push in the recent pushes (0-based)
        // This represents how many pushes came before this one in the 30-day window
        const repeatCount = recentPushesBeforeThis.findIndex(p => {
          // Match by created_at timestamp (with small tolerance for same-moment pushes)
          return Math.abs(new Date(p.created_at).getTime() - pushDate.getTime()) < 1000;
        });
        
        // If push not found in recent pushes (shouldn't happen), default to 0
        const finalRepeatCount = repeatCount >= 0 ? repeatCount : 0;
        
        // Calculate effective weight: each repeat is 33% less (multiply by 0.67^repeatCount)
        // First push (repeatCount = 0): baseWeight * 0.67^0 = baseWeight
        // Second push (repeatCount = 1): baseWeight * 0.67^1 = baseWeight * 0.67
        // Third push (repeatCount = 2): baseWeight * 0.67^2 = baseWeight * 0.4489
        const effectiveWeight = baseWeight * Math.pow(0.67, finalRepeatCount);
        
        console.log(`[Trust Flow] Push ${i + 1}/${sortedPushes.length} from ${fromUserId}: type=${push.type}, repeatCount=${finalRepeatCount} (within 30 days, found ${recentPushesBeforeThis.length} total), baseWeight=${baseWeight.toFixed(1)}, effectiveWeight=${effectiveWeight.toFixed(4)}`);
        
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
    
    // Get admin adjustments and add them to the calculated TF
    let adminAdjustments = 0;
    try {
      const { data: adjustmentsData, error: adjustmentsError } = await supabase
        .rpc('get_admin_tf_adjustments_total', { target_user_id: userId });
      
      if (adjustmentsError) {
        console.warn('[Trust Flow] Error getting admin TF adjustments:', adjustmentsError);
      } else {
        adminAdjustments = adjustmentsData || 0;
      }
    } catch (adjustmentError: any) {
      console.warn('[Trust Flow] Exception getting admin TF adjustments:', adjustmentError);
    }
    
    // Add admin adjustments to the calculated TF
    const tfWithAdjustments = roundedTF + adminAdjustments;
    const finalRoundedTF = Math.round(tfWithAdjustments * 100) / 100;
    
    console.log(`[Trust Flow] Calculation for user ${userId}: positiveSum=${positiveSum.toFixed(2)}, negativeSum=${negativeSum.toFixed(2)}, contributions=${contributions.toFixed(2)}, base=${BASE_TRUST_FLOW}, calculatedTF=${roundedTF.toFixed(2)}, adminAdjustments=${adminAdjustments.toFixed(2)}, finalTF=${finalRoundedTF.toFixed(2)}`);
    console.log(`[Trust Flow] Base weight cache:`, Array.from(baseWeightCache.entries()).map(([uid, w]) => ({ userId: uid, baseWeight: w.toFixed(1) })));
    console.log(`[Trust Flow] Pushes by user:`, Array.from(pushesByUser.entries()).map(([uid, ps]) => ({ userId: uid, count: ps.length, types: ps.map(p => p.type) })));
    
    // Ensure minimum base Trust Flow value (should always be >= BASE_TRUST_FLOW since we add to it)
    // But admin adjustments can push it below BASE_TRUST_FLOW if they're negative, so we allow that
    const finalTF = Math.max(finalRoundedTF, BASE_TRUST_FLOW);
    
    console.log(`[Trust Flow] Final TF for user ${userId}: ${finalTF.toFixed(2)} (base: ${BASE_TRUST_FLOW}, contributions: ${contributions.toFixed(2)}, admin adjustments: ${adminAdjustments.toFixed(2)})`);
    
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
  
  // If pushId is provided, calculate push details and include in metadata
  let metadata = options.metadata;
  if (options.pushId && !metadata) {
    const supabase = supabaseAdmin();
    // Get push info to find from_user_id
    const { data: push } = await supabase
      .from('trust_pushes')
      .select('from_user_id, to_user_id')
      .eq('id', options.pushId)
      .single();
    
    if (push) {
      const pushDetails = await calculatePushDetails(options.pushId, push.from_user_id, push.to_user_id);
      if (pushDetails) {
        metadata = {
          weight: pushDetails.weight,
          repeatCount: pushDetails.repeatCount,
          effectiveWeight: pushDetails.effectiveWeight,
          contribution: pushDetails.contribution,
        };
        console.log(`[Trust Flow] Calculated push details for push ${options.pushId}:`, metadata);
      }
    }
  }
  
  // Save to cache and log history
  console.log(`[Trust Flow] Saving TF ${trustFlow.toFixed(2)} to cache for user ${userId}...`);
  await saveTrustFlowToCache(userId, trustFlow, {
    changeReason: options.changeReason || 'manual_recalc',
    pushId: options.pushId,
    calculatedBy: options.calculatedBy || 'api',
    metadata: metadata,
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

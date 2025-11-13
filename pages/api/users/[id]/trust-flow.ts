import type { NextApiRequest, NextApiResponse } from 'next';
import { 
  getCachedTrustFlow, 
  calculateAndSaveTrustFlow, 
  getTrustFlowColor,
  BASE_TRUST_FLOW 
} from '@/lib/trustFlow';
import { supabaseAdmin } from '@/lib/supabaseServer';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id: userId, recalculate } = req.query;

  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ error: 'User ID is required' });
  }

  try {
    // Verify user exists (optional check - if user doesn't exist, return base TF)
    const supabase = supabaseAdmin();
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();

    // If user not found (PGRST116 = not found), return base Trust Flow
    if (profileError && profileError.code === 'PGRST116') {
      console.log(`[Trust Flow API] User ${userId} not found in profiles, returning base TF`);
      const baseTF = BASE_TRUST_FLOW;
      const colorInfo = getTrustFlowColor(baseTF);
      res.setHeader('Cache-Control', 'public, max-age=60'); // Cache for 1 minute
      return res.status(200).json({
        trustFlow: baseTF,
        color: colorInfo.color,
        label: colorInfo.label,
        gradient: colorInfo.gradient,
      });
    }

    // Other database errors - log but still try to calculate
    if (profileError) {
      console.warn(`[Trust Flow API] Warning checking user ${userId}:`, profileError);
      // Continue anyway - user might exist but query failed
    }

    let trustFlow: number;

    // If recalculate=true, force recalculation
    if (recalculate === 'true') {
      console.log(`[Trust Flow API] Recalculating Trust Flow for user ${userId}`);
      trustFlow = await calculateAndSaveTrustFlow(userId, {
        changeReason: 'api_recalc',
        calculatedBy: 'api',
        useCache: false,
      });
    } else {
      // Try to get cached value first
      const cached = await getCachedTrustFlow(userId);
      
      if (cached !== null) {
        // Check if cached value is base value (5.0) - if so, verify if recalculation is needed
        if (Math.abs(cached - BASE_TRUST_FLOW) < 0.01) {
          // Check if user has any pushes - if yes, recalculate to ensure accuracy
          const { count: pushCount } = await supabase
            .from('trust_pushes')
            .select('id', { count: 'exact', head: true })
            .eq('to_user_id', userId);
          
          if (pushCount && pushCount > 0) {
            console.log(`[Trust Flow API] Cached value is base (${cached.toFixed(2)}), but user has ${pushCount} pushes. Recalculating...`);
            trustFlow = await calculateAndSaveTrustFlow(userId, {
              changeReason: 'api_auto_recalc',
              calculatedBy: 'api',
              useCache: false,
            });
          } else {
            console.log(`[Trust Flow API] Using cached TF ${cached.toFixed(2)} for user ${userId} (no pushes)`);
            trustFlow = cached;
          }
        } else {
          console.log(`[Trust Flow API] Using cached TF ${cached.toFixed(2)} for user ${userId}`);
          trustFlow = cached;
        }
      } else {
        // No cache, calculate and save
        console.log(`[Trust Flow API] No cache found, calculating Trust Flow for user ${userId}`);
        trustFlow = await calculateAndSaveTrustFlow(userId, {
          changeReason: 'api_first_load',
          calculatedBy: 'api',
          useCache: false,
        });
      }
    }

    const colorInfo = getTrustFlowColor(trustFlow);
    console.log(`[Trust Flow API] Returning TF: ${trustFlow.toFixed(2)}, color: ${colorInfo.color}`);

    // Cache for 1 minute (TF doesn't change that often)
    res.setHeader('Cache-Control', 'public, max-age=60');
    
    return res.status(200).json({
      trustFlow,
      color: colorInfo.color,
      label: colorInfo.label,
      gradient: colorInfo.gradient,
    });
  } catch (error: any) {
    console.error(`[Trust Flow API] Error getting Trust Flow for user ${userId}:`, error);
    // Return base Trust Flow instead of error
    const baseTF = BASE_TRUST_FLOW;
    const colorInfo = getTrustFlowColor(baseTF);
    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.status(200).json({
      trustFlow: baseTF,
      color: colorInfo.color,
      label: colorInfo.label,
      gradient: colorInfo.gradient,
    });
  }
}

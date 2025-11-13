import type { NextApiRequest, NextApiResponse } from 'next';
import { calculateTrustFlowForUser, getTrustFlowColor } from '@/lib/trustFlow';
import { supabaseAdmin } from '@/lib/supabaseServer';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id: userId } = req.query;

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
      const baseTF = 5.0;
      const colorInfo = getTrustFlowColor(baseTF);
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
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

    // Calculate Trust Flow
    console.log(`[Trust Flow API] Calculating Trust Flow for user ${userId}`);
    const trustFlow = await calculateTrustFlowForUser(userId);
    const colorInfo = getTrustFlowColor(trustFlow);
    console.log(`[Trust Flow API] Calculated TF: ${trustFlow}, color: ${colorInfo.color}`);

    // Set cache-control headers to prevent caching
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    return res.status(200).json({
      trustFlow,
      color: colorInfo.color,
      label: colorInfo.label,
      gradient: colorInfo.gradient,
    });
  } catch (error: any) {
    console.error(`[Trust Flow API] Error calculating Trust Flow for user ${userId}:`, error);
    // Return base Trust Flow instead of error
    const baseTF = 5.0;
    const colorInfo = getTrustFlowColor(baseTF);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return res.status(200).json({
      trustFlow: baseTF,
      color: colorInfo.color,
      label: colorInfo.label,
      gradient: colorInfo.gradient,
    });
  }
}

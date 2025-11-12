import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabaseServer';

const ADMIN_EMAILS = new Set<string>(['seosasha@gmail.com']);

function getAccessTokenFromRequest(req: NextApiRequest): string | undefined {
  const cookie = req.headers.cookie || '';
  const map = new Map<string, string>();
  cookie.split(';').forEach((p) => {
    const [k, ...rest] = p.trim().split('=');
    if (!k) return;
    map.set(k, decodeURIComponent(rest.join('=')));
  });
  const direct = map.get('sb-access-token') || map.get('access-token');
  if (direct) return direct;
  for (const [k, v] of map.entries()) {
    if (k.startsWith('sb-') && k.endsWith('-auth-token')) {
      try {
        const parsed = JSON.parse(v) as { access_token?: string };
        if (parsed?.access_token) return parsed.access_token;
      } catch {}
    }
  }
  return undefined;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
    const accessToken = getAccessTokenFromRequest(req);
    const supabase = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} },
    });

    const { data: userData } = await supabase.auth.getUser();
    const email = userData?.user?.email || '';
    if (!email || !ADMIN_EMAILS.has(email)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { user_id, points, reason } = req.body as { user_id: string; points: number; reason?: string };
    if (!user_id) return res.status(400).json({ error: 'user_id is required' });
    if (!points || points <= 0) return res.status(400).json({ error: 'points must be a positive number' });

    const admin = supabaseAdmin();
    
    // Get current admin user_id if available
    const { data: adminUser } = await admin.auth.admin.listUsers();
    const adminUserId = adminUser?.users?.find((u: any) => u.email === email)?.id || null;
    
    // Record permanent adjustment in admin_sw_adjustments table
    const { error: adjustmentError } = await admin
      .from('admin_sw_adjustments')
      .insert({
        user_id,
        points: points,
        reason: reason || 'Admin bonus',
        admin_email: email,
        adjustment_type: 'bonus',
        permanent: true,
        created_by: adminUserId,
      });

    if (adjustmentError) {
      console.error('Failed to record admin adjustment:', adjustmentError);
      throw adjustmentError;
    }

    // Get current SW score (including any existing adjustments)
    const { data: currentSW } = await admin
      .from('sw_scores')
      .select('total')
      .eq('user_id', user_id)
      .single();

    // Get total admin adjustments (including the one we just added)
    const { data: adjustmentsData, error: adjustmentsError } = await admin
      .rpc('get_admin_sw_adjustments_total', { target_user_id: user_id });

    const adminAdjustmentsTotal = adjustmentsData || 0;
    
    // Calculate new total: current SW + all admin adjustments
    // Note: We need to recalculate SW to get the base, then add adjustments
    // For now, we'll update the total directly, but the recalculate endpoint will handle it properly
    const currentTotal = currentSW?.total || 0;
    const newTotal = currentTotal + points;

    // Update SW score (temporary update, will be recalculated properly on next recalc)
    const { error: updateError } = await admin
      .from('sw_scores')
      .upsert({
        user_id,
        total: newTotal,
        last_updated: new Date().toISOString(),
      }, {
        onConflict: 'user_id',
      });

    if (updateError) {
      console.warn('Failed to update sw_scores immediately:', updateError);
      // Don't throw - the adjustment is already recorded, recalc will fix it
    }

    return res.status(200).json({ 
      ok: true, 
      previous_total: currentTotal,
      new_total: newTotal,
      points_added: points,
    });
  } catch (e: any) {
    console.error('users.sw-bonus error', e);
    return res.status(500).json({ error: e?.message || 'Internal error' });
  }
}

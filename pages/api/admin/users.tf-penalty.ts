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
    
    // Record permanent adjustment in admin_tf_adjustments table (negative points for penalty)
    const { error: adjustmentError } = await admin
      .from('admin_tf_adjustments')
      .insert({
        user_id,
        points: -points, // Negative for penalty
        reason: reason || 'Rule violation',
        admin_email: email,
        adjustment_type: 'penalty',
        permanent: true,
        created_by: adminUserId,
      });

    if (adjustmentError) {
      console.error('Failed to record admin TF adjustment:', adjustmentError);
      throw adjustmentError;
    }

    // Get current TF value from profiles
    const { data: currentProfile } = await admin
      .from('profiles')
      .select('trust_flow')
      .eq('user_id', user_id)
      .single();

    const currentTF = currentProfile?.trust_flow || 5.0;
    const newTF = Math.max(5.0, currentTF - points); // Don't go below base TF (5.0)

    // Update TF in profiles (temporary update, will be recalculated properly on next recalc)
    const { error: updateError } = await admin
      .from('profiles')
      .update({
        trust_flow: newTF,
      })
      .eq('user_id', user_id);

    if (updateError) {
      console.warn('Failed to update trust_flow immediately:', updateError);
      // Don't throw - the adjustment is already recorded, recalc will fix it
    }

    return res.status(200).json({ 
      ok: true, 
      previous_total: currentTF,
      new_total: newTF,
      points_removed: points,
    });
  } catch (e: any) {
    console.error('users.tf-penalty error', e);
    return res.status(500).json({ error: e?.message || 'Internal error' });
  }
}

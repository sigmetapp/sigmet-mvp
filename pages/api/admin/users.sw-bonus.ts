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
    
    // Get current SW score
    const { data: currentSW } = await admin
      .from('sw_scores')
      .select('total')
      .eq('user_id', user_id)
      .single();

    const currentTotal = currentSW?.total || 0;
    const newTotal = currentTotal + points;

    // Update SW score
    const { error: updateError } = await admin
      .from('sw_scores')
      .upsert({
        user_id,
        total: newTotal,
        last_updated: new Date().toISOString(),
      }, {
        onConflict: 'user_id',
      });

    if (updateError) throw updateError;

    // Add entry to sw_ledger if it exists (for tracking)
    // Note: sw_ledger might not exist in all deployments, so we'll try but not fail if it doesn't
    try {
      // Check if sw_ledger table exists by trying to insert
      // We'll use a generic direction_id if needed - but first check if table has direction_id
      const { error: ledgerError } = await admin
        .from('sw_ledger')
        .insert({
          user_id,
          direction_id: '00000000-0000-0000-0000-000000000000' as any, // Placeholder, will be ignored if not needed
          reason: 'admin_adjust' as any,
          points: points,
          meta: {
            type: 'bonus',
            permanent: true,
            reason: reason || 'Admin bonus',
            admin_email: email,
          },
        } as any);

      // Ignore errors if table doesn't exist or has different structure
      if (ledgerError && !ledgerError.message.includes('does not exist') && !ledgerError.message.includes('column')) {
        console.warn('Failed to add sw_ledger entry:', ledgerError);
      }
    } catch (ledgerErr) {
      // Ignore ledger errors - it's optional
      console.warn('sw_ledger entry skipped:', ledgerErr);
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

import type { NextApiRequest, NextApiResponse } from 'next';
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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Check admin access
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
    const accessToken = getAccessTokenFromRequest(req);
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(url, anon, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} },
    });

    const { data: userData } = await supabase.auth.getUser();
    const email = userData?.user?.email || '';
    if (!email || !ADMIN_EMAILS.has(email)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const admin = supabaseAdmin();
    const { user_id, badge_key, action } = req.body; // action: 'grant' or 'revoke'

    if (!user_id || !badge_key || !action) {
      return res.status(400).json({
        error: 'user_id, badge_key, and action (grant/revoke) are required',
      });
    }

    if (action === 'grant') {
      // Grant badge to user
      const evidence = {
        metric_snapshot: {},
        metric_value: 0,
        threshold: 0,
        operator: 'gte',
        awarded_at: new Date().toISOString(),
        manually_granted: true,
      };

      const { data, error } = await admin
        .from('user_badges')
        .upsert(
          {
            user_id,
            badge_key,
            evidence,
          },
          { onConflict: 'user_id,badge_key' }
        )
        .select()
        .single();

      if (error) {
        console.error('Error granting badge:', error);
        return res.status(500).json({ error: error.message });
      }

      // Update earned_badges_count
      await admin.rpc('initialize_user_metrics', { user_uuid: user_id });
      const { count } = await admin
        .from('user_badges')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user_id);

      await admin
        .from('user_metrics')
        .update({
          earned_badges_count: count || 0,
        })
        .eq('user_id', user_id);

      return res.status(200).json({
        message: 'Badge granted',
        badge: data,
      });
    } else if (action === 'revoke') {
      // Revoke badge from user
      const { error } = await admin
        .from('user_badges')
        .delete()
        .eq('user_id', user_id)
        .eq('badge_key', badge_key);

      if (error) {
        console.error('Error revoking badge:', error);
        return res.status(500).json({ error: error.message });
      }

      // Update earned_badges_count
      await admin.rpc('initialize_user_metrics', { user_uuid: user_id });
      const { count } = await admin
        .from('user_badges')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user_id);

      await admin
        .from('user_metrics')
        .update({
          earned_badges_count: count || 0,
        })
        .eq('user_id', user_id);

      return res.status(200).json({
        message: 'Badge revoked',
      });
    } else {
      return res.status(400).json({ error: 'Invalid action. Use "grant" or "revoke"' });
    }
  } catch (error: any) {
    console.error('badges/grant error:', error);
    return res.status(500).json({ error: error?.message || 'Internal error' });
  }
}

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
    const { user_id } = req.body;

    if (user_id) {
      // Recompute for specific user
      const { error: recalcError } = await admin.rpc('recalculate_user_metrics', {
        user_uuid: user_id,
        recalc_all: false,
      });

      if (recalcError) {
        console.error('Error recalculating metrics:', recalcError);
        return res.status(500).json({ error: recalcError.message });
      }

      // Evaluate badges
      const { error: evalError } = await admin.rpc('evaluate_user_badges', {
        user_uuid: user_id,
      });

      if (evalError) {
        console.error('Error evaluating badges:', evalError);
        return res.status(500).json({ error: evalError.message });
      }

      return res.status(200).json({
        message: 'Badges recomputed for user',
        user_id,
      });
    } else {
      // Recompute for all users that changed in last 24h
      const { data: affectedUsers, error: recalcError } = await admin.rpc(
        'recalculate_user_metrics',
        {
          user_uuid: null,
          recalc_all: true,
        }
      );

      if (recalcError) {
        console.error('Error recalculating metrics:', recalcError);
        return res.status(500).json({ error: recalcError.message });
      }

      return res.status(200).json({
        message: 'Badges recomputed for all active users',
        affected_users: affectedUsers || 0,
      });
    }
  } catch (error: any) {
    console.error('badges/recompute error:', error);
    return res.status(500).json({ error: error?.message || 'Internal error' });
  }
}

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
      } catch {
        // ignore parse errors
      }
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
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
    if (!url || !anon) {
      return res.status(500).json({ error: 'Supabase configuration missing' });
    }

    const accessToken = getAccessTokenFromRequest(req);
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(url, anon, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: accessToken
        ? { headers: { Authorization: `Bearer ${accessToken}` } }
        : {},
    });

    const { data: userData } = await supabase.auth.getUser();
    const email = userData?.user?.email || '';
    if (!email || !ADMIN_EMAILS.has(email)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { user_id: userId } = req.body as { user_id?: string };
    if (!userId) {
      return res.status(400).json({ error: 'Missing user_id' });
    }

    const admin = supabaseAdmin();

    const initResult = await admin.rpc('initialize_user_metrics', {
      user_uuid: userId,
    });
    if (initResult.error) {
      return res.status(500).json({ error: initResult.error.message });
    }

    const zeroMetrics = {
      total_posts: 0,
      total_comments: 0,
      likes_given: 0,
      likes_received: 0,
      distinct_commenters: 0,
      invited_users_total: 0,
      invited_users_with_activity: 0,
      comments_on_others_posts: 0,
      threads_with_10_comments: 0,
      earned_badges_count: 0,
      total_posts_last_30d: 0,
      consecutive_active_days: 0,
      weekly_active_streak: 0,
      active_days: 0,
      social_weight: 0,
      updated_at: new Date().toISOString(),
    };

    const { error: updateError } = await admin
      .from('user_metrics')
      .update(zeroMetrics)
      .eq('user_id', userId);

    if (updateError) {
      return res.status(500).json({ error: updateError.message });
    }

    const { error: deleteError } = await admin
      .from('user_badges')
      .delete()
      .eq('user_id', userId);

    if (deleteError) {
      return res.status(500).json({ error: deleteError.message });
    }

    return res.status(200).json({ message: 'User progress reset', user_id: userId });
  } catch (error: any) {
    console.error('badges/reset error:', error);
    return res.status(500).json({ error: error?.message || 'Internal error' });
  }
}

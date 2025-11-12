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

    const { user_id, suspend } = req.body as { user_id: string; suspend: boolean };
    if (!user_id) return res.status(400).json({ error: 'user_id is required' });
    if (typeof suspend !== 'boolean') return res.status(400).json({ error: 'suspend must be a boolean' });

    const admin = supabaseAdmin();
    
    // Get current user to preserve metadata
    const { data: currentUser } = await admin.auth.admin.getUserById(user_id);
    if (!currentUser?.user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (suspend) {
      // Ban user (indefinitely, can be unban later)
      const { error } = await admin.auth.admin.updateUserById(user_id, {
        user_metadata: {
          ...(currentUser.user.user_metadata || {}),
          suspended: true,
          suspended_at: new Date().toISOString(),
        },
      });
      if (error) throw error;
    } else {
      // Unban user
      const { error: unbanError } = await admin.auth.admin.updateUserById(user_id, {
        ban_duration: '0s', // Unban immediately
        user_metadata: {
          ...(currentUser.user.user_metadata || {}),
          suspended: false,
        },
      });
      if (unbanError) throw unbanError;
    }

    return res.status(200).json({ ok: true, suspended: suspend });
  } catch (e: any) {
    console.error('users.suspend error', e);
    return res.status(500).json({ error: e?.message || 'Internal error' });
  }
}

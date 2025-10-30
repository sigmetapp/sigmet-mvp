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
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

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

    const admin = supabaseAdmin();

    // Helper to get exact count or 0 if table missing
    async function countExact(table: string, filter?: (q: any) => any): Promise<number> {
      try {
        let q: any = admin.from(table).select('*', { count: 'exact', head: true });
        if (filter) q = filter(q);
        const { count } = await q;
        return typeof count === 'number' ? count : 0;
      } catch {
        return 0;
      }
    }

    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    const [
      total_profiles,
      new_profiles_24h,
      posts_total,
      posts_24h,
      comments_total,
      dms_threads_total,
      dms_messages_24h,
      follows_total,
      dau_posts,
      dau_dms,
    ] = await Promise.all([
      countExact('profiles'),
      countExact('profiles', (q) => q.gte('created_at', dayAgo)),
      countExact('posts'),
      countExact('posts', (q) => q.gte('created_at', dayAgo)),
      countExact('comments'),
      countExact('dms_threads'),
      countExact('dms_messages', (q) => q.gte('created_at', dayAgo)),
      // follows table is optional in some envs
      (async () => {
        try {
          return await countExact('follows');
        } catch {
          return 0;
        }
      })(),
      // Distinct active users from posts in last 24h
      (async () => {
        try {
          const { data } = await admin
            .from('posts')
            .select('author_id', { count: 'exact' })
            .gte('created_at', dayAgo);
          const ids = new Set<string>();
          for (const row of (data as any[]) || []) {
            const id = (row as any).author_id || (row as any).user_id;
            if (id) ids.add(id);
          }
          return ids.size;
        } catch {
          return 0;
        }
      })(),
      // Distinct active users from dms_messages in last 24h
      (async () => {
        try {
          const { data } = await admin
            .from('dms_messages')
            .select('sender_id', { count: 'exact' })
            .gte('created_at', dayAgo);
          const ids = new Set<string>();
          for (const row of (data as any[]) || []) {
            const id = (row as any).sender_id || (row as any).sender;
            if (id) ids.add(id);
          }
          return ids.size;
        } catch {
          return 0;
        }
      })(),
    ]);

    const active_users_24h = new Set<number>();
    // We combined two numbers; but to avoid double counting without complex joins, approximate by max
    const activeApprox = Math.max(dau_posts, dau_dms);

    return res.status(200).json({
      total_profiles,
      new_profiles_24h,
      posts_total,
      posts_24h,
      comments_total,
      dms_threads_total,
      dms_messages_24h,
      follows_total,
      active_users_24h: activeApprox,
    });
  } catch (e: any) {
    console.error('admin.stats error', e);
    return res.status(500).json({ error: e?.message || 'Internal error' });
  }
}

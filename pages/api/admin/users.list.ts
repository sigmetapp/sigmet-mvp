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
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 30 });
    if (error) throw error;

    const users = (data?.users || []).sort((a: any, b: any) => (new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));

    // Load profiles, SW scores, and TF for all users
    const userIds = users.map((u: any) => u.id);
    const [profilesResult, swScoresResult] = await Promise.all([
      admin.from('profiles').select('user_id, avatar_url, trust_flow').in('user_id', userIds),
      admin.from('sw_scores').select('user_id, total').in('user_id', userIds),
    ]);

    // Create maps for quick lookup
    const avatarMap: Record<string, string | null> = {};
    const swMap: Record<string, number> = {};
    const tfMap: Record<string, number> = {};
    
    if (profilesResult.data) {
      for (const profile of profilesResult.data) {
        avatarMap[profile.user_id] = profile.avatar_url || null;
        tfMap[profile.user_id] = profile.trust_flow || 5.0;
      }
    }
    
    if (swScoresResult.data) {
      for (const sw of swScoresResult.data) {
        swMap[sw.user_id] = sw.total || 0;
      }
    }

    // Enrich users with avatar, SW, and TF data
    const enrichedUsers = users.map((u: any) => ({
      ...u,
      avatar_url: avatarMap[u.id] || null,
      sw_score: swMap[u.id] || 0,
      trust_flow: tfMap[u.id] || 5.0,
    }));

    return res.status(200).json({ users: enrichedUsers });
  } catch (e: any) {
    console.error('users.list error', e);
    return res.status(500).json({ error: e?.message || 'Internal error' });
  }
}

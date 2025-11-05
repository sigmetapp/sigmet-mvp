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

    // Check if projects table exists
    try {
      const { data, error } = await admin
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        // Table doesn't exist or other error
        return res.status(200).json({ projects: [] });
      }

      // Load usernames for projects
      const userIds = (data || [])
        .map((p: any) => p.author_id)
        .filter(Boolean) as string[];

      const usernames: Record<string, string> = {};
      const emails: Record<string, string> = {};

      if (userIds.length > 0) {
        try {
          const { data: profiles } = await admin
            .from('profiles')
            .select('user_id, username')
            .in('user_id', userIds);

          for (const profile of profiles || []) {
            if (profile.user_id && profile.username) {
              usernames[profile.user_id] = profile.username;
            }
          }

          // Get emails from auth.users
          const { data: authUsers } = await admin.auth.admin.listUsers();
          for (const user of authUsers.users || []) {
            if (user.id && user.email && userIds.includes(user.id)) {
              emails[user.id] = user.email;
            }
          }
        } catch (e) {
          console.error('Failed to load user data', e);
        }
      }

      const projects = (data || []).map((p: any) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        author_id: p.author_id,
        author_username: p.author_id ? usernames[p.author_id] : undefined,
        author_email: p.author_id ? emails[p.author_id] : undefined,
        status: p.status,
        created_at: p.created_at,
        updated_at: p.updated_at,
        metadata: p.metadata || {},
      }));

      return res.status(200).json({ projects });
    } catch (e) {
      // Table doesn't exist
      return res.status(200).json({ projects: [] });
    }
  } catch (e: any) {
    console.error('admin.projects.list error', e);
    return res.status(500).json({ error: e?.message || 'Internal error' });
  }
}
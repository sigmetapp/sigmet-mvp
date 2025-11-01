import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

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
    if (!userData?.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { title, description, image_urls, video_urls } = req.body;
    if (!title || !description || typeof title !== 'string' || typeof description !== 'string') {
      return res.status(400).json({ error: 'Title and description are required' });
    }

    if (title.trim().length === 0 || description.trim().length === 0) {
      return res.status(400).json({ error: 'Title and description cannot be empty' });
    }

    const { data, error } = await supabase
      .from('tickets')
      .insert({
        user_id: userData.user.id,
        title: title.trim(),
        description: description.trim(),
        status: 'open',
        image_urls: Array.isArray(image_urls) ? image_urls : [],
        video_urls: Array.isArray(video_urls) ? video_urls : [],
      })
      .select()
      .single();

    if (error) throw error;

    return res.status(201).json({ ticket: data });
  } catch (e: any) {
    console.error('tickets.create error', e);
    return res.status(500).json({ error: e?.message || 'Internal error' });
  }
}

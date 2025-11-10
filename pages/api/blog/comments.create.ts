import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabaseServer';

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

    const { post_id, content } = req.body;

    if (!post_id || !content) {
      return res.status(400).json({ error: 'Post ID and content are required' });
    }

    const admin = supabaseAdmin();
    const { data, error } = await admin
      .from('blog_comments')
      .insert({
        post_id: parseInt(post_id, 10),
        author_id: userData.user.id,
        content: content.trim(),
      })
      .select(`
        id,
        content,
        created_at,
        updated_at,
        author_id,
        profiles:author_id (
          username,
          full_name,
          avatar_url
        )
      `)
      .single();

    if (error) {
      console.error('Error creating blog comment:', error);
      return res.status(500).json({ error: 'Failed to create blog comment' });
    }

    return res.status(201).json({ comment: data });
  } catch (error: any) {
    console.error('Error in blog comment create API:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

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

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
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
    const email = userData?.user?.email || '';
    if (!email || !ADMIN_EMAILS.has(email)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { title, content, excerpt, type, media_urls, published_at } = req.body;

    if (!title || !content || !type) {
      return res.status(400).json({ error: 'Title, content, and type are required' });
    }

    if (type !== 'guideline' && type !== 'changelog') {
      return res.status(400).json({ error: 'Type must be guideline or changelog' });
    }

    const slug = generateSlug(title);
    const admin = supabaseAdmin();

    // Check if slug already exists
    const { data: existing } = await admin
      .from('blog_posts')
      .select('id')
      .eq('slug', slug)
      .single();

    if (existing) {
      return res.status(400).json({ error: 'A post with this title already exists' });
    }

    const { data, error } = await admin
      .from('blog_posts')
      .insert({
        author_id: userData.user!.id,
        title,
        slug,
        content,
        excerpt: excerpt || null,
        type,
        media_urls: media_urls || [],
        published_at: published_at || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating blog post:', error);
      return res.status(500).json({ error: 'Failed to create blog post' });
    }

    return res.status(201).json({ post: data });
  } catch (error: any) {
    console.error('Error in blog post create API:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

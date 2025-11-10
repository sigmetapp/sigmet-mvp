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

    console.log('Creating post with data:', { 
      title, 
      contentLength: content?.length, 
      excerpt, 
      type, 
      media_urls, 
      published_at,
      published_at_type: typeof published_at
    });

    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'Title is required and must be a non-empty string' });
    }

    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'Content is required and must be a non-empty string' });
    }

    if (!type || (type !== 'guideline' && type !== 'changelog')) {
      return res.status(400).json({ error: 'Type is required and must be either "guideline" or "changelog"' });
    }

    const slug = generateSlug(title);
    const admin = supabaseAdmin();

    // Check if slug already exists
    const { data: existing, error: checkError } = await admin
      .from('blog_posts')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('Error checking slug:', checkError);
      return res.status(500).json({ error: 'Failed to check slug availability' });
    }

    if (existing) {
      return res.status(400).json({ error: 'A post with this title already exists' });
    }

    // Handle published_at - convert empty string to null, validate date if provided
    let publishedAtValue: string | null = null;
    if (published_at) {
      if (typeof published_at === 'string' && published_at.trim() !== '') {
        try {
          const date = new Date(published_at);
          if (isNaN(date.getTime())) {
            return res.status(400).json({ error: 'Invalid published_at date format' });
          }
          publishedAtValue = date.toISOString();
        } catch (e) {
          return res.status(400).json({ error: 'Invalid published_at date format' });
        }
      }
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
        published_at: publishedAtValue,
      })
      .select(`
        id,
        title,
        slug,
        content,
        excerpt,
        type,
        media_urls,
        published_at,
        created_at,
        updated_at,
        author_id
      `)
      .single();

    if (error) {
      console.error('Error creating blog post:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      return res.status(500).json({ 
        error: `Failed to create blog post: ${error.message || 'Unknown error'}`,
        details: error
      });
    }

    return res.status(201).json({ post: data });
  } catch (error: any) {
    console.error('Error in blog post create API:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

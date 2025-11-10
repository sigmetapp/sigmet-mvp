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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { slug, id } = req.query;
    
    // Support both slug and id
    if (!slug && !id) {
      return res.status(400).json({ error: 'Slug or ID is required' });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
    const accessToken = getAccessTokenFromRequest(req);
    const supabase = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} },
    });

    const { data: userData } = await supabase.auth.getUser();
    const email = userData?.user?.email || '';
    const isAdmin = email && ADMIN_EMAILS.has(email);

    const admin = supabaseAdmin();
    let query = admin
      .from('blog_posts')
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
        author_id,
        profiles:author_id (
          username,
          full_name,
          avatar_url
        )
      `);
    
    if (id) {
      query = query.eq('id', parseInt(id as string, 10));
    } else {
      query = query.eq('slug', slug as string);
    }

    // If not admin, only show published posts
    if (!isAdmin) {
      query = query.not('published_at', 'is', null);
    }
    
    query = query.single();

    const { data, error } = await query;

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Post not found' });
      }
      console.error('Error fetching blog post:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      
      // Check if table doesn't exist
      if (error.message?.includes('relation') || error.message?.includes('does not exist')) {
        return res.status(500).json({ 
          error: 'Blog table not found. Please run migration 183_blog_system.sql',
          details: error.message
        });
      }
      
      return res.status(500).json({ 
        error: `Failed to fetch blog post: ${error.message || 'Unknown error'}`,
        details: error
      });
    }

    return res.status(200).json({ post: data });
  } catch (error: any) {
    console.error('Error in blog post get API:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

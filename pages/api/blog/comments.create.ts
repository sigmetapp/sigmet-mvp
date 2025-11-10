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

    const { post_id, content, parent_id } = req.body;

    if (!post_id || !content) {
      return res.status(400).json({ error: 'Post ID and content are required' });
    }

    const admin = supabaseAdmin();
    const insertData: any = {
      post_id: parseInt(post_id, 10),
      author_id: userData.user.id,
      content: content.trim(),
    };
    
    // Add parent_id if provided (for replies) - only if column exists
    if (parent_id) {
      // Try to insert with parent_id, fallback to without if column doesn't exist
      insertData.parent_id = parseInt(parent_id, 10);
    }

    let result = await admin
      .from('blog_comments')
      .insert(insertData)
      .select(`
        id,
        content,
        created_at,
        updated_at,
        author_id
      `)
      .single();
    
    let { data, error } = result;
    
    // If parent_id column doesn't exist (error code 42703), try without it
    if (error && (error.code === '42703' || error.message?.includes('parent_id') || error.message?.includes('column'))) {
      const insertDataWithoutParent: any = {
        post_id: parseInt(post_id, 10),
        author_id: userData.user.id,
        content: content.trim(),
      };
      result = await admin
        .from('blog_comments')
        .insert(insertDataWithoutParent)
        .select(`
          id,
          content,
          created_at,
          updated_at,
          author_id
        `)
        .single();
      data = result.data;
      error = result.error;
    }

    if (error) {
      console.error('Error creating blog comment:', error);
      console.error('Error details:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        post_id: parseInt(post_id, 10),
        author_id: userData.user.id,
        content_length: content.trim().length,
      });
      return res.status(500).json({ 
        error: 'Failed to create blog comment',
        details: error.message || 'Unknown error',
      });
    }

    // Fetch profile separately
    let profile = null;
    if (data?.author_id) {
      const { data: profileData } = await admin
        .from('profiles')
        .select('username, full_name, avatar_url')
        .eq('user_id', data.author_id)
        .maybeSingle();
      profile = profileData;
    }

    return res.status(201).json({ 
      comment: {
        ...data,
        profiles: profile
      }
    });
  } catch (error: any) {
    console.error('Error in blog comment create API:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

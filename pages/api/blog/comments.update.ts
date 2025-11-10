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
  if (req.method !== 'PUT' && req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id } = req.query;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Comment ID is required' });
    }

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

    const { content } = req.body;
    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const admin = supabaseAdmin();
    
    // Check if user owns the comment or is admin
    const { data: comment } = await admin
      .from('blog_comments')
      .select('author_id')
      .eq('id', parseInt(id, 10))
      .single();

    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    const email = userData.user.email || '';
    const isAdmin = email && ADMIN_EMAILS.has(email);
    
    if (comment.author_id !== userData.user.id && !isAdmin) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { data, error } = await admin
      .from('blog_comments')
      .update({ content: content.trim() })
      .eq('id', parseInt(id, 10))
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
      console.error('Error updating blog comment:', error);
      return res.status(500).json({ error: 'Failed to update blog comment' });
    }

    return res.status(200).json({ comment: data });
  } catch (error: any) {
    console.error('Error in blog comment update API:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

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
    const email = userData?.user?.email || '';
    if (!email || !ADMIN_EMAILS.has(email)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { user_id } = req.body as { user_id: string };
    if (!user_id) return res.status(400).json({ error: 'user_id is required' });

    const admin = supabaseAdmin();

    // Explicitly delete all user content before deleting the user
    // This ensures all posts, comments, reactions, and related data are removed
    // even if cascade deletion doesn't work due to RLS policies
    
    // Delete user's posts (this will cascade delete post_reactions and comments)
    await admin.from('posts').delete().eq('author_id', user_id);
    
    // Delete user's comments (this will cascade delete comment_reactions)
    await admin.from('comments').delete().eq('author_id', user_id);
    
    // Delete user's reactions on posts
    await admin.from('post_reactions').delete().eq('user_id', user_id);
    
    // Delete user's reactions on comments
    await admin.from('comment_reactions').delete().eq('user_id', user_id);
    
    // Delete user's goal reactions (both as reactor and as goal owner)
    await admin.from('goal_reactions').delete().eq('user_id', user_id);
    await admin.from('goal_reactions').delete().eq('goal_user_id', user_id);
    
    // Delete user's blog posts (this will cascade delete blog_post_reactions and blog_comments)
    await admin.from('blog_posts').delete().eq('author_id', user_id);
    
    // Delete user's blog comments (this will cascade delete blog_comment_reactions)
    await admin.from('blog_comments').delete().eq('author_id', user_id);
    
    // Delete user's blog post reactions
    await admin.from('blog_post_reactions').delete().eq('user_id', user_id);
    
    // Delete user's blog comment reactions
    await admin.from('blog_comment_reactions').delete().eq('user_id', user_id);
    
    // Delete user connections (mentions)
    await admin.from('user_connections').delete().eq('user_id', user_id);
    await admin.from('user_connections').delete().eq('connected_user_id', user_id);

    // Now delete the user (this will cascade delete profiles and other related data)
    const { error } = await admin.auth.admin.deleteUser(user_id);
    if (error) throw error;

    return res.status(200).json({ ok: true });
  } catch (e: any) {
    console.error('users.delete error', e);
    return res.status(500).json({ error: e?.message || 'Internal error' });
  }
}

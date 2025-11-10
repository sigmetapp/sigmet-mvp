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

    // This is a placeholder - actual file upload should be handled via Supabase Storage
    // For now, we'll return a signed URL endpoint that the client can use
    const { filename, contentType } = req.body;

    if (!filename || !contentType) {
      return res.status(400).json({ error: 'Filename and content type are required' });
    }

    const admin = supabaseAdmin();
    const filePath = `blog/${Date.now()}-${filename}`;

    // Generate a signed URL for upload
    const { data: signedUrlData, error: signedUrlError } = await admin.storage
      .from('blog-media')
      .createSignedUploadUrl(filePath, {
        upsert: false,
      });

    if (signedUrlError) {
      console.error('Error creating signed URL:', signedUrlError);
      return res.status(500).json({ error: 'Failed to create upload URL' });
    }

    // Get public URL after upload
    const { data: publicUrlData } = admin.storage
      .from('blog-media')
      .getPublicUrl(filePath);

    return res.status(200).json({
      uploadUrl: signedUrlData?.signedUrl,
      publicUrl: publicUrlData?.publicUrl,
      filePath,
    });
  } catch (error: any) {
    console.error('Error in blog media upload API:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

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

    const { file, fileName, fileType } = req.body;
    if (!file || !fileName) {
      return res.status(400).json({ error: 'File and fileName are required' });
    }

    const isImage = fileType?.startsWith('image/');
    const isVideo = fileType?.startsWith('video/');
    if (!isImage && !isVideo) {
      return res.status(400).json({ error: 'File must be an image or video' });
    }

    const admin = supabaseAdmin();
    const buf = Buffer.from(file, 'base64');
    const ext = fileName.split('.').pop() || (isImage ? 'jpg' : 'mp4');
    const folder = isImage ? 'tickets/images' : 'tickets/videos';
    const path = `${folder}/${userData.user.id}/${Date.now()}.${ext}`;

    const { error: upErr } = await admin.storage.from('assets').upload(path, buf, {
      upsert: false,
      contentType: fileType || (isImage ? 'image/jpeg' : 'video/mp4'),
    });

    if (upErr) throw upErr;

    const { data: urlData } = admin.storage.from('assets').getPublicUrl(path);
    return res.status(200).json({ url: urlData.publicUrl });
  } catch (e: any) {
    console.error('tickets.upload-media error', e);
    return res.status(500).json({ error: e?.message || 'Internal error' });
  }
}

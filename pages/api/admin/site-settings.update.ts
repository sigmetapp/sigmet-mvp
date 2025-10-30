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
  // find sb-*-auth-token
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

    const { site_name, invites_only, allowed_continents, logo } = req.body as {
      site_name?: string | null;
      invites_only?: boolean;
      allowed_continents?: string[];
      logo?: { name: string; type?: string; dataBase64: string } | null;
    };

    const admin = supabaseAdmin();

    let logo_url: string | null | undefined = undefined; // undefined = do not change
    if (logo && logo.dataBase64) {
      const ext = logo.name.split('.').pop() || 'png';
      const path = `logos/site-${Date.now()}.${ext}`;
      const buf = Buffer.from(logo.dataBase64, 'base64');
      const { error: upErr } = await admin.storage.from('assets').upload(path, buf, {
        upsert: true,
        contentType: logo.type || 'image/png',
      });
      if (upErr) throw upErr;
      const { data: urlData } = admin.storage.from('assets').getPublicUrl(path);
      logo_url = urlData.publicUrl;
    }

    const payload: any = {
      id: 1,
      site_name: site_name ?? null,
      updated_by: userData?.user?.id ?? null,
      updated_at: new Date().toISOString(),
    };
    if (typeof invites_only === 'boolean') payload.invites_only = invites_only;
    if (Array.isArray(allowed_continents)) payload.allowed_continents = allowed_continents;
    if (logo_url !== undefined) payload.logo_url = logo_url;

    // Try upsert; if the deployment's schema lacks new columns (like
    // allowed_continents/invites_only), Supabase can return a schema cache error.
    // In that case, retry without the missing fields for forward-compatibility.
    let { error: dbErr } = await admin.from('site_settings').upsert(payload, { onConflict: 'id' });
    if (dbErr) {
      const message = (dbErr?.message || '').toLowerCase();

      const missingCols: string[] = [];
      const candidates = ["allowed_continents", "invites_only"] as const;
      for (const col of candidates) {
        if (message.includes(`'${col}'`) && message.includes('schema cache') && col in payload) {
          missingCols.push(col);
        }
      }

      if (missingCols.length > 0) {
        const retryPayload = { ...payload } as Record<string, any>;
        for (const col of missingCols) delete retryPayload[col];
        const { error: retryErr } = await admin.from('site_settings').upsert(retryPayload, { onConflict: 'id' });
        if (retryErr) throw retryErr;
      } else {
        throw dbErr;
      }
    }

    return res.status(200).json({ ok: true, settings: payload });
  } catch (e: any) {
    console.error('site-settings.update error', e);
    return res.status(500).json({ error: e?.message || 'Internal error' });
  }
}

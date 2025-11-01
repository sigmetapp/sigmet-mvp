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

    const { ticket_id, status, admin_notes } = req.body;
    if (!ticket_id || typeof ticket_id !== 'number') {
      return res.status(400).json({ error: 'Ticket ID is required' });
    }

    const validStatuses = ['open', 'in_progress', 'resolved', 'closed'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const admin = supabaseAdmin();
    const updateData: any = {};
    if (status) updateData.status = status;
    if (admin_notes !== undefined) updateData.admin_notes = admin_notes;
    if (status === 'resolved' || status === 'closed') {
      updateData.resolved_at = new Date().toISOString();
    }

    const { data, error } = await admin
      .from('tickets')
      .update(updateData)
      .eq('id', ticket_id)
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json({ ticket: data });
  } catch (e: any) {
    console.error('admin.tickets.update error', e);
    return res.status(500).json({ error: e?.message || 'Internal error' });
  }
}

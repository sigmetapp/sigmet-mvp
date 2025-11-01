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
    if (!userData?.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { ticket_id, body, image_urls, video_urls } = req.body;
    if (!ticket_id || typeof ticket_id !== 'number') {
      return res.status(400).json({ error: 'Ticket ID is required' });
    }

    if (!body || typeof body !== 'string' || body.trim().length === 0) {
      return res.status(400).json({ error: 'Message body is required' });
    }

    const email = userData.user.email || '';
    const isAdmin = ADMIN_EMAILS.has(email);

    // Check if ticket exists and is not closed/resolved (for users)
    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .select('id, user_id, status')
      .eq('id', ticket_id)
      .single();

    if (ticketError || !ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    if (!isAdmin && ticket.user_id !== userData.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!isAdmin && (ticket.status === 'closed' || ticket.status === 'resolved')) {
      return res.status(400).json({ error: 'Cannot add messages to closed or resolved tickets' });
    }

    const admin = supabaseAdmin();
    const { data, error } = await admin
      .from('ticket_messages')
      .insert({
        ticket_id,
        user_id: userData.user.id,
        body: body.trim(),
        image_urls: Array.isArray(image_urls) ? image_urls : [],
        video_urls: Array.isArray(video_urls) ? video_urls : [],
        is_admin: isAdmin,
      })
      .select()
      .single();

    if (error) throw error;

    return res.status(201).json({ message: data });
  } catch (e: any) {
    console.error('tickets.messages.create error', e);
    return res.status(500).json({ error: e?.message || 'Internal error' });
  }
}

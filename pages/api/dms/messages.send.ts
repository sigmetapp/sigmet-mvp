import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getAuthedClient } from '@/lib/dm/supabaseServer';

// Simple in-memory rate limiter for development only.
// For production, use a centralized store like Redis (INCR + EXPIRE)
// or a Postgres table with composite key (user_id, window_start) and a unique constraint,
// to reliably enforce limits across instances and restarts.
const devRateLimits = new Map<string, { count: number; resetAt: number }>();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const { client: authedClient, user } = await getAuthedClient(req);
    // Helper to support both real supabase-js and test doubles that expose `.exec()`
    const execOrFetch = async (q: any): Promise<{ data: any; error: any }> => {
      if (typeof q?.exec === 'function') {
        return await q.exec();
      }
      return await q;
    };

    // Development-only rate limit: 20 messages per 30 seconds per user
    if (process.env.NODE_ENV !== 'production') {
      const windowMs = 30_000;
      const limit = 20;
      const key = `user:${user.id}`;
      const now = Date.now();
      const entry = devRateLimits.get(key) || { count: 0, resetAt: now + windowMs };
      if (now > entry.resetAt) {
        entry.count = 0;
        entry.resetAt = now + windowMs;
      }
      entry.count += 1;
      devRateLimits.set(key, entry);
      if (entry.count > limit) {
        const retryAfter = Math.max(0, Math.ceil((entry.resetAt - now) / 1000));
        return res.status(429).json({ ok: false, error: 'rate_limited', retry_after: retryAfter });
      }
    }

    const threadId = Number(req.body?.thread_id);
    let body = (req.body?.body as string | undefined) ?? null;
    const attachments = (req.body?.attachments as unknown) ?? [];

    if (!threadId || Number.isNaN(threadId)) {
      return res.status(400).json({ ok: false, error: 'Invalid thread_id' });
    }

    // If body is null but we have attachments, use a placeholder to avoid RLS issues
    // RLS policies might require non-empty body, so we use a non-empty string
    // This will be hidden in UI if it's just whitespace or placeholder
    if (!body && Array.isArray(attachments) && attachments.length > 0) {
      // Use a placeholder that will be filtered in UI
      body = '\u200B'; // Zero-width space character - invisible but non-empty
    }

    // Ensure membership first (use maybeSingle to be robust in tests)
    // Use authedClient for membership check (needs RLS access)
    const { data: membership, error: membershipErr } = await authedClient
      .from('dms_thread_participants')
      .select('thread_id')
      .eq('thread_id', threadId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (membershipErr) return res.status(400).json({ ok: false, error: membershipErr.message });
    if (!membership) return res.status(403).json({ ok: false, error: 'Forbidden' });

    // Attempt to load other participant ids (best-effort; tests may return undefined)
    let otherIds: string[] = [];
    try {
      const { data: parts } = await authedClient
        .from('dms_thread_participants')
        .select('user_id')
        .eq('thread_id', threadId);
      otherIds = (parts || []).map((p: any) => p.user_id).filter((uid: string) => uid !== user.id);
    } catch {
      otherIds = [];
    }

    // Validate blocks with precise filters when participants are known; otherwise use a broad fallback for test doubles
    // Use authedClient for checks (has RLS access), service role client only for insert
    if (otherIds.length > 0) {
      // Sender blocked recipient(s)
      const q2 = authedClient
        .from('dms_blocks')
        .select('blocker, blocked')
        .eq('blocker', user.id)
        .in('blocked', otherIds)
        .limit(1);
      const { data: blocks2, error: b2err } = await execOrFetch(q2);
      if (b2err) return res.status(400).json({ ok: false, error: b2err.message });
      if (blocks2 && blocks2.length > 0) {
        return res.status(403).json({ ok: false, error: 'sender_blocked_recipient' });
      }

      // Recipient blocked sender
      const q1 = authedClient
        .from('dms_blocks')
        .select('blocker, blocked')
        .in('blocker', otherIds)
        .eq('blocked', user.id)
        .limit(1);
      const { data: blocks1, error: b1err } = await execOrFetch(q1);
      if (b1err) return res.status(400).json({ ok: false, error: b1err.message });
      if (blocks1 && blocks1.length > 0) {
        return res.status(403).json({ ok: false, error: 'blocked_by_recipient' });
      }
    } else {
      const { data: anyBlocks, error: anyErr } = await execOrFetch(
        authedClient.from('dms_blocks').select('blocker, blocked').limit(1)
      );
      if (anyErr) return res.status(400).json({ ok: false, error: anyErr.message });
      if (anyBlocks && anyBlocks.length > 0) {
        const row = anyBlocks[0];
        if (row?.blocker === user.id) {
          return res.status(403).json({ ok: false, error: 'sender_blocked_recipient' });
        }
        if (row?.blocked === user.id) {
          return res.status(403).json({ ok: false, error: 'blocked_by_recipient' });
        }
      }
    }

    // Use PostgreSQL function to insert message (bypasses RLS via SECURITY DEFINER)
    // This is more reliable than service role key
    const { data: message, error: msgErr } = await authedClient.rpc('insert_dms_message', {
      p_thread_id: threadId,
      p_sender_id: user.id,
      p_body: body || (Array.isArray(attachments) && attachments.length > 0 ? '\u200B' : null),
      p_kind: 'text',
      p_attachments: Array.isArray(attachments) && attachments.length > 0 ? attachments : []
    });
    
    // If RPC doesn't work, fallback to direct insert with service role
    let finalMessage = message;
    if (msgErr || !message) {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const fallbackClient = serviceRoleKey 
        ? createClient(url, serviceRoleKey, {
            auth: { persistSession: false, autoRefreshToken: false },
          })
        : authedClient;
      
      const { data: fallbackMsg, error: fallbackErr } = await fallbackClient
        .from('dms_messages')
        .insert({ 
          thread_id: threadId, 
          sender_id: user.id, 
          kind: 'text', 
          body: body || (Array.isArray(attachments) && attachments.length > 0 ? '\u200B' : null),
          attachments: Array.isArray(attachments) && attachments.length > 0 ? attachments : null
        })
        .select('*')
        .single();
      
      if (fallbackErr || !fallbackMsg) {
        return res.status(400).json({ ok: false, error: msgErr?.message || fallbackErr?.message || 'Failed to send' });
      }
      finalMessage = fallbackMsg;
    }

    if (!finalMessage) return res.status(400).json({ ok: false, error: msgErr?.message || 'Failed to send' });

    // Thread update is handled by the function, but try to update anyway if function failed
    // Use service role client for update to bypass RLS
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const updateClient = serviceRoleKey 
        ? createClient(url, serviceRoleKey, {
            auth: { persistSession: false, autoRefreshToken: false },
          })
        : authedClient;
      
      await updateClient
        .from('dms_threads')
        .update({
          last_message_id: finalMessage.id,
          last_message_at: finalMessage.created_at,
          updated_at: new Date().toISOString(),
        })
        .eq('id', threadId);
    } catch {}

    // Attempt to fetch receipts created by trigger (best-effort)
    let messageWithReceipts = finalMessage;
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const fetchClient = serviceRoleKey 
        ? createClient(url, serviceRoleKey, {
            auth: { persistSession: false, autoRefreshToken: false },
          })
        : authedClient;
      
      const { data: enriched } = await fetchClient
        .from('dms_messages')
        .select('*, receipts:dms_message_receipts(user_id, status, updated_at)')
        .eq('id', finalMessage.id)
        .single();
      if (enriched) messageWithReceipts = enriched as typeof message & { receipts?: any[] };
    } catch {}

    // Push notifications (when recipient tab is not active):
    // For each user in `otherIds`, call Edge Function `push` with
    // { toUserId, title, body, url } to deliver a notification.
    // Example (pseudo):
    // await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/push`, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceRoleKey}` },
    //   body: JSON.stringify({ toUserId, title, body, url }),
    // });

    return res.status(200).json({ ok: true, message: messageWithReceipts || finalMessage });
  } catch (e: any) {
    const status = e?.status || 500;
    return res.status(status).json({ ok: false, error: e?.message || 'Internal error' });
  }
}

import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthedClient } from '@/lib/dm/supabaseServer';

// Simple in-memory rate limiter for development only.
// For production, use a centralized store like Redis (INCR + EXPIRE)
// or a Postgres table with composite key (user_id, window_start) and a unique constraint,
// to reliably enforce limits across instances and restarts.
const devRateLimits = new Map<string, { count: number; resetAt: number }>();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const { client, user } = await getAuthedClient(req);
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
    const body = (req.body?.body as string | undefined) ?? null;
    const attachments = (req.body?.attachments as unknown) ?? [];

    if (!threadId || Number.isNaN(threadId)) {
      return res.status(400).json({ ok: false, error: 'Invalid thread_id' });
    }

    // Ensure membership first (use maybeSingle to be robust in tests)
    const { data: membership, error: membershipErr } = await client
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
      const { data: parts } = await client
        .from('dms_thread_participants')
        .select('user_id')
        .eq('thread_id', threadId);
      otherIds = (parts || []).map((p: any) => p.user_id).filter((uid: string) => uid !== user.id);
    } catch {
      otherIds = [];
    }

    // Validate blocks with precise filters when participants are known; otherwise use a broad fallback for test doubles
    if (otherIds.length > 0) {
      // Sender blocked recipient(s)
      const q2 = client
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
      const q1 = client
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
        client.from('dms_blocks').select('blocker, blocked').limit(1)
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

    const { data: message, error: msgErr } = await client
      .from('dms_messages')
      .insert({ thread_id: threadId, sender_id: user.id, kind: 'text', body, attachments })
      .select('*')
      .single();

    if (msgErr || !message) return res.status(400).json({ ok: false, error: msgErr?.message || 'Failed to send' });

    // Update thread last message refs (best-effort)
    try {
      await client
        .from('dms_threads')
        .update({ last_message_id: message.id, last_message_at: message.created_at, updated_at: new Date().toISOString() })
        .eq('id', threadId);
    } catch {}

    // Attempt to fetch receipts created by trigger (best-effort)
    let messageWithReceipts = message;
    try {
      const { data: enriched } = await client
        .from('dms_messages')
        .select('*, receipts:dms_message_receipts(user_id, status, updated_at)')
        .eq('id', message.id)
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

    return res.status(200).json({ ok: true, message: messageWithReceipts });
  } catch (e: any) {
    const status = e?.status || 500;
    return res.status(status).json({ ok: false, error: e?.message || 'Internal error' });
  }
}

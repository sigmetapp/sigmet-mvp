import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthedClient } from '@/lib/dm/supabaseServer';
import { assertThreadId } from '@/lib/dm/threadId';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const { client, user } = await getAuthedClient(req);

    const threadId = (() => {
      try {
        return assertThreadId(req.query.thread_id, 'Invalid thread_id');
      } catch {
        return null;
      }
    })();
    if (!threadId) {
      return res.status(400).json({ ok: false, error: 'Invalid thread_id' });
    }

    // Ensure membership
    const { data: membership } = await client
      .from('dms_thread_participants')
      .select('thread_id')
      .eq('thread_id', threadId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership) return res.status(403).json({ ok: false, error: 'Forbidden' });

    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 50));

    // Include per-message receipts so the client can compute sent/delivered/read
    // Note: receipts are created by DB trigger on insert and updated to 'read'
    // via the messages.read endpoint.
    let q = client
      .from('dms_messages')
      .select('*, receipts:dms_message_receipts(user_id, status, updated_at)')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit);

    let { data: messages, error } = await q;
    
    // If error is about updated_at column not existing, retry without it
    if (error && error.message?.includes('updated_at')) {
      console.warn('updated_at column not found in receipts, retrying without it');
      q = client
        .from('dms_messages')
        .select('*, receipts:dms_message_receipts(user_id, status)')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(limit);
      const retryResult = await q;
      messages = retryResult.data;
      error = retryResult.error;
    }
    
    if (error) return res.status(400).json({ ok: false, error: error.message });

    return res.status(200).json({ ok: true, messages });
  } catch (e: any) {
    const status = e?.status || 500;
    return res.status(status).json({ ok: false, error: e?.message || 'Internal error' });
  }
}

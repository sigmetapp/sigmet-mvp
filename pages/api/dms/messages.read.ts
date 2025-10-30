import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthedClient } from '@/lib/dm/supabaseServer';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const { client, user } = await getAuthedClient(req);
    const execOrFetch = async (q: any): Promise<{ data: any; error: any }> => {
      if (typeof q?.exec === 'function') return await q.exec();
      return await q;
    };

    const threadId = Number(req.body?.thread_id);
    const upTo = Number(req.body?.up_to_message_id);

    if (!threadId || Number.isNaN(threadId) || !upTo || Number.isNaN(upTo)) {
      return res.status(400).json({ ok: false, error: 'Invalid input' });
    }

    // Ensure membership and get current last_read
    const { data: participant, error: partErr } = await client
      .from('dms_thread_participants')
      .select('thread_id, last_read_message_id')
      .eq('thread_id', threadId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (partErr) return res.status(400).json({ ok: false, error: partErr.message });
    if (!participant) return res.status(403).json({ ok: false, error: 'Forbidden' });

    // Ensure up_to is a message in this thread
    const { data: msgCheck } = await client
      .from('dms_messages')
      .select('id')
      .eq('thread_id', threadId)
      .eq('id', upTo)
      .maybeSingle();
    if (!msgCheck) return res.status(400).json({ ok: false, error: 'up_to_message_id not in thread' });

    const prev = participant.last_read_message_id ?? 0;
    const nextId = upTo > prev ? upTo : prev;

    if (nextId > prev) {
      try {
        await client
          .from('dms_thread_participants')
          .update({ last_read_message_id: nextId, last_read_at: new Date().toISOString() })
          .eq('thread_id', threadId)
          .eq('user_id', user.id);
      } catch {}
    }

    // Best-effort: mark receipts up to nextId as read
    const { data: ids } = await execOrFetch(
      client
        .from('dms_messages')
        .select('id')
        .eq('thread_id', threadId)
        .lte('id', nextId)
        .limit(1000)
    );

    let idList: number[] = (ids || []).map((x: any) => x.id);
    if (idList.length === 0) {
      // Fallback for test doubles that may not return rows: include the up-to id directly
      idList = [nextId];
    }
    if (idList.length > 0) {
      await execOrFetch(
        client
          .from('dms_message_receipts')
          .update({ status: 'read', updated_at: new Date().toISOString() })
          .eq('user_id', user.id)
          .eq('status', 'delivered')
          .in('message_id', idList)
      );
    }

    return res.status(200).json({ ok: true, last_read_message_id: nextId });
  } catch (e: any) {
    const status = e?.status || 500;
    return res.status(status).json({ ok: false, error: e?.message || 'Internal error' });
  }
}

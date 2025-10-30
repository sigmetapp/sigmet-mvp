import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthedClient } from '@/lib/dm/supabaseServer';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const { client, user } = await getAuthedClient(req);

    const { data: rows, error } = await client
      .from('dms_thread_participants')
      .select(`
        thread_id,
        role,
        last_read_message_id,
        notifications_muted,
        thread:dms_threads(
          id, created_by, is_group, title, created_at, last_message_at
        )
      `)
      .eq('user_id', user.id);

    if (error) return res.status(400).json({ ok: false, error: error.message });

    // Compute unread counts per thread using last_read_message_id
    const result = [] as any[];
    for (const r of rows || []) {
      const thread = r.thread;
      if (!thread) continue;
      const lastReadId: number = r.last_read_message_id ?? 0;
      const { count } = await client
        .from('dms_messages')
        .select('*', { count: 'exact', head: true })
        .eq('thread_id', thread.id)
        .gt('id', lastReadId)
        .neq('sender_id', user.id);

      result.push({
        thread,
        participant: {
          thread_id: r.thread_id,
          role: r.role,
          last_read_message_id: r.last_read_message_id,
          notifications_muted: r.notifications_muted,
        },
        unread_count: count ?? 0,
      });
    }

    // Sort by last_message_at desc (nulls last), then created_at desc as fallback
    result.sort((a, b) => {
      const ax = a.thread?.last_message_at ? new Date(a.thread.last_message_at).getTime() : 0;
      const bx = b.thread?.last_message_at ? new Date(b.thread.last_message_at).getTime() : 0;
      if (ax !== bx) return bx - ax;
      const ac = a.thread?.created_at ? new Date(a.thread.created_at).getTime() : 0;
      const bc = b.thread?.created_at ? new Date(b.thread.created_at).getTime() : 0;
      return bc - ac;
    });

    return res.status(200).json({ ok: true, threads: result });
  } catch (e: any) {
    const status = e?.status || 500;
    return res.status(status).json({ ok: false, error: e?.message || 'Internal error' });
  }
}

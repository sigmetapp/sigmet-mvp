import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthedClient } from '@/lib/dm/supabaseServer';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const { client, user } = await getAuthedClient(req);
    const rawParticipants = (req.body?.participant_ids as string[] | undefined) || [];
    const title = (req.body?.title as string | undefined) || null;

    const otherParticipantIds = Array.from(new Set(rawParticipants.filter(Boolean))).filter(
      (id) => id !== user.id
    );
    if (otherParticipantIds.length === 0) {
      return res.status(400).json({ ok: false, error: 'participant_ids required' });
    }

    // 1-on-1: block if either side has blocked the other; otherwise use RPC ensure_1on1_thread(a,b)
    if (otherParticipantIds.length === 1) {
      const a = user.id;
      const b = otherParticipantIds[0]!;
      // Prevent creating a 1:1 thread if blocked in either direction
      const { data: blocks, error: blocksErr } = await client
        .from('dms_blocks')
        .select('blocker, blocked')
        .in('blocker', [a, b])
        .in('blocked', [a, b])
        .limit(1);
      if (blocksErr) return res.status(400).json({ ok: false, error: blocksErr.message });
      if (blocks && blocks.length > 0) {
        return res.status(403).json({ ok: false, error: 'blocked' });
      }
      const { data, error } = await client.rpc('ensure_1on1_thread', { a, b }).maybeSingle();
      if (error) return res.status(400).json({ ok: false, error: error.message });
      return res.status(200).json({ ok: true, thread: data });
    }

    // Group thread creation
    const { data: thread, error: threadErr } = await client
      .from('dms_threads')
      .insert({ created_by: user.id, is_group: true, title })
      .select('*')
      .single();

    if (threadErr || !thread) {
      return res.status(400).json({ ok: false, error: threadErr?.message || 'Failed to create thread' });
    }

    const participantIds = Array.from(new Set([user.id, ...otherParticipantIds]));
    const rows = participantIds.map((uid) => ({ thread_id: thread.id, user_id: uid, role: uid === user.id ? 'owner' : 'member' }));

    const { error: partErr } = await client.from('dms_thread_participants').insert(rows);
    if (partErr) return res.status(400).json({ ok: false, error: partErr.message });

    return res.status(200).json({ ok: true, thread });
  } catch (e: any) {
    const status = e?.status || 500;
    return res.status(status).json({ ok: false, error: e?.message || 'Internal error' });
  }
}

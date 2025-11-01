import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthedClient } from '@/lib/dm/supabaseServer';
import { coerceThreadId, assertThreadId } from '@/lib/dm/threadId';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const { client, user } = await getAuthedClient(req);
    const execOrFetch = async (q: any): Promise<{ data: any; error: any }> => {
      if (typeof q?.exec === 'function') return await q.exec();
      return await q;
    };
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
      const { data: blocks, error: blocksErr } = await execOrFetch(
        client
          .from('dms_blocks')
          .select('blocker, blocked')
          .in('blocker', [a, b])
          .in('blocked', [a, b])
          .limit(1)
      );
      if (blocksErr) return res.status(400).json({ ok: false, error: blocksErr.message });
      if (blocks && blocks.length > 0) {
        return res.status(403).json({ ok: false, error: 'blocked' });
      }
      const { data, error } = await client.rpc('ensure_1on1_thread', { a, b }).maybeSingle();
      if (!error) return res.status(200).json({ ok: true, thread: data });

      // Fallback path if RPC is missing in the database
      // Postgres undefined_function code is 42883; also match message text just in case
      const errMsg = (error.message || '').toLowerCase();
      const looksMissing = (error as any)?.code === '42883' || errMsg.includes('ensure_1on1_thread');
      if (looksMissing) {
        // Try to find an existing 1:1 thread by intersecting participant thread ids
        const [aList, bList] = await Promise.all([
          execOrFetch(client.from('dms_thread_participants').select('thread_id').eq('user_id', a)),
          execOrFetch(client.from('dms_thread_participants').select('thread_id').eq('user_id', b)),
        ]);
        const aIds = new Set<string>();
        for (const row of (aList.data as any[]) || []) {
          const tid = coerceThreadId(row.thread_id);
          if (tid) aIds.add(tid);
        }
        const both: string[] = [];
        for (const row of (bList.data as any[]) || []) {
          const tid = coerceThreadId(row.thread_id);
          if (tid && aIds.has(tid)) {
            both.push(tid);
          }
        }
        if (both.length > 0) {
          const { data: existing } = await client
            .from('dms_threads')
            .select('*')
            .in('id', both)
            .eq('is_group', false)
            .order('id', { ascending: false })
            .maybeSingle();
          if (existing) {
            const tid = coerceThreadId(existing.id);
            if (!tid) {
              return res.status(400).json({ ok: false, error: 'Invalid thread ID returned from database' });
            }
            return res.status(200).json({ ok: true, thread: { ...existing, id: tid } });
          }
        }

        // Create new thread and add participants
        const { data: thread, error: tErr } = await client
          .from('dms_threads')
          .insert({ created_by: a, is_group: false })
          .select('*')
          .single();
        if (tErr || !thread) return res.status(400).json({ ok: false, error: tErr?.message || 'Failed to create thread' });

        const threadId = assertThreadId(thread.id, 'Invalid thread ID returned from database');
        const rows = [
          { thread_id: threadId, user_id: a, role: 'owner' },
          { thread_id: threadId, user_id: b, role: 'member' },
        ];
        const { error: pErr } = await client.from('dms_thread_participants').insert(rows);
        if (pErr) return res.status(400).json({ ok: false, error: pErr.message });

        return res.status(200).json({ ok: true, thread: { ...thread, id: threadId } });
      }

      return res.status(400).json({ ok: false, error: error.message });
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

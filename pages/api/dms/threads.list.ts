import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthedClient } from '@/lib/dm/supabaseServer';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const { client, user } = await getAuthedClient(req);

      const selectVariants = [
        `
          thread_id,
          role,
          last_read_message_id,
          last_read_at,
          notifications_muted,
          mute_until,
          is_pinned,
          pinned_at,
          thread:dms_threads(
            id, created_by, is_group, title, created_at, last_message_at
          )
        `,
        `
          thread_id,
          role,
          last_read_message_id,
          last_read_at,
          notifications_muted,
          thread:dms_threads(
            id, created_by, is_group, title, created_at, last_message_at
          )
        `,
        `
          thread_id,
          role,
          last_read_message_id,
          notifications_muted,
          thread:dms_threads(
            id, created_by, is_group, title, created_at, last_message_at
          )
        `,
        `
          thread_id,
          role,
          notifications_muted,
          thread:dms_threads(
            id, created_by, is_group, title, created_at, last_message_at
          )
        `,
        `
          thread_id,
          role,
          thread:dms_threads(
            id, created_by, is_group, title, created_at, last_message_at
          )
        `,
      ];

      let rows: any[] | null = null;
      let lastError: any = null;

      for (const selection of selectVariants) {
        const { data, error } = await client
          .from('dms_thread_participants')
          .select(selection)
          .eq('user_id', user.id);

        if (!error) {
          rows = data || [];
          lastError = null;
          break;
        }

        lastError = error;
    }

      if (!rows) {
        return res.status(400).json({ ok: false, error: lastError?.message || 'Failed to load threads' });
      }

    // Compute unread counts per thread. Prefer last_read_message_id when available;
    // otherwise fall back to counting 'delivered' receipts for this user in the thread.
    const result = [] as any[];
    for (const r of rows || []) {
      const thread = r.thread;
      if (!thread) continue;
        let unreadCount = 0;
        const notificationsMuted = r.notifications_muted ?? false;
        const muteUntil = r.mute_until ?? null;
        const isPinned = r.is_pinned ?? false;
        const pinnedAt = r.pinned_at ?? null;
        const lastReadAt = r.last_read_at ?? null;

      if (typeof r.last_read_message_id === 'number') {
        const lastReadId: number = r.last_read_message_id ?? 0;
        const { count } = await client
          .from('dms_messages')
          .select('*', { count: 'exact', head: true })
          .eq('thread_id', thread.id)
          .gt('id', lastReadId)
          .neq('sender_id', user.id);
        unreadCount = count ?? 0;
      } else {
        // Fallback path when last_read_message_id column is missing: count
        // delivered receipts for this user for messages in this thread.
        try {
          const { data: ids } = await client
            .from('dms_messages')
            .select('id')
            .eq('thread_id', thread.id)
            .limit(1000);
          const messageIds: number[] = (ids || []).map((x: any) => x.id);
          if (messageIds.length > 0) {
            const { count } = await client
              .from('dms_message_receipts')
              .select('*', { count: 'exact', head: true })
              .eq('user_id', user.id)
              .eq('status', 'delivered')
              .in('message_id', messageIds);
            unreadCount = count ?? 0;
          } else {
            unreadCount = 0;
          }
        } catch {
          unreadCount = 0;
        }
      }

        result.push({
          thread,
          participant: {
            thread_id: r.thread_id,
            role: r.role,
            last_read_message_id: r.last_read_message_id,
            last_read_at: lastReadAt,
            notifications_muted: notificationsMuted,
            mute_until: muteUntil,
            is_pinned: Boolean(isPinned),
            pinned_at: pinnedAt,
          },
          unread_count: unreadCount,
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

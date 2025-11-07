import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthedClient } from '@/lib/dm/supabaseServer';

  const DEFAULT_LIMIT = 20;
  const MAX_LIMIT = 50;
  const MUTUAL_SUGGESTION_LIMIT = 20;

  type PartnerResponse = {
    user_id: string;
    username: string | null;
    full_name: string | null;
    avatar_url: string | null;
  thread_id: string | null;
    messages24h: number | null;
    last_message_at: string | null;
    created_at: string | null;
  last_message_id: string | null;
    last_message_body: string | null;
    last_message_kind: string | null;
    last_message_sender_id: string | null;
    unread_count: number;
    is_pinned: boolean;
    pinned_at: string | null;
    notifications_muted: boolean;
    mute_until: string | null;
  last_read_message_id: string | null;
    last_read_at: string | null;
    source: 'thread' | 'mutual';
  };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const { client, user } = await getAuthedClient(req);

    const limitParam = Number.parseInt(String(req.query.limit ?? ''), 10);
    const offsetParam = Number.parseInt(String(req.query.offset ?? ''), 10);
    const includeMutualParam = String(req.query.include_mutual ?? 'true').toLowerCase() !== 'false';

      const limit = Number.isFinite(limitParam)
        ? Math.min(Math.max(limitParam, 1), MAX_LIMIT)
        : DEFAULT_LIMIT;
      const offset = Number.isFinite(offsetParam) && offsetParam >= 0 ? offsetParam : 0;

      const fetchLimit = limit + 1;
      const { data: threadData, error: threadError } = await client.rpc('dms_list_partners', {
        p_user_id: user.id,
        p_limit: fetchLimit,
        p_offset: offset,
      });

      if (threadError) {
        return res.status(400).json({ ok: false, error: threadError.message });
      }

      const rows = Array.isArray(threadData) ? threadData : [];
      const hasMoreThreads = rows.length > limit;
      const trimmedRows = rows.slice(0, limit);

      const partners: PartnerResponse[] = trimmedRows
        .map((row) => {
          const partnerId = row.partner_id as string | null;
          const threadId = typeof row.thread_id === 'string' ? row.thread_id : row.thread_id?.toString() ?? null;

          if (!partnerId) {
            return null;
          }

          return {
            user_id: partnerId,
            username: row.partner_username ?? null,
            full_name: row.partner_full_name ?? null,
            avatar_url: row.partner_avatar_url ?? null,
            thread_id: threadId,
            messages24h: typeof row.messages24h === 'number' ? row.messages24h : Number(row.messages24h ?? 0),
            last_message_at: row.last_message_at ?? null,
            created_at: row.thread_created_at ?? null,
            last_message_id: row.last_message_id ? String(row.last_message_id) : null,
            last_message_body: row.last_message_body ?? null,
            last_message_kind: row.last_message_kind ?? null,
            last_message_sender_id: row.last_message_sender_id ?? null,
            unread_count: typeof row.unread_count === 'number' ? row.unread_count : Number(row.unread_count ?? 0),
            is_pinned: Boolean(row.is_pinned),
            pinned_at: row.pinned_at ?? null,
            notifications_muted: Boolean(row.notifications_muted),
            mute_until: row.mute_until ?? null,
            last_read_message_id: row.last_read_message_id ? String(row.last_read_message_id) : null,
            last_read_at: row.last_read_at ?? null,
            source: 'thread',
          };
        })
        .filter((partner): partner is PartnerResponse => Boolean(partner));

      const partnerIds = new Set(partners.map((p) => p.user_id));

    // Optional mutual follow suggestions (only for first page)
    if (includeMutualParam && offset === 0) {
      try {
        const [{ data: iFollowRows }, { data: followMeRows }] = await Promise.all([
          client
            .from('follows')
            .select('followee_id')
            .eq('follower_id', user.id),
          client
            .from('follows')
            .select('follower_id')
            .eq('followee_id', user.id),
        ]);

        const iFollowSet = new Set<string>();
        const followMeSet = new Set<string>();

        for (const row of iFollowRows ?? []) {
          const id = row.followee_id as string | null;
          if (id && id !== user.id) {
            iFollowSet.add(id);
          }
        }

        for (const row of followMeRows ?? []) {
          const id = row.follower_id as string | null;
          if (id && id !== user.id) {
            followMeSet.add(id);
          }
        }

        const existingPartnerSet = new Set(partnerIds);
        const mutualIds: string[] = [];

        for (const candidate of iFollowSet) {
          if (followMeSet.has(candidate) && !existingPartnerSet.has(candidate)) {
            mutualIds.push(candidate);
          }
          if (mutualIds.length >= MUTUAL_SUGGESTION_LIMIT) {
            break;
          }
        }

          if (mutualIds.length > 0) {
            const { data: mutualProfiles } = await client
              .from('profiles')
              .select('user_id, username, full_name, avatar_url')
              .in('user_id', mutualIds);

            for (const profile of mutualProfiles ?? []) {
              partners.push({
                user_id: profile.user_id,
                username: profile.username ?? null,
                full_name: profile.full_name ?? null,
                avatar_url: profile.avatar_url ?? null,
                thread_id: null,
                messages24h: null,
                last_message_at: null,
                created_at: null,
                last_message_id: null,
                last_message_body: null,
                last_message_kind: null,
                last_message_sender_id: null,
                unread_count: 0,
                is_pinned: false,
                pinned_at: null,
                notifications_muted: false,
                mute_until: null,
                last_read_message_id: null,
                last_read_at: null,
                source: 'mutual',
              });
            }
          }
      } catch (err) {
        console.warn('Failed to load mutual follow suggestions:', err);
      }
    }

    return res.status(200).json({
      ok: true,
      partners,
      pagination: {
        hasMore: hasMoreThreads,
        nextOffset: offset + trimmedRows.length,
      },
    });
  } catch (err: any) {
    const status = err?.status || 500;
    return res.status(status).json({ ok: false, error: err?.message || 'Internal error' });
  }
}

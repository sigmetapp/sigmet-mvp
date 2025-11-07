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
  thread_id: number | null;
  messages24h: number | null;
  last_message_at: string | null;
  created_at: string | null;
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

    // Fetch thread-based partners
    const rangeStart = offset;
    const rangeEnd = offset + limit;

    const { data: threadRows, error: threadError } = await client
      .from('dms_threads')
      .select(
        `
          id,
          created_at,
          last_message_at,
          participants:dms_thread_participants!inner (
            user_id
          )
        `
      )
      .eq('is_group', false)
      .eq('participants.user_id', user.id)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range(rangeStart, rangeEnd);

    if (threadError) {
      return res.status(400).json({ ok: false, error: threadError.message });
    }

    const fetchedThreads = threadRows ?? [];
    const threadPartners = fetchedThreads
      .map((row) => {
        const participants = Array.isArray(row.participants) ? row.participants : [];
        const partner = participants
          .map((p) => p?.user_id as string | null)
          .find((pid) => pid && pid !== user.id);

        if (!partner) {
          return null;
        }

        const rawId = row.id;
        const threadId = typeof rawId === 'number' ? rawId : Number(rawId);
        if (!Number.isFinite(threadId)) {
          return null;
        }

        return {
          threadId,
          partnerId: partner,
          created_at: row.created_at ?? null,
          last_message_at: row.last_message_at ?? null,
        };
      })
      .filter((entry): entry is { threadId: number; partnerId: string; created_at: string | null; last_message_at: string | null } => !!entry);

    const hasMoreThreads = fetchedThreads.length > limit;
    const trimmedThreadPartners = threadPartners.slice(0, limit);

    const partnerIds = Array.from(new Set(trimmedThreadPartners.map((entry) => entry.partnerId)));
    const { data: profileRows, error: profileError } = partnerIds.length
      ? await client
        .from('profiles')
        .select('user_id, username, full_name, avatar_url')
        .in('user_id', partnerIds)
      : { data: [], error: null };

    if (profileError) {
      return res.status(400).json({ ok: false, error: profileError.message });
    }

    const profileMap = new Map<string, { username: string | null; full_name: string | null; avatar_url: string | null }>();
    for (const profile of profileRows ?? []) {
      profileMap.set(profile.user_id, {
        username: profile.username ?? null,
        full_name: profile.full_name ?? null,
        avatar_url: profile.avatar_url ?? null,
      });
    }

    const last24hIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const messageCountMap = new Map<number, number>();

    await Promise.all(
      trimmedThreadPartners.map(async ({ threadId }) => {
        const { count, error } = await client
          .from('dms_messages')
          .select('*', { count: 'exact', head: true })
          .eq('thread_id', threadId)
          .is('deleted_at', null)
          .gte('created_at', last24hIso);

        if (!error) {
          messageCountMap.set(threadId, count ?? 0);
        } else {
          messageCountMap.set(threadId, 0);
        }
      })
    );

    const partners: PartnerResponse[] = trimmedThreadPartners.map(({ threadId, partnerId, created_at, last_message_at }) => {
      const profile = profileMap.get(partnerId) ?? { username: null, full_name: null, avatar_url: null };
      return {
        user_id: partnerId,
        username: profile.username,
        full_name: profile.full_name,
        avatar_url: profile.avatar_url,
        thread_id: threadId,
        messages24h: messageCountMap.get(threadId) ?? 0,
        last_message_at,
        created_at,
        source: 'thread',
      };
    });

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
        nextOffset: offset + trimmedThreadPartners.length,
      },
    });
  } catch (err: any) {
    const status = err?.status || 500;
    return res.status(status).json({ ok: false, error: err?.message || 'Internal error' });
  }
}

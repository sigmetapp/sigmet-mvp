'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { RequireAuth } from '@/components/RequireAuth';
import DmsChatWindow from './DmsChatWindow';

export default function DmsPage() {
  return (
    <RequireAuth>
      <DmsInner />
    </RequireAuth>
  );
}

type PartnerListItem = {
  user_id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  thread_id: string | null;
  messages24h: number;
  last_message_at: string | null;
  created_at: string | null;
  source: 'thread' | 'mutual';
};

const PARTNER_CACHE_TTL = 3 * 60 * 1000;
const PARTNER_PAGE_SIZE = 20;

function sortPartners(a: PartnerListItem, b: PartnerListItem): number {
  const hasThreadA = a.thread_id !== null;
  const hasThreadB = b.thread_id !== null;
  if (hasThreadA && !hasThreadB) return -1;
  if (!hasThreadA && hasThreadB) return 1;

  const timeA = a.last_message_at
    ? new Date(a.last_message_at).getTime()
    : a.created_at
      ? new Date(a.created_at).getTime()
      : 0;
  const timeB = b.last_message_at
    ? new Date(b.last_message_at).getTime()
    : b.created_at
      ? new Date(b.created_at).getTime()
      : 0;

  if (timeA !== timeB) {
    return timeB - timeA;
  }

  const nameA = (a.full_name ?? a.username ?? a.user_id).toLowerCase();
  const nameB = (b.full_name ?? b.username ?? b.user_id).toLowerCase();
  return nameA.localeCompare(nameB);
}

function DmsInner() {
  const searchParams = useSearchParams();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [partners, setPartners] = useState<PartnerListItem[]>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paginationState, setPaginationState] = useState({ offset: 0, hasMore: true });

  const paginationRef = useRef({ offset: 0, hasMore: true });
  const partnersRef = useRef<PartnerListItem[]>([]);
  const fetchInFlightRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const AVATAR_FALLBACK =
    "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='100%' height='100%' fill='%23222'/><circle cx='32' cy='24' r='14' fill='%23555'/><rect x='12' y='44' width='40' height='12' rx='6' fill='%23555'/></svg>";

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setCurrentUserId(user?.id ?? null);
    })();
  }, []);

  const persistCache = useCallback(
    (items: PartnerListItem[], pagination: { offset: number; hasMore: boolean }) => {
      if (!currentUserId || typeof window === 'undefined') return;
      const cacheKey = `dm:partners:${currentUserId}`;
      try {
        window.sessionStorage.setItem(
          cacheKey,
          JSON.stringify({
            version: 1,
            timestamp: Date.now(),
            partners: items,
            pagination,
          })
        );
      } catch (err) {
        console.warn('Failed to persist DM partners cache', err);
      }
    },
    [currentUserId]
  );

  useEffect(() => {
    if (!currentUserId || typeof window === 'undefined') {
      setPartners([]);
      partnersRef.current = [];
      const initialPagination = { offset: 0, hasMore: true };
      paginationRef.current = initialPagination;
      setPaginationState(initialPagination);
      return;
    }

    const cacheKey = `dm:partners:${currentUserId}`;
    let hydrated = false;

    try {
      const raw = window.sessionStorage.getItem(cacheKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.partners)) {
          const ttlValid =
            typeof parsed.timestamp === 'number' &&
            Date.now() - parsed.timestamp < PARTNER_CACHE_TTL;
          if (ttlValid) {
            const cachedPartners: PartnerListItem[] = (parsed.partners as PartnerListItem[]).map(
              (item) => ({
                ...item,
                messages24h: item.messages24h ?? 0,
              })
            );
            setPartners(cachedPartners);
            partnersRef.current = cachedPartners;
            const cachedPagination =
              parsed.pagination ?? { offset: cachedPartners.length, hasMore: true };
            paginationRef.current = cachedPagination;
            setPaginationState(cachedPagination);
            setLoadingInitial(false);
            hydrated = true;
          } else {
            window.sessionStorage.removeItem(cacheKey);
          }
        }
      }
    } catch (err) {
      console.warn('Failed to hydrate DM partners cache', err);
    }

    if (!hydrated) {
      setPartners([]);
      partnersRef.current = [];
      const resetPagination = { offset: 0, hasMore: true };
      paginationRef.current = resetPagination;
      setPaginationState(resetPagination);
      setLoadingInitial(true);
    }
  }, [currentUserId]);

  const fetchPartners = useCallback(
    async ({ reset = false }: { reset?: boolean } = {}) => {
      if (!currentUserId) {
        return;
      }
      if (fetchInFlightRef.current) {
        return;
      }

      const { offset, hasMore } = paginationRef.current;
      if (!reset && !hasMore) {
        return;
      }

      fetchInFlightRef.current = true;

      if (reset) {
        if (partnersRef.current.length === 0) {
          setLoadingInitial(true);
        }
      } else {
        setLoadingMore(true);
      }

      try {
        const fetchOffset = reset ? 0 : offset;
        const params = new URLSearchParams({
          limit: String(PARTNER_PAGE_SIZE),
          offset: String(fetchOffset),
        });

        const response = await fetch(`/api/dms/partners.list?${params.toString()}`, {
          headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || 'Failed to load conversations');
        }

        const payload = (await response.json()) as {
          ok: boolean;
          error?: string;
          partners: PartnerListItem[];
          pagination: { hasMore: boolean; nextOffset: number };
        };

        if (!payload.ok) {
          throw new Error(payload.error || 'Failed to load conversations');
        }

        const incoming = (payload.partners ?? []).map((item) => ({
          ...item,
          messages24h: item.messages24h ?? 0,
        }));

        const nextPagination = {
          offset: payload.pagination?.nextOffset ?? fetchOffset + incoming.length,
          hasMore: payload.pagination?.hasMore ?? false,
        };

        paginationRef.current = nextPagination;
        setPaginationState(nextPagination);
        setError(null);

        setPartners((prev) => {
          const baseMap = reset
            ? new Map<string, PartnerListItem>()
            : new Map(prev.map((entry) => [entry.user_id, entry]));
          for (const item of incoming) {
            baseMap.set(item.user_id, item);
          }
          const merged = Array.from(baseMap.values()).sort(sortPartners);
          partnersRef.current = merged;
          persistCache(merged, nextPagination);
          return merged;
        });
      } catch (err: any) {
        console.error('Failed to load DM partners:', err);
        setError(err?.message || 'Failed to load conversations');
      } finally {
        fetchInFlightRef.current = false;
        if (reset) {
          setLoadingInitial(false);
        } else {
          setLoadingMore(false);
        }
      }
    },
    [currentUserId, persistCache]
  );

  useEffect(() => {
    if (!currentUserId) return;
    void fetchPartners({ reset: true });
  }, [currentUserId, fetchPartners]);

  useEffect(() => {
    const partnerIdFromQuery = searchParams.get('partnerId');
    if (!partnerIdFromQuery || !currentUserId) {
      return;
    }

    if (partnersRef.current.some((p) => p.user_id === partnerIdFromQuery)) {
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('user_id, username, full_name, avatar_url')
          .eq('user_id', partnerIdFromQuery)
          .maybeSingle();

        if (!profile || cancelled) {
          return;
        }

        const newPartner: PartnerListItem = {
          user_id: profile.user_id,
          username: profile.username ?? null,
          full_name: profile.full_name ?? null,
          avatar_url: profile.avatar_url ?? null,
          thread_id: null,
          messages24h: 0,
          last_message_at: null,
          created_at: null,
          source: 'mutual',
        };

        setPartners((prev) => {
          const map = new Map(prev.map((entry) => [entry.user_id, entry]));
          map.set(newPartner.user_id, newPartner);
          const merged = Array.from(map.values()).sort(sortPartners);
          partnersRef.current = merged;
          persistCache(merged, paginationRef.current);
          return merged;
        });
      } catch (err) {
        console.warn('Failed to load partner from query parameter', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams, currentUserId, persistCache]);

  useEffect(() => {
    if (partners.length === 0) {
      setSelectedPartnerId(null);
      return;
    }

    const partnerIdFromQuery = searchParams.get('partnerId');
    if (partnerIdFromQuery && partners.some((p) => p.user_id === partnerIdFromQuery)) {
      setSelectedPartnerId(partnerIdFromQuery);
      return;
    }

    setSelectedPartnerId((prev) => {
      if (prev && partners.some((p) => p.user_id === prev)) {
        return prev;
      }
      return partners[0]?.user_id ?? null;
    });
  }, [partners, searchParams]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          void fetchPartners({ reset: false });
        }
      },
      {
        root: null,
        threshold: 1,
      }
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [fetchPartners]);

  const handlePartnerClick = useCallback((partnerId: string) => {
    setSelectedPartnerId(partnerId);
  }, []);

  const handleRefresh = useCallback(() => {
    if (fetchInFlightRef.current) return;
    setError(null);
    const resetPagination = { offset: 0, hasMore: true };
    paginationRef.current = resetPagination;
    setPaginationState(resetPagination);
    void fetchPartners({ reset: true });
  }, [fetchPartners]);

  const showEmptyState = !loadingInitial && partners.length === 0 && !error;

  return (
    <div className="flex flex-col md:flex-row gap-4 h-[calc(100vh-120px)]">
      <div className="w-full md:w-80 flex-shrink-0">
        <div className="card card-glow h-full flex flex-col">
          <div className="px-4 py-3 border-b border-white/10">
            <div className="flex items-center justify-between gap-2">
              <h1 className="text-lg font-semibold text-white">Messages</h1>
              <button
                type="button"
                onClick={handleRefresh}
                disabled={loadingInitial || loadingMore}
                className="text-xs px-3 py-1 rounded-lg bg-white/10 text-white/70 hover:bg-white/15 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Refresh
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto smooth-scroll p-2">
            {loadingInitial && partners.length === 0 ? (
              <div className="text-white/70 text-sm py-4 text-center">Loading conversations...</div>
            ) : error ? (
              <div className="text-center text-sm text-red-300 py-6 space-y-3">
                <div>{error}</div>
                <button
                  type="button"
                  onClick={handleRefresh}
                  className="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-200 border border-red-500/40 hover:bg-red-500/30 transition"
                >
                  Try again
                </button>
              </div>
            ) : showEmptyState ? (
              <div className="text-white/70 text-sm py-8 text-center">
                No conversations yet.
                <br />
                Start a conversation by visiting a user's profile.
              </div>
            ) : (
              <div className="space-y-1">
                {partners.map((partner) => {
                  const name =
                    partner.full_name || partner.username || partner.user_id.slice(0, 8);
                  const avatar = partner.avatar_url || AVATAR_FALLBACK;
                  const isSelected = selectedPartnerId === partner.user_id;
                  const hasMessageBadge = partner.messages24h > 0;
                  const isSuggested = partner.source === 'mutual' && partner.thread_id === null;

                  return (
                    <button
                      key={partner.user_id}
                      onClick={() => handlePartnerClick(partner.user_id)}
                      className={`w-full text-left p-3 rounded-xl flex items-center gap-3 transition ${
                        isSelected
                          ? 'bg-white/10 border border-white/20'
                          : 'hover:bg-white/5 border border-transparent'
                      }`}
                    >
                      <img
                        src={avatar}
                        alt={name}
                        className="h-10 w-10 rounded-full object-cover border border-white/10 flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-white/90 font-medium truncate">{name}</div>
                            {partner.username && (
                              <div className="text-white/60 text-sm truncate">
                                @{partner.username}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {isSuggested && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-medium bg-purple-500/20 text-purple-200 border border-purple-500/30">
                                Suggested
                              </span>
                            )}
                            {hasMessageBadge && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 whitespace-nowrap">
                                <span className="text-xs leading-none" role="img" aria-label="speech">
                                  {'\uD83D\uDCAC'}
                                </span>
                                {partner.messages24h}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
                <div ref={sentinelRef} className="h-1 w-full" />
                {loadingMore && (
                  <div className="text-center text-white/60 text-xs py-2">Loading more...</div>
                )}
                {!paginationState.hasMore && partners.length > 0 && (
                  <div className="text-center text-white/40 text-xs py-2">You're all caught up</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        {selectedPartnerId ? (
          <DmsChatWindow partnerId={selectedPartnerId} />
        ) : (
          <div className="card card-glow h-full flex items-center justify-center">
            <div className="text-white/70 text-center">
              <div className="text-lg mb-2">Select a conversation</div>
              <div className="text-sm">Choose a user from the list to start messaging</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

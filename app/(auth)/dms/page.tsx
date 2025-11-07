'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { RequireAuth } from '@/components/RequireAuth';
import DmsChatWindow from './DmsChatWindow';
import Toast from '@/components/Toast';
import { subscribeToPresence, getPresenceMap } from '@/lib/dm/presence';

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
};

const PARTNER_CACHE_TTL = 3 * 60 * 1000;
const PARTNER_PAGE_SIZE = 20;

function sortPartners(a: PartnerListItem, b: PartnerListItem): number {
  if (a.is_pinned !== b.is_pinned) {
    return a.is_pinned ? -1 : 1;
  }

  if (a.is_pinned && b.is_pinned) {
    const pinA = a.pinned_at ? new Date(a.pinned_at).getTime() : 0;
    const pinB = b.pinned_at ? new Date(b.pinned_at).getTime() : 0;
    if (pinA !== pinB) {
      return pinB - pinA;
    }
  }

  const unreadA = a.unread_count > 0 ? 1 : 0;
  const unreadB = b.unread_count > 0 ? 1 : 0;
  if (unreadA !== unreadB) {
    return unreadB - unreadA;
  }

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

type PartnerLike = Partial<PartnerListItem> & { user_id: string };

function normalizePartner(raw: PartnerLike): PartnerListItem {
  const threadId =
    typeof raw.thread_id === 'string'
      ? raw.thread_id
      : raw.thread_id !== undefined && raw.thread_id !== null
        ? String(raw.thread_id)
        : null;

  const lastMessageId =
    raw.last_message_id !== undefined && raw.last_message_id !== null
      ? String(raw.last_message_id)
      : null;

  const lastReadMessageId =
    raw.last_read_message_id !== undefined && raw.last_read_message_id !== null
      ? String(raw.last_read_message_id)
      : null;

  return {
    user_id: raw.user_id,
    username: raw.username ?? null,
    full_name: raw.full_name ?? null,
    avatar_url: raw.avatar_url ?? null,
    thread_id: threadId,
    messages24h:
      typeof raw.messages24h === 'number'
        ? raw.messages24h
        : raw.messages24h !== undefined
          ? Number(raw.messages24h)
          : 0,
    last_message_at: raw.last_message_at ?? null,
    created_at: raw.created_at ?? null,
    source: raw.source === 'mutual' ? 'mutual' : threadId ? 'thread' : 'mutual',
    last_message_id: lastMessageId,
    last_message_body: raw.last_message_body ?? null,
    last_message_kind: raw.last_message_kind ?? null,
    last_message_sender_id: raw.last_message_sender_id ?? null,
    unread_count:
      typeof raw.unread_count === 'number'
        ? raw.unread_count
        : raw.unread_count !== undefined
          ? Number(raw.unread_count)
          : 0,
    is_pinned: Boolean(raw.is_pinned),
    pinned_at: raw.pinned_at ?? null,
    notifications_muted: Boolean(raw.notifications_muted),
    mute_until: raw.mute_until ?? null,
    last_read_message_id: lastReadMessageId,
    last_read_at: raw.last_read_at ?? null,
  };
}

function getSortTimestamp(partner: PartnerListItem): number {
  if (partner.last_message_at) {
    return new Date(partner.last_message_at).getTime();
  }
  if (partner.created_at) {
    return new Date(partner.created_at).getTime();
  }
  return 0;
}

function formatRelativeTime(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString();
}

function deriveMessagePreview(partner: PartnerListItem, currentUserId: string | null): string {
  const isSystem = partner.last_message_kind === 'system';
  let text = partner.last_message_body ?? '';
  text = text.replace(/\u200B/g, '').trim();

  if (!text) {
    if (isSystem) {
      text = 'System message';
    } else if (partner.last_message_id) {
      text = 'Attachment';
    } else {
      text = partner.thread_id ? 'No messages yet' : 'Start a conversation';
    }
  }

  if (partner.last_message_sender_id && partner.last_message_sender_id === currentUserId) {
    return `You: ${text}`;
  }

  return text;
}

type PresenceStatus = 'online' | 'recent' | 'offline';

function getPresenceStatus(
  partner: PartnerListItem,
  presenceOnlineMap: Record<string, boolean>
): PresenceStatus {
  if (presenceOnlineMap[partner.user_id]) {
    return 'online';
  }

  const reference =
    partner.last_read_at ??
    partner.last_message_at ??
    partner.created_at ??
    partner.pinned_at ??
    null;

  if (!reference) {
    return 'offline';
  }

  const referenceDate = new Date(reference);
  if (Number.isNaN(referenceDate.getTime())) {
    return 'offline';
  }

  const diffMs = Date.now() - referenceDate.getTime();
  if (diffMs <= 60 * 60 * 1000) {
    return 'recent';
  }
  return 'offline';
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
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const [toast, setToast] = useState<{ message: string; type?: 'success' | 'error' | 'info' } | null>(
    null
  );
  const [presenceOnlineMap, setPresenceOnlineMap] = useState<Record<string, boolean>>({});

  const paginationRef = useRef({ offset: 0, hasMore: true });
  const partnersRef = useRef<PartnerListItem[]>([]);
  const fetchInFlightRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const listContainerRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map<string, HTMLDivElement>());

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
              const cachedPartners = (parsed.partners as PartnerLike[]).map((item) =>
                normalizePartner(item)
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

          const incoming = (payload.partners ?? []).map((item) => normalizePartner(item));

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

  const applyPartnerUpdate = useCallback(
    (userId: string, updater: (current: PartnerListItem) => PartnerLike) => {
      setPartners((prev) => {
        let changed = false;
        const updated = prev.map((partner) => {
          if (partner.user_id !== userId) {
            return partner;
          }
          changed = true;
          return normalizePartner(updater(partner));
        });
        if (!changed) {
          return prev;
        }
        const sorted = [...updated].sort(sortPartners);
        partnersRef.current = sorted;
        persistCache(sorted, paginationRef.current);
        return sorted;
      });
    },
    [persistCache]
  );

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

        const newPartner = normalizePartner({
          user_id: profile.user_id,
          username: profile.username ?? null,
          full_name: profile.full_name ?? null,
          avatar_url: profile.avatar_url ?? null,
          thread_id: null,
          messages24h: 0,
          last_message_at: null,
          created_at: null,
          source: 'mutual',
          unread_count: 0,
          is_pinned: false,
          pinned_at: null,
          notifications_muted: false,
          mute_until: null,
          last_read_message_id: null,
          last_read_at: null,
          last_message_id: null,
          last_message_body: null,
          last_message_kind: null,
          last_message_sender_id: null,
        });

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

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void | Promise<void>) | null = null;

    if (presenceWatchList.length === 0) {
      setPresenceOnlineMap({});
      return () => {
        cancelled = true;
        if (unsubscribe) {
          const result = unsubscribe();
          if (result instanceof Promise) void result;
        }
      };
    }

    const subscribe = async () => {
      try {
        unsubscribe = await subscribeToPresence(presenceWatchList, (userId, online) => {
          setPresenceOnlineMap((prev) => {
            if (prev[userId] === online) {
              return prev;
            }
            return { ...prev, [userId]: online };
          });
        });

        await Promise.all(
          presenceWatchList.map(async (userId) => {
            try {
              const presenceState = await getPresenceMap(userId);
              const online = !!presenceState?.[userId]?.[0];
              if (!cancelled) {
                setPresenceOnlineMap((prev) => {
                  if (prev[userId] === online) {
                    return prev;
                  }
                  return { ...prev, [userId]: online };
                });
              }
            } catch (err) {
              console.error('Failed to fetch presence map for user', userId, err);
            }
          })
        );
      } catch (err) {
        console.error('Failed to subscribe to presence updates', err);
      }
    };

    void subscribe();

    return () => {
      cancelled = true;
      if (unsubscribe) {
        const result = unsubscribe();
        if (result instanceof Promise) void result;
      }
    };
  }, [presenceWatchList]);

  useEffect(() => {
    if (presenceWatchList.length === 0) {
      setPresenceOnlineMap({});
      return;
    }
    setPresenceOnlineMap((prev) => {
      const allowed = new Set(presenceWatchList);
      const entries = Object.entries(prev).filter(([userId]) => allowed.has(userId));
      return Object.fromEntries(entries);
    });
  }, [presenceWatchList]);

  const filteredPartners = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) {
      return partners;
    }
    return partners.filter((partner) => {
      const tokens = [
        partner.full_name ?? '',
        partner.username ?? '',
        partner.user_id ?? '',
      ];
      return tokens.some((token) => token.toLowerCase().includes(term));
    });
  }, [partners, searchTerm]);

  const partnerSections = useMemo(() => {
    const pinned: PartnerListItem[] = [];
    const unread: PartnerListItem[] = [];
    const recent: PartnerListItem[] = [];
    const suggested: PartnerListItem[] = [];

    filteredPartners.forEach((partner) => {
      if (partner.is_pinned) {
        pinned.push(partner);
        return;
      }
      if (partner.unread_count > 0 && partner.thread_id) {
        unread.push(partner);
        return;
      }
      if (partner.thread_id) {
        recent.push(partner);
        return;
      }
      suggested.push(partner);
    });

    const sortByRecency = (list: PartnerListItem[]) =>
      [...list].sort((a, b) => getSortTimestamp(b) - getSortTimestamp(a));

    const sortByName = (list: PartnerListItem[]) =>
      [...list].sort((a, b) => {
        const nameA = (a.full_name ?? a.username ?? a.user_id).toLowerCase();
        const nameB = (b.full_name ?? b.username ?? b.user_id).toLowerCase();
        return nameA.localeCompare(nameB);
      });

    const sections: { key: string; label: string; items: PartnerListItem[] }[] = [];

    if (pinned.length > 0) {
      sections.push({
        key: 'pinned',
        label: 'Pinned',
        items: [...pinned].sort((a, b) => {
          const pinA = a.pinned_at ? new Date(a.pinned_at).getTime() : 0;
          const pinB = b.pinned_at ? new Date(b.pinned_at).getTime() : 0;
          if (pinA !== pinB) {
            return pinB - pinA;
          }
          return getSortTimestamp(b) - getSortTimestamp(a);
        }),
      });
    }

    if (unread.length > 0) {
      sections.push({
        key: 'unread',
        label: 'Unread',
        items: sortByRecency(unread),
      });
    }

    if (recent.length > 0) {
      sections.push({
        key: 'recent',
        label: 'Recent',
        items: sortByRecency(recent),
      });
    }

    if (suggested.length > 0) {
      sections.push({
        key: 'suggested',
        label: 'Suggested',
        items: sortByName(suggested),
      });
    }

    return sections;
  }, [filteredPartners]);

  const flatPartners = useMemo(
    () => partnerSections.flatMap((section) => section.items),
    [partnerSections]
  );

  const presenceWatchList = useMemo(() => {
    const unique = new Set<string>();
    for (const partner of flatPartners) {
      unique.add(partner.user_id);
      if (unique.size >= 30) {
        break;
      }
    }
    return Array.from(unique);
  }, [flatPartners]);

  const isSearching = searchTerm.trim().length > 0;
  const hasResults = flatPartners.length > 0;

  const handlePartnerClick = useCallback(
    (partnerId: string) => {
      setSelectedPartnerId(partnerId);
      const index = flatPartners.findIndex((partner) => partner.user_id === partnerId);
      setHighlightedIndex(index);
    },
    [flatPartners]
  );

  useEffect(() => {
    if (flatPartners.length === 0) {
      setHighlightedIndex(-1);
      return;
    }
    if (selectedPartnerId) {
      const idx = flatPartners.findIndex((partner) => partner.user_id === selectedPartnerId);
      if (idx !== -1) {
        setHighlightedIndex(idx);
        return;
      }
    }
    setHighlightedIndex((prev) => {
      if (prev >= 0 && prev < flatPartners.length) {
        return prev;
      }
      return -1;
    });
  }, [flatPartners, selectedPartnerId]);

  useEffect(() => {
    if (highlightedIndex < 0) return;
    const partner = flatPartners[highlightedIndex];
    if (!partner) return;
    const node = rowRefs.current.get(partner.user_id);
    if (node) {
      node.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex, flatPartners]);

  useEffect(() => {
    setHighlightedIndex(-1);
  }, [searchTerm]);

  const moveHighlight = useCallback(
    (delta: number) => {
      setHighlightedIndex((prev) => {
        const total = flatPartners.length;
        if (total === 0) {
          return -1;
        }
        if (prev === -1) {
          return delta > 0 ? 0 : total - 1;
        }
        const next = (prev + delta + total) % total;
        return next;
      });
    },
    [flatPartners]
  );

  const handleListKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.defaultPrevented) return;
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          moveHighlight(1);
          break;
        case 'ArrowUp':
          event.preventDefault();
          moveHighlight(-1);
          break;
        case 'Home':
          event.preventDefault();
          if (flatPartners.length > 0) {
            setHighlightedIndex(0);
          }
          break;
        case 'End':
          event.preventDefault();
          if (flatPartners.length > 0) {
            setHighlightedIndex(flatPartners.length - 1);
          }
          break;
        case 'Enter':
        case ' ':
          if (highlightedIndex >= 0 && highlightedIndex < flatPartners.length) {
            event.preventDefault();
            handlePartnerClick(flatPartners[highlightedIndex].user_id);
          }
          break;
        default:
          break;
      }
    },
    [flatPartners, handlePartnerClick, highlightedIndex, moveHighlight]
  );

  const handleSearchKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveHighlight(1);
        listContainerRef.current?.focus();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveHighlight(-1);
        listContainerRef.current?.focus();
      }
    },
    [moveHighlight]
  );

  const handleRefresh = useCallback(() => {
    if (fetchInFlightRef.current) return;
    setError(null);
    const resetPagination = { offset: 0, hasMore: true };
    paginationRef.current = resetPagination;
    setPaginationState(resetPagination);
    void fetchPartners({ reset: true });
  }, [fetchPartners]);

  const handleTogglePin = useCallback(
    async (partner: PartnerListItem) => {
      if (!partner.thread_id) return;
      const nextPinned = !partner.is_pinned;
      setError(null);
      try {
        const response = await fetch('/api/dms/thread.pin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            thread_id: partner.thread_id,
            pinned: nextPinned,
          }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || 'Failed to update pin state');
        }
        const payload = await response.json().catch(() => ({}));
        const pinnedAt =
          nextPinned && typeof payload?.pinned_at === 'string'
            ? payload.pinned_at
            : nextPinned
              ? new Date().toISOString()
              : null;

        applyPartnerUpdate(partner.user_id, (current) => ({
          ...current,
          is_pinned: nextPinned,
          pinned_at: pinnedAt,
        }));
        setToast({
          message: nextPinned ? 'Conversation pinned' : 'Conversation unpinned',
          type: 'success',
        });
      } catch (err: any) {
        console.error('Failed to toggle pin state', err);
        setError(err?.message || 'Failed to update conversation');
        setToast({
          message: err?.message || 'Failed to update conversation',
          type: 'error',
        });
      }
    },
    [applyPartnerUpdate]
  );

  const handleToggleMute = useCallback(
    async (partner: PartnerListItem) => {
      if (!partner.thread_id) return;
      const nextMuted = !partner.notifications_muted;
      setError(null);
      try {
        const response = await fetch('/api/dms/thread.mute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            thread_id: partner.thread_id,
            muted: nextMuted,
          }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || 'Failed to update mute state');
        }
        const payload = await response.json().catch(() => ({}));
        const muteUntil =
          nextMuted && typeof payload?.mute_until === 'string'
            ? payload.mute_until
            : null;

        applyPartnerUpdate(partner.user_id, (current) => ({
          ...current,
          notifications_muted: nextMuted,
          mute_until: muteUntil,
        }));
        setToast({
          message: nextMuted ? 'Conversation muted' : 'Conversation unmuted',
          type: 'info',
        });
      } catch (err: any) {
        console.error('Failed to toggle mute state', err);
        setError(err?.message || 'Failed to update conversation');
        setToast({
          message: err?.message || 'Failed to update conversation',
          type: 'error',
        });
      }
    },
    [applyPartnerUpdate]
  );

  const handleMarkAsRead = useCallback(
    async (partner: PartnerListItem) => {
      if (!partner.thread_id || !partner.last_message_id) return;
      const upToId = Number(partner.last_message_id);
      if (!Number.isFinite(upToId)) return;
      setError(null);
      try {
        const response = await fetch('/api/dms/messages.read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            thread_id: partner.thread_id,
            up_to_message_id: upToId,
          }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || 'Failed to mark messages as read');
        }
        const payload = await response.json().catch(() => ({}));
        const lastReadId =
          payload?.last_read_message_id !== undefined
            ? String(payload.last_read_message_id)
            : String(upToId);

        applyPartnerUpdate(partner.user_id, (current) => ({
          ...current,
          unread_count: 0,
          last_read_message_id: lastReadId,
          last_read_at: new Date().toISOString(),
        }));
        setToast({
          message: 'All messages marked as read',
          type: 'success',
        });
      } catch (err: any) {
        console.error('Failed to mark conversation as read', err);
        setError(err?.message || 'Failed to mark conversation as read');
        setToast({
          message: err?.message || 'Failed to mark conversation as read',
          type: 'error',
        });
      }
    },
    [applyPartnerUpdate]
  );

  const showEmptyState =
    !loadingInitial && !error && !hasResults && !isSearching && partners.length === 0;
  const highlightedPartnerId =
    highlightedIndex >= 0 && highlightedIndex < flatPartners.length
      ? flatPartners[highlightedIndex].user_id
      : null;

  return (
    <div className="flex flex-col md:flex-row gap-4 h-[calc(100vh-120px)]">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
          duration={2500}
        />
      )}
      <div className="w-full md:w-80 flex-shrink-0">
          <div className="card card-glow h-full flex flex-col">
            <div className="px-4 py-4 border-b border-white/10 space-y-3">
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
              <div className="relative">
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Search by name or username"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-white/20 focus:outline-none focus:ring-2 focus:ring-white/20"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-white/50 hover:text-white/80"
                    aria-label="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
            <div
              ref={listContainerRef}
              tabIndex={-1}
              onKeyDown={handleListKeyDown}
              className="flex-1 overflow-y-auto smooth-scroll p-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
            >
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
              ) : !hasResults && isSearching ? (
                <div className="text-white/60 text-sm py-6 text-center">
                  No matches found for{' '}
                  <span className="font-semibold text-white">“{searchTerm.trim()}”</span>
                </div>
              ) : (
                <div className="space-y-4">
                  {partnerSections.map((section) => (
                    <div key={section.key}>
                      <div className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-white/40">
                        {section.label}
                      </div>
                      <div className="space-y-1">
                        {section.items.map((partner) => {
                          const name =
                            partner.full_name || partner.username || partner.user_id.slice(0, 8);
                          const avatar = partner.avatar_url || AVATAR_FALLBACK;
                          const isSelected = selectedPartnerId === partner.user_id;
                          const isHighlighted = highlightedPartnerId === partner.user_id;
                          const preview = deriveMessagePreview(partner, currentUserId);
                          const timestampLabel = formatRelativeTime(
                            partner.last_message_at ?? partner.created_at
                          );
                          const presenceStatus = getPresenceStatus(partner, presenceOnlineMap);
                          const presenceClasses =
                            presenceStatus === 'online'
                              ? 'bg-emerald-400'
                              : presenceStatus === 'recent'
                                ? 'bg-amber-400'
                                : 'bg-white/30';
                          const presenceLabel =
                            presenceStatus === 'online'
                              ? 'Online'
                              : presenceStatus === 'recent'
                                ? 'Recently active'
                                : 'Offline';

                          return (
                              <div
                                key={partner.user_id}
                                ref={(node) => {
                                  if (node) {
                                    rowRefs.current.set(partner.user_id, node);
                                  } else {
                                    rowRefs.current.delete(partner.user_id);
                                  }
                                }}
                                role="button"
                                tabIndex={0}
                                aria-selected={isSelected}
                                onClick={() => handlePartnerClick(partner.user_id)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    handlePartnerClick(partner.user_id);
                                  }
                                }}
                                onMouseEnter={() => {
                                  const idx = flatPartners.findIndex(
                                    (item) => item.user_id === partner.user_id
                                  );
                                  if (idx !== -1) {
                                    setHighlightedIndex(idx);
                                  }
                                }}
                                className={[
                                  'group relative flex gap-3 rounded-xl border px-3 py-2 transition cursor-pointer',
                                  partner.notifications_muted ? 'opacity-80' : '',
                                  isSelected
                                    ? 'bg-white/10 border-white/20'
                                    : 'border-transparent hover:bg-white/5',
                                  isHighlighted ? 'ring-1 ring-white/30' : '',
                                ]
                                  .filter(Boolean)
                                  .join(' ')}
                              >
                              <img
                                src={avatar}
                                alt={name}
                                className="mt-0.5 h-10 w-10 flex-shrink-0 rounded-full border border-white/10 object-cover"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <div className="text-sm font-medium text-white truncate">
                                        {name}
                                      </div>
                                      <span
                                        className="flex items-center gap-1 text-[11px] text-white/50"
                                        title={presenceLabel}
                                      >
                                        <span
                                          className={`h-2 w-2 rounded-full ${presenceClasses}`}
                                          aria-hidden="true"
                                        />
                                        <span>{presenceStatus === 'online' ? 'Online' : presenceStatus === 'recent' ? 'Active' : 'Offline'}</span>
                                      </span>
                                    </div>
                                    <div className="text-xs text-white/55 truncate">{preview}</div>
                                    <div className="mt-1 flex flex-wrap gap-2">
                                      {partner.unread_count > 0 && (
                                        <span className="inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-cyan-500/20 px-2 py-0.5 text-xs font-semibold text-cyan-200 border border-cyan-500/40">
                                          {partner.unread_count}
                                        </span>
                                      )}
                                      {partner.is_pinned && (
                                        <span className="inline-flex items-center rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-medium text-amber-200 border border-amber-500/40">
                                          Pinned
                                        </span>
                                      )}
                                      {partner.source === 'mutual' && !partner.thread_id && (
                                        <span className="inline-flex items-center rounded-full bg-purple-500/20 px-2 py-0.5 text-[11px] font-medium text-purple-200 border border-purple-500/30">
                                          Suggested
                                        </span>
                                      )}
                                      {partner.notifications_muted && (
                                        <span className="inline-flex items-center rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium text-white/50 border border-white/20">
                                          Muted
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex flex-col items-end gap-1">
                                    {timestampLabel && (
                                      <div className="text-xs text-white/40">{timestampLabel}</div>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 opacity-0 transition group-hover:opacity-100">
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void handleTogglePin(partner);
                                  }}
                                  className="rounded-md bg-white/10 px-2 py-1 text-[11px] text-white/70 hover:bg-white/15"
                                >
                                  {partner.is_pinned ? 'Unpin' : 'Pin'}
                                </button>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void handleToggleMute(partner);
                                  }}
                                  className="rounded-md bg-white/10 px-2 py-1 text-[11px] text-white/70 hover:bg-white/15"
                                >
                                  {partner.notifications_muted ? 'Unmute' : 'Mute'}
                                </button>
                                {partner.unread_count > 0 && partner.last_message_id && (
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void handleMarkAsRead(partner);
                                    }}
                                    className="rounded-md bg-white/10 px-2 py-1 text-[11px] text-white/70 hover:bg-white/15"
                                  >
                                    Mark read
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  <div ref={sentinelRef} className="h-1 w-full" />
                  {loadingMore && (
                    <div className="text-center text-white/60 text-xs py-2">Loading more...</div>
                  )}
                  {!loadingMore && !paginationState.hasMore && partners.length > 0 && (
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

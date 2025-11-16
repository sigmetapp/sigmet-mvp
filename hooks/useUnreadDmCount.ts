'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';

/**
 * Hook to track total unread DM count across all conversations
 */
type PartnerSummary = {
  thread_id?: string | null;
  unread_count?: number | null;
  last_message_id?: string | number | null;
  last_read_message_id?: string | number | null;
  last_message_at?: string | null;
  last_read_at?: string | null;
};

function normalizeId(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '';
  }
  const trimmed = value.trim();
  return trimmed;
}

function shouldIgnoreUnread(partner: PartnerSummary): boolean {
  const lastMessageId = normalizeId(partner.last_message_id);
  const lastReadId = normalizeId(partner.last_read_message_id);
  if (lastMessageId && lastReadId && lastMessageId === lastReadId) {
    return true;
  }

  if (partner.last_message_at && partner.last_read_at) {
    const lastMessageTime = Date.parse(partner.last_message_at);
    const lastReadTime = Date.parse(partner.last_read_at);
    if (!Number.isNaN(lastMessageTime) && !Number.isNaN(lastReadTime) && lastReadTime >= lastMessageTime) {
      return true;
    }
  }

  return false;
}

function computeUnreadTotal(partners: PartnerSummary[]): number {
  if (!Array.isArray(partners) || partners.length === 0) {
    return 0;
  }
  return partners.reduce((acc, partner) => {
    if (!partner?.thread_id) {
      return acc;
    }
    const raw = partner.unread_count;
    const numeric =
      typeof raw === 'number'
        ? raw
        : raw !== null && raw !== undefined
          ? Number(raw)
          : 0;
      if (!Number.isFinite(numeric) || numeric <= 0) {
      return acc;
    }
      if (shouldIgnoreUnread(partner)) {
        console.warn('[useUnreadDmCount] Ignoring phantom unread for thread', partner.thread_id, 'last_message_id=', partner.last_message_id, 'last_read_message_id=', partner.last_read_message_id);
        return acc;
      }
      return acc + numeric;
  }, 0);
}

export function useUnreadDmCount() {
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const lastRealtimeTriggerRef = useRef(0);

  // Get current user
  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setCurrentUserId(user?.id || null);
    })();
  }, []);

  // Fetch initial unread count
  useEffect(() => {
    if (!currentUserId) {
      setUnreadCount(0);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    let eventTimeout: NodeJS.Timeout | null = null;

    const fetchUnreadCount = async () => {
      try {
        const response = await fetch('/api/dms/partners.list?limit=100&offset=0');
        if (!response.ok) {
          throw new Error('Failed to fetch partners');
        }

        const data = await response.json();
        if (!data.ok || !Array.isArray(data.partners)) {
          throw new Error('Invalid response');
        }

        if (cancelled) return;

        // Sum up all unread counts
        const total = computeUnreadTotal(data.partners);

        console.log('[useUnreadDmCount] Total unread:', total, 'Partners:', data.partners.length);
        data.partners.forEach((p: any) => {
          console.log('[useUnreadDmCount] Partner:', p.user_id, 'unread:', p.unread_count, 'last_read_at:', p.last_read_at, 'last_read_message_id:', p.last_read_message_id);
        });

        setUnreadCount(total);
        setIsLoading(false);
      } catch (err) {
        console.error('Error fetching unread count:', err);
        if (!cancelled) {
          setUnreadCount(0);
          setIsLoading(false);
        }
      }
    };

      void fetchUnreadCount();

      // Listen for custom events from DmGlobalNotifications
      const scheduleThrottledFetch = () => {
        const now = Date.now();
        if (now - lastRealtimeTriggerRef.current < 300) {
          return;
        }
        lastRealtimeTriggerRef.current = now;
        if (eventTimeout) {
          clearTimeout(eventTimeout);
        }
        eventTimeout = setTimeout(() => {
          void fetchUnreadCount();
        }, 120);
      };

      const handleNewMessage = () => {
        scheduleThrottledFetch();
      };

      const handleMessageRead = () => {
        scheduleThrottledFetch();
      };

      window.addEventListener('dm:new-message', handleNewMessage);
      window.addEventListener('dm:message-read', handleMessageRead);

      return () => {
        cancelled = true;
        window.removeEventListener('dm:new-message', handleNewMessage);
        window.removeEventListener('dm:message-read', handleMessageRead);
        if (eventTimeout) {
          clearTimeout(eventTimeout);
        }
      };
  }, [currentUserId]);

  // Subscribe to realtime updates for unread count changes
  useEffect(() => {
    if (!currentUserId) return;

      let timeoutId: NodeJS.Timeout | null = null;

    // Subscribe to changes in dms_thread_participants to detect when messages are read
    const channel = supabase
      .channel(`unread_dm_count:${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'dms_thread_participants',
          filter: `user_id=eq.${currentUserId}`,
        },
          () => {
            const now = Date.now();
            if (now - lastRealtimeTriggerRef.current < 300) {
              return;
            }
            lastRealtimeTriggerRef.current = now;
            if (timeoutId) {
              clearTimeout(timeoutId);
            }
            timeoutId = setTimeout(() => {
              const fetchUnreadCount = async () => {
                try {
                  const response = await fetch('/api/dms/partners.list?limit=100&offset=0');
                  if (!response.ok) return;

                  const data = await response.json();
                  if (!data.ok || !Array.isArray(data.partners)) return;

                  const total = computeUnreadTotal(data.partners);

                  setUnreadCount(total);
                } catch (err) {
                  console.error('Error fetching unread count:', err);
                }
              };

              void fetchUnreadCount();
            }, 120);
        }
      )
      .subscribe();

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      void supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  // Expose refresh function for manual updates
  const refresh = () => {
    if (!currentUserId) return;
    const fetchUnreadCount = async () => {
      try {
        const response = await fetch('/api/dms/partners.list?limit=100&offset=0');
        if (!response.ok) {
          throw new Error('Failed to fetch partners');
        }

        const data = await response.json();
        if (!data.ok || !Array.isArray(data.partners)) {
          throw new Error('Invalid response');
        }

        const total = computeUnreadTotal(data.partners);

        console.log('[useUnreadDmCount] Manual refresh - Total unread:', total);
        setUnreadCount(total);
      } catch (err) {
        console.error('Error fetching unread count:', err);
      }
    };
    void fetchUnreadCount();
  };

  return { unreadCount, isLoading, refresh };
}

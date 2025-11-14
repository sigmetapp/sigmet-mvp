'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';

/**
 * Hook to track total unread notification count
 */
export function useUnreadNotificationCount() {
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const latestFetchController = useRef<AbortController | null>(null);

  const fetchUnreadCount = useRef<() => Promise<void>>();

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

    const performFetch = async () => {
      if (latestFetchController.current) {
        latestFetchController.current.abort();
      }
      const controller = new AbortController();
      latestFetchController.current = controller;

      try {
        const response = await fetch('/api/notifications/list?limit=1&offset=0', {
          signal: controller.signal,
        });
        if (!response.ok) {
          if (response.status === 401) {
            setUnreadCount(0);
            setIsLoading(false);
            return;
          }
          throw new Error('Failed to fetch notifications');
        }

        const data = await response.json();
        if (cancelled) return;

        const count = data.unreadCount || 0;
        setUnreadCount(count);
        setIsLoading(false);
      } catch (err) {
        if ((err as any)?.name === 'AbortError') {
          return;
        }
        console.error('Error fetching unread notification count:', err);
        if (!cancelled) {
          setUnreadCount((prev) => prev);
          setIsLoading(false);
        }
      }
    };

    fetchUnreadCount.current = performFetch;

    void performFetch();

    const POLL_INTERVAL = 7000;
    pollIntervalRef.current = setInterval(() => {
      void performFetch();
    }, POLL_INTERVAL);

    const handleNotificationUpdate = () => {
      setTimeout(() => {
        void performFetch();
      }, 200);
    };

    window.addEventListener('notification:update', handleNotificationUpdate);
    window.addEventListener('notification:read', handleNotificationUpdate);

    return () => {
      cancelled = true;
      window.removeEventListener('notification:update', handleNotificationUpdate);
      window.removeEventListener('notification:read', handleNotificationUpdate);
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      if (latestFetchController.current) {
        latestFetchController.current.abort();
        latestFetchController.current = null;
      }
    };
  }, [currentUserId]);

  // Subscribe to realtime updates for unread count changes
  useEffect(() => {
    if (!currentUserId) return;

    let timeoutId: NodeJS.Timeout | null = null;

    // Subscribe to changes in notifications table
      const channel = supabase
        .channel(`unread_notification_count:${currentUserId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${currentUserId}`,
          },
          () => {
            if (timeoutId) {
              clearTimeout(timeoutId);
            }
            timeoutId = setTimeout(() => {
              if (fetchUnreadCount.current) {
                void fetchUnreadCount.current();
              }
            }, 250);
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
      if (fetchUnreadCount.current) {
        void fetchUnreadCount.current();
      }
    };

  return { unreadCount, isLoading, refresh };
}

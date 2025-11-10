'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

/**
 * Hook to track total unread notification count
 */
export function useUnreadNotificationCount() {
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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

    const fetchUnreadCount = async () => {
      try {
        const response = await fetch('/api/notifications/list?limit=1&offset=0');
        if (!response.ok) {
          if (response.status === 401) {
            // Not authenticated
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
        console.error('Error fetching unread notification count:', err);
        if (!cancelled) {
          setUnreadCount(0);
          setIsLoading(false);
        }
      }
    };

    void fetchUnreadCount();

    // Listen for custom events for notification updates
    const handleNotificationUpdate = () => {
      // Small delay to ensure database is updated
      setTimeout(() => {
        void fetchUnreadCount();
      }, 100);
    };

    window.addEventListener('notification:update', handleNotificationUpdate);
    window.addEventListener('notification:read', handleNotificationUpdate);

    return () => {
      cancelled = true;
      window.removeEventListener('notification:update', handleNotificationUpdate);
      window.removeEventListener('notification:read', handleNotificationUpdate);
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
          // Debounce refetch to avoid too many requests
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
          timeoutId = setTimeout(() => {
            const fetchUnreadCount = async () => {
              try {
                const response = await fetch('/api/notifications/list?limit=1&offset=0');
                if (!response.ok) return;

                const data = await response.json();
                const count = data.unreadCount || 0;
                setUnreadCount(count);
              } catch (err) {
                console.error('Error fetching unread notification count:', err);
              }
            };

            void fetchUnreadCount();
          }, 300);
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
        const response = await fetch('/api/notifications/list?limit=1&offset=0');
        if (!response.ok) {
          throw new Error('Failed to fetch notifications');
        }

        const data = await response.json();
        const count = data.unreadCount || 0;
        setUnreadCount(count);
      } catch (err) {
        console.error('Error fetching unread notification count:', err);
      }
    };
    void fetchUnreadCount();
  };

  return { unreadCount, isLoading, refresh };
}

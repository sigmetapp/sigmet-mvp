'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

/**
 * Hook to track total unread DM count across all conversations
 */
export function useUnreadDmCount() {
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
        const total = data.partners.reduce((sum: number, partner: { unread_count?: number }) => {
          const count = typeof partner.unread_count === 'number' ? partner.unread_count : 0;
          return sum + count;
        }, 0);

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
    const handleNewMessage = () => {
      void fetchUnreadCount();
    };

    const handleMessageRead = () => {
      void fetchUnreadCount();
    };

    window.addEventListener('dm:new-message', handleNewMessage);
    window.addEventListener('dm:message-read', handleMessageRead);

    return () => {
      cancelled = true;
      window.removeEventListener('dm:new-message', handleNewMessage);
      window.removeEventListener('dm:message-read', handleMessageRead);
    };
  }, [currentUserId]);

  // Subscribe to realtime updates for unread count changes
  useEffect(() => {
    if (!currentUserId) return;

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
          // Refetch unread count when participant data changes (e.g., last_read_message_id)
          const fetchUnreadCount = async () => {
            try {
              const response = await fetch('/api/dms/partners.list?limit=100&offset=0');
              if (!response.ok) return;

              const data = await response.json();
              if (!data.ok || !Array.isArray(data.partners)) return;

              const total = data.partners.reduce((sum: number, partner: { unread_count?: number }) => {
                const count = typeof partner.unread_count === 'number' ? partner.unread_count : 0;
                return sum + count;
              }, 0);

              setUnreadCount(total);
            } catch (err) {
              console.error('Error fetching unread count:', err);
            }
          };

          void fetchUnreadCount();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  return { unreadCount, isLoading };
}

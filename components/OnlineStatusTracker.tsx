'use client';

import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { setPresenceStatus } from '@/lib/dm/presence';

/**
 * Updates user's last_activity_at timestamp in the database
 */
async function updateUserActivity(userId: string): Promise<void> {
  try {
    const { error } = await supabase.rpc('update_user_activity', {
      p_user_id: userId,
    });
    if (error) {
      console.error('[OnlineStatusTracker] Error updating user activity:', error);
    }
  } catch (error) {
    console.error('[OnlineStatusTracker] Error updating user activity:', error);
  }
}

/**
 * Component that tracks the current user's online status
 * Sets user as online when component mounts, and offline when unmounts
 * Updates last_activity_at on any activity (login, click, scroll, etc.)
 */
export default function OnlineStatusTracker() {
  const activityTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityUpdateRef = useRef<number>(0);
  const ACTIVITY_UPDATE_THROTTLE = 10000; // Update max once per 10 seconds to avoid spam

  useEffect(() => {
    let mounted = true;
    let userId: string | null = null;
    let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

    // Throttled function to update activity
    const updateActivity = async () => {
      if (!userId || !mounted) return;
      const now = Date.now();
      if (now - lastActivityUpdateRef.current < ACTIVITY_UPDATE_THROTTLE) {
        return; // Throttle updates
      }
      lastActivityUpdateRef.current = now;
      await updateUserActivity(userId);
    };

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !mounted) return;
      
      userId = user.id;
      
      // Set user as online and update activity on login
      try {
        await setPresenceStatus(user.id, true);
        await updateUserActivity(user.id);
      } catch (error) {
        console.error('[OnlineStatusTracker] Error setting user as online:', error);
      }
      
      // Send heartbeat every 30 seconds to keep presence active
      heartbeatInterval = setInterval(async () => {
        if (mounted && userId) {
          try {
            await setPresenceStatus(userId, true);
            await updateActivity();
          } catch (error) {
            console.error('[OnlineStatusTracker] Error sending heartbeat:', error);
          }
        }
      }, 30000);
    })();

    // Track user activity on various events
    const handleActivity = () => {
      if (activityTimeoutRef.current) {
        clearTimeout(activityTimeoutRef.current);
      }
      activityTimeoutRef.current = setTimeout(() => {
        updateActivity();
      }, 1000); // Debounce: update 1 second after last activity
    };

    // Handle visibility change (tab switch, minimize, etc.)
    const handleVisibilityChange = async () => {
      if (!mounted || !userId) return;
      
      if (document.hidden) {
        // Tab is hidden - could set offline, but we'll keep online for now
        // In a production app, you might want to set offline after a delay
      } else {
        // Tab is visible again - ensure we're online and update activity
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        if (currentUser && mounted) {
          await setPresenceStatus(currentUser.id, true);
          await updateActivity();
          userId = currentUser.id;
        }
      }
    };

    // Track various user activities
    const events = ['click', 'keydown', 'scroll', 'mousemove', 'touchstart'];
    events.forEach(event => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Handle page unload
    const handleBeforeUnload = () => {
      if (userId) {
        setPresenceStatus(userId, false).catch(() => {
          // Ignore errors on unload
        });
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    // Cleanup function
    return () => {
      mounted = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      
      events.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });
      
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }
      
      if (activityTimeoutRef.current) {
        clearTimeout(activityTimeoutRef.current);
      }
      
      // Set offline when component unmounts
      if (userId) {
        setPresenceStatus(userId, false).catch(() => {
          // Ignore errors during cleanup
        });
      }
    };
  }, []);

  return null;
}

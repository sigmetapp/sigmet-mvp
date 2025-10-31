'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { setOnline } from '@/lib/dm/presence';

/**
 * Component that tracks the current user's online status
 * Sets user as online when component mounts, and offline when unmounts
 */
export default function OnlineStatusTracker() {
  useEffect(() => {
    let mounted = true;
    let userId: string | null = null;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !mounted) {
        console.log('[OnlineStatusTracker] No user or not mounted');
        return;
      }
      
      userId = user.id;
      console.log('[OnlineStatusTracker] Setting user as online:', userId);
      
      // Set user as online
      try {
        await setOnline(user.id, true);
        console.log('[OnlineStatusTracker] Successfully set user as online');
      } catch (error) {
        console.error('[OnlineStatusTracker] Error setting user as online:', error);
      }
    })();

    // Handle visibility change (tab switch, minimize, etc.)
    const handleVisibilityChange = async () => {
      if (!mounted || !userId) return;
      if (document.hidden) {
        // Tab is hidden - you could set offline here, but we'll keep online
        // await setOnline(userId, false);
      } else {
        // Tab is visible again
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        if (currentUser && mounted) {
          await setOnline(currentUser.id, true);
          userId = currentUser.id;
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Handle page unload
    const handleBeforeUnload = () => {
      if (userId) {
        setOnline(userId, false).catch(() => {
          // Ignore errors on unload
        });
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    // Periodically update activity (every 2 minutes) to keep user marked as active
    // This ensures that users who keep the tab open are considered online
    const activityInterval = setInterval(async () => {
      if (!mounted || !userId) return;
      
      try {
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        if (currentUser && mounted && currentUser.id === userId) {
          await setOnline(currentUser.id, true);
          console.log('[OnlineStatusTracker] Periodic activity update');
        }
      } catch (error) {
        console.error('[OnlineStatusTracker] Error in periodic activity update:', error);
      }
    }, 120000); // Update every 2 minutes

    // Also update activity on user interactions (clicks, keypresses, scroll)
    // This provides more responsive activity tracking
    const updateActivity = async () => {
      if (!mounted || !userId) return;
      
      try {
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        if (currentUser && mounted && currentUser.id === userId) {
          await setOnline(currentUser.id, true);
        }
      } catch (error) {
        // Silently fail - don't spam console on every interaction
      }
    };

    // Throttle activity updates to at most once per minute
    let lastActivityUpdate = 0;
    const throttledUpdateActivity = () => {
      const now = Date.now();
      if (now - lastActivityUpdate > 60000) { // 1 minute
        lastActivityUpdate = now;
        updateActivity();
      }
    };

    document.addEventListener('click', throttledUpdateActivity, { passive: true });
    document.addEventListener('keydown', throttledUpdateActivity, { passive: true });
    document.addEventListener('scroll', throttledUpdateActivity, { passive: true });

    // Cleanup function
    return () => {
      mounted = false;
      clearInterval(activityInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('click', throttledUpdateActivity);
      document.removeEventListener('keydown', throttledUpdateActivity);
      document.removeEventListener('scroll', throttledUpdateActivity);
      
      // Set offline when component unmounts
      if (userId) {
        setOnline(userId, false).catch(() => {
          // Ignore errors during cleanup
        });
      }
    };
  }, []);

  return null;
}

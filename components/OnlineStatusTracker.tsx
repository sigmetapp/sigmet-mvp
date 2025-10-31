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

    // Cleanup function
    return () => {
      mounted = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      
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

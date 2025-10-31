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
      if (!user || !mounted) return;
      
      userId = user.id;
      
      // Set user as online
      await setOnline(user.id, true);
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

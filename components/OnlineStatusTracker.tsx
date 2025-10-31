'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { setPresenceStatus } from '@/lib/dm/presence';

/**
 * Component that tracks the current user's online status
 * Sets user as online when component mounts, and offline when unmounts
 */
export default function OnlineStatusTracker() {
  useEffect(() => {
    let mounted = true;
    let userId: string | null = null;
    let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !mounted) return;
      
      userId = user.id;
      
      // Set user as online
      try {
        await setPresenceStatus(user.id, true);
      } catch (error) {
        console.error('[OnlineStatusTracker] Error setting user as online:', error);
      }
      
      // Send heartbeat every 30 seconds to keep presence active
      heartbeatInterval = setInterval(async () => {
        if (mounted && userId) {
          try {
            await setPresenceStatus(userId, true);
          } catch (error) {
            console.error('[OnlineStatusTracker] Error sending heartbeat:', error);
          }
        }
      }, 30000);
    })();

    // Handle visibility change (tab switch, minimize, etc.)
    const handleVisibilityChange = async () => {
      if (!mounted || !userId) return;
      
      if (document.hidden) {
        // Tab is hidden - could set offline, but we'll keep online for now
        // In a production app, you might want to set offline after a delay
      } else {
        // Tab is visible again - ensure we're online
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        if (currentUser && mounted) {
          await setPresenceStatus(currentUser.id, true);
          userId = currentUser.id;
        }
      }
    };

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
      
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
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

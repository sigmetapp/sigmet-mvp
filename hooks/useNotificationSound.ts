'use client';

import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';

/**
 * Hook to play sound notification when a new notification arrives
 */
export function useNotificationSound() {
  const lastNotificationIdRef = useRef<number | null>(null);
  const isPageVisibleRef = useRef(true);

  // Initialize audio element
  useEffect(() => {
    let audioContext: AudioContext | null = null;
    let channel: any = null;
    let isInitialized = false;

    // Create audio element with a simple notification sound
    // Using Web Audio API to generate a simple beep sound
    const initAudioContext = () => {
      try {
        audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      } catch (err) {
        console.warn('Failed to initialize audio context:', err);
      }
    };
    
    // Function to play a beep sound
    const playBeep = () => {
      if (!audioContext) {
        initAudioContext();
        if (!audioContext) return;
      }

      try {
        // Resume audio context if it's suspended (browser autoplay policy)
        if (audioContext.state === 'suspended') {
          audioContext.resume().catch(console.warn);
        }

        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 800; // Frequency in Hz
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.3);
      } catch (err) {
        console.warn('Failed to play notification sound:', err);
      }
    };

    // Check if page is visible
    const handleVisibilityChange = () => {
      isPageVisibleRef.current = !document.hidden;
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Subscribe to realtime updates for new notifications
    const setupRealtime = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      // Initialize audio context on user interaction (to comply with browser autoplay policy)
      initAudioContext();

      // Wait a bit before initializing to avoid playing sound on page load
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Get the latest notification ID to avoid playing sound on initial load
      const { data: latestNotification } = await supabase
        .from('notifications')
        .select('id, created_at')
        .eq('user_id', user.id)
        .eq('hidden', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (latestNotification) {
        lastNotificationIdRef.current = latestNotification.id;
      }

      isInitialized = true;

      const notificationChannel = supabase
        .channel(`notification_sound:${user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            // Only play sound if:
            // 1. Hook is initialized (avoid playing on page load)
            // 2. Page is visible (user is on the site)
            // 3. This is a new notification (not the initial one we loaded)
            // 4. Notification is not hidden
            if (
              isInitialized &&
              isPageVisibleRef.current &&
              payload.new &&
              (payload.new as any).hidden === false &&
              lastNotificationIdRef.current !== null &&
              (payload.new as any).id !== lastNotificationIdRef.current
            ) {
              playBeep();
              lastNotificationIdRef.current = (payload.new as any).id;
            } else if (
              isInitialized &&
              isPageVisibleRef.current &&
              payload.new &&
              (payload.new as any).hidden === false &&
              lastNotificationIdRef.current === null
            ) {
              // First notification after initialization - don't play sound
              lastNotificationIdRef.current = (payload.new as any).id;
            }
          }
        )
        .subscribe();

      return notificationChannel;
    };

    setupRealtime().then((ch) => {
      channel = ch;
    });

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (channel) {
        supabase.removeChannel(channel);
      }
      if (audioContext && audioContext.state !== 'closed') {
        audioContext.close().catch(console.warn);
      }
    };
  }, []);
}

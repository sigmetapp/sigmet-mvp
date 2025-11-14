'use client';

import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';

/**
 * Hook to play sound notification when a new notification arrives
 */
export function useNotificationSound() {
  const lastNotificationIdRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const initializingRef = useRef(false);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    const ensureAudioContext = async () => {
      if (typeof window === 'undefined') return false;
      if (!audioContextRef.current) {
        try {
          const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
          if (!AudioCtx) {
            console.warn('Web Audio API is not supported in this browser.');
            return false;
          }
          audioContextRef.current = new AudioCtx();
        } catch (err) {
          console.warn('Failed to initialize audio context:', err);
          return false;
        }
      }

      const context = audioContextRef.current;
      if (!context) return false;

      if (context.state === 'suspended') {
        try {
          await context.resume();
        } catch (err) {
          console.warn('Failed to resume audio context:', err);
          return false;
        }
      }

      return true;
    };

    const unlockAudioContext = () => {
      ensureAudioContext()
        .then((ready) => {
          if (ready) {
            document.removeEventListener('pointerdown', unlockAudioContext);
            document.removeEventListener('keydown', unlockAudioContext);
          }
        })
        .catch(() => {
          /* noop */
        });
    };

    document.addEventListener('pointerdown', unlockAudioContext);
    document.addEventListener('keydown', unlockAudioContext);

    const playBeep = async () => {
      const ready = await ensureAudioContext();
      if (!ready || !audioContextRef.current) {
        return;
      }

      try {
        const ctx = audioContextRef.current;
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.frequency.value = 780;
        oscillator.type = 'triangle';

        const now = ctx.currentTime;
        gainNode.gain.setValueAtTime(0.0001, now);
        gainNode.gain.exponentialRampToValueAtTime(0.2, now + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);

        oscillator.start(now);
        oscillator.stop(now + 0.4);
      } catch (err) {
        console.warn('Failed to play notification sound:', err);
      }
    };

    const notifyBadgeUpdate = () => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('notification:update'));
      }
    };

    const handleNewNotification = async (notificationId: number) => {
      if (lastNotificationIdRef.current === notificationId) {
        return;
      }
      lastNotificationIdRef.current = notificationId;
      await playBeep();
      notifyBadgeUpdate();
    };

    const fetchLatestNotificationId = async () => {
      if (cancelled || initializingRef.current) return;
      try {
        const response = await fetch('/api/notifications/list?limit=1&offset=0');
        if (!response.ok) {
          return;
        }
        const data = await response.json();
        const latest = data.notifications?.[0]?.id;
        if (typeof latest === 'number' && latest !== lastNotificationIdRef.current) {
          await handleNewNotification(latest);
        }
      } catch (err) {
        console.warn('Failed to poll notifications for sound:', err);
      }
    };

    const setupRealtime = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return null;

      initializingRef.current = true;
      await ensureAudioContext();

      const { data: latestNotification } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', user.id)
        .eq('hidden', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestNotification) {
        lastNotificationIdRef.current = latestNotification.id;
      }
      initializingRef.current = false;

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
            if (!payload.new || cancelled) return;

            const notification = payload.new as { id: number; hidden?: boolean | null };
            if (notification.hidden) {
              return;
            }

            const newId = notification.id;
            if (typeof newId === 'number') {
              void handleNewNotification(newId);
            }
          }
        )
        .subscribe();

      return notificationChannel;
    };

    setupRealtime().then((ch) => {
      channel = ch;
    });

    const POLL_INTERVAL = 6000;
    pollIntervalRef.current = setInterval(() => {
      void fetchLatestNotificationId();
    }, POLL_INTERVAL);

    return () => {
      cancelled = true;
      document.removeEventListener('pointerdown', unlockAudioContext);
      document.removeEventListener('keydown', unlockAudioContext);
      if (channel) {
        supabase.removeChannel(channel);
      }
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(console.warn);
        audioContextRef.current = null;
      }
    };
  }, []);
}

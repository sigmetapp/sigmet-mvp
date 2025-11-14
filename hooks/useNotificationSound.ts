'use client';

import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';

/**
 * Hook to play sound notification when a new notification arrives
 */
export function useNotificationSound() {
  const lastNotificationIdRef = useRef<number | null>(null);
  const isPageVisibleRef = useRef(true);
  const audioContextRef = useRef<AudioContext | null>(null);

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

    const handleVisibilityChange = () => {
      isPageVisibleRef.current = !document.hidden;
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

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

    const setupRealtime = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return null;

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

            const isNewNotification =
              lastNotificationIdRef.current === null ||
              notification.id !== lastNotificationIdRef.current;

            if (isNewNotification) {
              lastNotificationIdRef.current = notification.id;

              if (isPageVisibleRef.current) {
                void playBeep();
              }

              notifyBadgeUpdate();
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
      cancelled = true;
      document.removeEventListener('pointerdown', unlockAudioContext);
      document.removeEventListener('keydown', unlockAudioContext);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (channel) {
        supabase.removeChannel(channel);
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(console.warn);
        audioContextRef.current = null;
      }
    };
  }, []);
}

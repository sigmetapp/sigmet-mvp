'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { coerceThreadId, type ThreadId } from '@/lib/dm/threadId';

// Request notification permission on mount
async function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    try {
      await Notification.requestPermission();
    } catch (err) {
      console.warn('Failed to request notification permission:', err);
    }
  }
}

// Show browser notification
async function showBrowserNotification(
  title: string,
  options: NotificationOptions
): Promise<void> {
  if (!('Notification' in window)) {
    return;
  }

  if (Notification.permission !== 'granted') {
    await requestNotificationPermission();
    if (Notification.permission !== 'granted') {
      return;
    }
  }

  try {
    const notification = new Notification(title, options);
    
    // Auto-close after 5 seconds
    setTimeout(() => {
      notification.close();
    }, 5000);

    // Handle click to focus window
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch (err) {
    console.error('Failed to show notification:', err);
  }
}

export default function DmGlobalNotifications() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [threadIds, setThreadIds] = useState<Set<ThreadId>>(new Set());
  const lastMessageIdsRef = useRef<Map<ThreadId, number>>(new Map());
  const channelsRef = useRef<any[]>([]);
  const cancelledRef = useRef(false);
  const partnerNamesRef = useRef<Map<ThreadId, { name: string; avatar?: string }>>(new Map());

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setCurrentUserId(user?.id || null);
    })();

    // Request notification permission on mount
    void requestNotificationPermission();
  }, []);

  // Load user's threads
  useEffect(() => {
    if (!currentUserId) return;

    cancelledRef.current = false;

    (async () => {
      try {
        // Get all threads where user is a participant
        const { data: participants } = await supabase
          .from('dms_thread_participants')
          .select('thread_id')
          .eq('user_id', currentUserId);

        if (cancelledRef.current || !participants) return;

        const ids = new Set<ThreadId>();
        for (const participant of participants || []) {
          const tid = coerceThreadId(participant.thread_id);
          if (tid) {
            ids.add(tid);
          }
        }
        setThreadIds(ids);

        // Get last message IDs for each thread and partner names
        for (const threadId of ids) {
          try {
            const [{ data: messages }, { data: participants }] = await Promise.all([
              supabase
                .from('dms_messages')
                .select('id')
                .eq('thread_id', threadId)
                .order('id', { ascending: false })
                .limit(1),
              supabase
                .from('dms_thread_participants')
                .select('user_id')
                .eq('thread_id', threadId)
                .neq('user_id', currentUserId),
            ]);

            if (messages && messages.length > 0) {
              const messageId = typeof messages[0]!.id === 'string'
                ? parseInt(messages[0]!.id, 10)
                : Number(messages[0]!.id);
              if (!Number.isNaN(messageId)) {
                lastMessageIdsRef.current.set(threadId, messageId);
              }
            }

            // Get partner name for notifications
            if (participants && participants.length > 0) {
              const partnerId = participants[0]!.user_id as string;
              try {
                const { data: profile } = await supabase
                  .from('profiles')
                  .select('username, full_name, avatar_url')
                  .eq('user_id', partnerId)
                  .maybeSingle();

                if (profile) {
                  const name = profile.full_name || profile.username || 'Someone';
                  partnerNamesRef.current.set(threadId, {
                    name,
                    avatar: profile.avatar_url || undefined,
                  });
                }
              } catch {
                // Ignore errors
              }
            }
          } catch {
            // Ignore errors
          }
        }
      } catch (err) {
        console.error('Error loading threads:', err);
      }
    })();

    return () => {
      cancelledRef.current = true;
    };
  }, [currentUserId]);

  // Subscribe to all threads for new messages
  useEffect(() => {
    if (!currentUserId || threadIds.size === 0) return;

    const channels: any[] = [];

    // Subscribe to each thread
    for (const threadId of threadIds) {
      const channel = supabase
        .channel(`global_dms_messages:${threadId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'dms_messages',
            filter: `thread_id=eq.${threadId}`,
          },
          (payload: any) => {
            const newMessage = payload.new;
            if (!newMessage) return;

            // Check if this is a new message from someone else
            const lastMessageId = lastMessageIdsRef.current.get(threadId);
            const messageId = typeof newMessage.id === 'string'
              ? parseInt(newMessage.id, 10)
              : Number(newMessage.id);

            if (
              !Number.isNaN(messageId) &&
              messageId !== lastMessageId &&
              newMessage.sender_id !== currentUserId
            ) {
              lastMessageIdsRef.current.set(threadId, messageId);

              // Get partner name for notification (fetch if not cached)
              let partnerInfo = partnerNamesRef.current.get(threadId);
              let partnerName = partnerInfo?.name || 'Someone';
              let partnerAvatar = partnerInfo?.avatar;

              // If partner name not cached, fetch it
              if (!partnerInfo) {
                (async () => {
                  try {
                    const { data: participants } = await supabase
                      .from('dms_thread_participants')
                      .select('user_id')
                      .eq('thread_id', threadId)
                      .neq('user_id', currentUserId)
                      .limit(1)
                      .maybeSingle();

                    if (participants) {
                      const partnerId = participants.user_id as string;
                      const { data: profile } = await supabase
                        .from('profiles')
                        .select('username, full_name, avatar_url')
                        .eq('user_id', partnerId)
                        .maybeSingle();

                      if (profile) {
                        const name = profile.full_name || profile.username || 'Someone';
                        partnerNamesRef.current.set(threadId, {
                          name,
                          avatar: profile.avatar_url || undefined,
                        });
                        partnerInfo = { name, avatar: profile.avatar_url || undefined };
                        partnerName = name;
                        partnerAvatar = profile.avatar_url || undefined;
                      }
                    }
                  } catch (err) {
                    console.error('Error fetching partner name:', err);
                  }
                })();
              }
              
              // Extract message preview
              const messageBody = newMessage.body || '';
              const preview = messageBody.length > 50 
                ? messageBody.slice(0, 50) + '...' 
                : messageBody || 'New message';

              // Play notification sound (improved beep)
              try {
                // Create audio context for beep sound
                const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
                
                // Create a more pleasant notification sound (two-tone beep)
                const playTone = (frequency: number, startTime: number, duration: number) => {
                  const oscillator = audioContext.createOscillator();
                  const gainNode = audioContext.createGain();

                  oscillator.connect(gainNode);
                  gainNode.connect(audioContext.destination);

                  oscillator.frequency.value = frequency;
                  oscillator.type = 'sine';

                  gainNode.gain.setValueAtTime(0, startTime);
                  gainNode.gain.linearRampToValueAtTime(0.2, startTime + 0.01);
                  gainNode.gain.linearRampToValueAtTime(0, startTime + duration);

                  oscillator.start(startTime);
                  oscillator.stop(startTime + duration);
                };

                const now = audioContext.currentTime;
                playTone(800, now, 0.1);
                playTone(1000, now + 0.1, 0.1);
              } catch (err) {
                console.error('Error playing sound:', err);
              }

              // Show browser notification (only if window is not focused)
              if (document.hidden || !document.hasFocus()) {
                void showBrowserNotification(partnerName, {
                  body: preview,
                  icon: partnerAvatar || partnerInfo?.avatar || '/favicon.ico',
                  tag: `dm-${threadId}`,
                  requireInteraction: false,
                });
              }

              // Dispatch custom event for other components to react
              window.dispatchEvent(
                new CustomEvent('dm:new-message', {
                  detail: {
                    threadId,
                    message: newMessage,
                  },
                })
              );
            }
          }
        )
        .subscribe();

      channels.push(channel);
    }

    channelsRef.current = channels;

    return () => {
      channels.forEach((ch) => {
        try {
          void supabase.removeChannel(ch);
        } catch {
          // Ignore errors
        }
      });
      channelsRef.current = [];
    };
  }, [currentUserId, threadIds]);

  // This component doesn't render anything
  return null;
}

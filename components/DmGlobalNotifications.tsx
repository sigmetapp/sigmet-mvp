'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { coerceThreadId, type ThreadId } from '@/lib/dm/threadId';

export default function DmGlobalNotifications() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [threadIds, setThreadIds] = useState<Set<ThreadId>>(new Set());
  const lastMessageIdsRef = useRef<Map<ThreadId, number>>(new Map());
  const channelsRef = useRef<any[]>([]);
  const cancelledRef = useRef(false);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setCurrentUserId(user?.id || null);
    })();
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

        // Get last message IDs for each thread
        for (const threadId of ids) {
          try {
            const { data: messages } = await supabase
              .from('dms_messages')
              .select('id')
              .eq('thread_id', threadId)
              .order('id', { ascending: false })
              .limit(1);

            if (messages && messages.length > 0) {
              const messageId = typeof messages[0]!.id === 'string'
                ? parseInt(messages[0]!.id, 10)
                : Number(messages[0]!.id);
              if (!Number.isNaN(messageId)) {
                lastMessageIdsRef.current.set(threadId, messageId);
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

              // Play notification sound
              try {
                // Create audio context for beep sound
                const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();

                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);

                oscillator.frequency.value = 800;
                oscillator.type = 'sine';

                gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(
                  0.01,
                  audioContext.currentTime + 0.3
                );

                oscillator.start(audioContext.currentTime);
                oscillator.stop(audioContext.currentTime + 0.3);
              } catch (err) {
                console.error('Error playing sound:', err);
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

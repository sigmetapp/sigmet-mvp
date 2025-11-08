'use client';

import { useEffect, useRef, useState, useCallback, useMemo, useLayoutEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { getOrCreateThread, listMessages, type Message, type Thread } from '@/lib/dms';
import { useWebSocketDm } from '@/hooks/useWebSocketDm';
import EmojiPicker from '@/components/EmojiPicker';
import { uploadAttachment, type DmAttachment, resolveAttachmentUrl } from '@/lib/dm/attachments';
import { assertThreadId } from '@/lib/dm/threadId';
import { useTheme } from '@/components/ThemeProvider';
import { subscribeToPresence, getPresenceMap } from '@/lib/dm/presence';

const INITIAL_MESSAGE_LIMIT = 30;
const HISTORY_PAGE_LIMIT = 30;

type SelectedAttachment = {
  id: string;
  file: File;
  previewUrl?: string;
  progress: number;
  status: 'idle' | 'uploading' | 'done' | 'error';
  error?: string;
};

type Props = {
  partnerId: string;
  onBack?: () => void;
};

function compareMessages(a: Message, b: Message): number {
  const seqA = a.sequence_number ?? null;
  const seqB = b.sequence_number ?? null;

  if (seqA !== null && seqB !== null && seqA !== seqB) {
    return seqA - seqB;
  }

  if (seqA !== null && seqB === null) {
    return -1;
  }

  if (seqA === null && seqB !== null) {
    return 1;
  }

  const timeA = new Date(a.created_at).getTime();
  const timeB = new Date(b.created_at).getTime();
  if (timeA !== timeB) return timeA - timeB;
  return a.id - b.id;
}

function sortMessagesChronologically(rawMessages: Message[]): Message[] {
  return [...rawMessages].sort(compareMessages);
}

function mergeMessages(existing: Message[], additions: Message[]): Message[] {
  if (additions.length === 0) {
    return existing;
  }

  const byId = new Map<number, Message>();
  for (const msg of existing) {
    byId.set(msg.id, msg);
  }
  for (const msg of additions) {
    byId.set(msg.id, msg);
  }

  return sortMessagesChronologically(Array.from(byId.values()));
}

export default function DmsChatWindow({ partnerId, onBack }: Props) {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [partnerProfile, setPartnerProfile] = useState<{
    user_id: string;
    username: string | null;
    full_name: string | null;
    avatar_url: string | null;
    show_online_status?: boolean | null;
    last_activity_at?: string | null;
  } | null>(null);
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [socialWeight, setSocialWeight] = useState<number>(75);
  const [trustFlow, setTrustFlow] = useState<number>(80);
  const [daysStreak, setDaysStreak] = useState<number>(0);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const lastMessageIdRef = useRef<number | null>(null);
  const oldestMessageIdRef = useRef<number | null>(null);

  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<SelectedAttachment[]>([]);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const hasUploadingAttachment = selectedFiles.some((item) => item.status === 'uploading');
  const [isOffline, setIsOffline] = useState<boolean>(typeof navigator !== 'undefined' ? !navigator.onLine : false);
  const [outbox, setOutbox] = useState<Array<{ body: string | null; attachments: DmAttachment[] }>>([]);

  // Use WebSocket hook for real-time messaging
  const {
    messages,
    isConnected: wsConnected,
    isTyping: wsIsTyping,
    partnerTyping,
    partnerOnline: wsPartnerOnline,
    // Avoid shadowing local helper name; alias merge function from hook
    mergeMessages: mergeMessagesIntoState,
    setMessages: setMessagesFromHook,
    sendMessage: sendMessageHook,
    sendTyping: wsSendTyping,
    acknowledgeMessage,
  } = useWebSocketDm(thread?.id || null, { initialLimit: INITIAL_MESSAGE_LIMIT });

  // Backward-compatible alias to avoid ReferenceError in older chunks
  const wsSendMessage = sendMessageHook;
  
  // Local state
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [messageReceipts, setMessageReceipts] = useState<Map<string, 'sent' | 'delivered' | 'read'>>(new Map());
  
  // Theme
  const { theme } = useTheme();

  const scrollRef = useRef<HTMLDivElement>(null);
  const presenceChannelRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const threadChannelRef = useRef<any>(null);
  const historySentinelRef = useRef<HTMLDivElement | null>(null);
  const historyObserverRef = useRef<IntersectionObserver | null>(null);
  const historyAutoLoadReadyRef = useRef(false);
  const initialScrollDoneRef = useRef(false);
  const presenceUnsubscribeRef = useRef<(() => void | Promise<void>) | null>(null);
  const lastActivityRef = useRef<string | null>(null);
  const presenceOnlineRef = useRef<boolean>(false);
  const showOnlineStatusRef = useRef<boolean>(true);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [newMessagesCount, setNewMessagesCount] = useState(0);
  const [showNewBanner, setShowNewBanner] = useState(false);
  const bannerHideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // In-chat search
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchIndex, setSearchIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const messageNodeMap = useRef<Map<number, HTMLDivElement>>(new Map());

  const AVATAR_FALLBACK =
    "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='100%' height='100%' fill='%23222'/><circle cx='32' cy='24' r='14' fill='%23555'/><rect x='12' y='44' width='40' height='12' rx='6' fill='%23555'/></svg>";

  // Initialize AudioContext early to avoid delay on first sound
  useEffect(() => {
    const AudioContextCtor = (window.AudioContext || (window as any).webkitAudioContext) as
      | typeof AudioContext
      | undefined;
    if (!AudioContextCtor) return;

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextCtor();
      // Pre-resume AudioContext on user interaction to avoid delay
      const handleUserInteraction = async () => {
        if (audioContextRef.current?.state === 'suspended') {
          try {
            await audioContextRef.current.resume();
          } catch (err) {
            console.error('Error resuming audio context:', err);
          }
        }
        // Remove listeners after first interaction
        document.removeEventListener('click', handleUserInteraction);
        document.removeEventListener('keydown', handleUserInteraction);
        document.removeEventListener('touchstart', handleUserInteraction);
      };
      document.addEventListener('click', handleUserInteraction, { once: true });
      document.addEventListener('keydown', handleUserInteraction, { once: true });
      document.addEventListener('touchstart', handleUserInteraction, { once: true });
    }

  }, []);

  const playKnock = useCallback(
    async (volume = 0.35) => {
      try {
        const AudioContextCtor = (window.AudioContext || (window as any).webkitAudioContext) as
          | typeof AudioContext
          | undefined;
        if (!AudioContextCtor) return;

        if (!audioContextRef.current) {
          audioContextRef.current = new AudioContextCtor();
        }

        const ctx = audioContextRef.current;
        if (!ctx) return;

        if (ctx.state === 'suspended') {
          ctx.resume().catch((resumeErr) => {
            console.error('Error resuming audio context:', resumeErr);
          });
        }

        const now = ctx.currentTime;
        const envelope = ctx.createGain();
        envelope.gain.setValueAtTime(0.0001, now);
        envelope.gain.linearRampToValueAtTime(volume, now + 0.015);
        envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
        envelope.connect(ctx.destination);

        const primary = ctx.createOscillator();
        primary.type = 'sine';
        primary.frequency.setValueAtTime(220, now);
        primary.frequency.exponentialRampToValueAtTime(90, now + 0.18);
        primary.connect(envelope);

        const secondary = ctx.createOscillator();
        secondary.type = 'triangle';
        secondary.frequency.setValueAtTime(360, now);
        secondary.frequency.exponentialRampToValueAtTime(140, now + 0.12);
        const secondaryGain = ctx.createGain();
        secondaryGain.gain.setValueAtTime(volume * 0.6, now);
        secondaryGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
        secondary.connect(secondaryGain);
        secondaryGain.connect(envelope);

        const noiseBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.2), ctx.sampleRate);
        const noiseData = noiseBuffer.getChannelData(0);
        for (let i = 0; i < noiseData.length; i += 1) {
          noiseData[i] = (Math.random() * 2 - 1) * (1 - i / noiseData.length);
        }
        const noiseSource = ctx.createBufferSource();
        noiseSource.buffer = noiseBuffer;
        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.0001, now);
        noiseGain.gain.linearRampToValueAtTime(volume * 0.28, now + 0.01);
        noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
        noiseSource.connect(noiseGain);
        noiseGain.connect(envelope);

        primary.start(now);
        secondary.start(now);
        noiseSource.start(now);

        primary.stop(now + 0.25);
        secondary.stop(now + 0.22);
        noiseSource.stop(now + 0.25);
      } catch (err) {
        console.error('Error playing knock sound:', err);
      }
    },
    []
  );

  const playSendConfirmation = useCallback(() => {
    void playKnock(0.22);
  }, [playKnock]);

  const playIncomingNotification = useCallback(() => {
    void playKnock(0.35);
  }, [playKnock]);

  const isOnlineByActivity = useCallback((lastActivityAt?: string | null) => {
    if (!lastActivityAt) {
      return false;
    }
    const lastActivity = new Date(lastActivityAt);
    const now = new Date();
    const diffInMinutes = (now.getTime() - lastActivity.getTime()) / (1000 * 60);
    return diffInMinutes < 5;
  }, []);

  const applyOnlineStatus = useCallback(
    (presenceOnline: boolean, activityAt?: string | null) => {
      presenceOnlineRef.current = presenceOnline;
      if (typeof activityAt !== 'undefined') {
        lastActivityRef.current = activityAt ?? null;
      }

      if (!showOnlineStatusRef.current) {
        setIsOnline(null);
        return;
      }

      const effectiveActivity =
        typeof activityAt !== 'undefined' ? activityAt : lastActivityRef.current;

      const activityOnline = isOnlineByActivity(effectiveActivity);
      setIsOnline(presenceOnline || activityOnline);
    },
    [isOnlineByActivity]
  );

  function getAttachmentIcon(type?: DmAttachment['type']) {
    switch (type) {
      case 'image':
        return '\uD83D\uDDBC';
      case 'video':
        return '\uD83C\uDFA5';
      case 'audio':
        return '\uD83C\uDFB5';
      default:
        return '\uD83D\uDCC4';
    }
  }

  // Attachment preview component
  function AttachmentPreview({ attachment }: { attachment: DmAttachment }) {
    const [url, setUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const attachmentKey = useMemo(() => {
      if (!attachment) return 'null';
      return [
        attachment.path ?? '',
        (attachment as any)?.storagePath ?? '',
        (attachment as any)?.storage_path ?? '',
        attachment.url ?? (attachment as any)?.url ?? '',
        attachment.signedUrl ?? (attachment as any)?.signed_url ?? '',
        attachment.publicUrl ?? (attachment as any)?.public_url ?? '',
        attachment.bucket ?? (attachment as any)?.bucket ?? '',
        attachment.version ?? '',
      ].join('|');
    }, [attachment]);

    const stableAttachment = useMemo(() => attachment, [attachmentKey]);

    useEffect(() => {
      if (!stableAttachment) {
        setUrl(null);
        setLoading(false);
        return;
      }

      let cancelled = false;
      setLoading(true);

      (async () => {
        try {
          const resolved = await resolveAttachmentUrl(stableAttachment, 3600);
          if (!cancelled) {
            setUrl(resolved);
          }
        } catch (err) {
          console.error('Error loading attachment:', err);
          if (!cancelled) {
            setUrl(null);
          }
        } finally {
          if (!cancelled) {
            setLoading(false);
          }
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [stableAttachment, attachmentKey]);

    if (loading) {
      return (
        <div className="w-48 h-48 bg-white/5 rounded-lg flex items-center justify-center border border-white/10">
          <div className="text-white/40 text-xs">Loading...</div>
        </div>
      );
    }

    if (stableAttachment.type === 'image' && url) {
      return (
        <img
          src={url}
          alt="Attachment"
          className="max-w-[280px] max-h-[280px] rounded-lg object-cover border border-white/10"
        />
      );
    }

    if (stableAttachment.type === 'video' && url) {
      return (
        <div className="relative max-w-[280px] max-h-[280px] rounded-lg overflow-hidden border border-white/10 bg-black/20">
          <video
            src={url}
            controls
            preload="metadata"
            playsInline
            className="max-w-full max-h-full"
          />
        </div>
      );
    }

    if (!url) {
      return (
        <div className="px-3 py-2 bg-white/5 rounded-lg border border-white/10 text-xs text-white/60 max-w-[320px]">
          Unable to load document preview.
        </div>
      );
    }

    const displayName =
      stableAttachment.originalName ?? (stableAttachment as any)?.original_name ?? 'Document';
    return (
      <div className="px-3 py-3 bg-white/5 rounded-lg border border-white/10 max-w-[320px] text-sm text-white/80">
        <div className="flex items-start gap-3">
          <span className="text-2xl leading-none" role="img" aria-hidden="true">
            {getAttachmentIcon(stableAttachment.type)}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div className="font-medium truncate">{displayName}</div>
              {stableAttachment.version && (
                <span className="text-[11px] px-1.5 py-0.5 rounded bg-white/10 border border-white/20">
                  v{stableAttachment.version}
                </span>
              )}
            </div>
            <div className="text-[11px] text-white/50">
              {formatFileSize(stableAttachment.size ?? (stableAttachment as any)?.size)}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <a
                href={url || '#'}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/10 border border-white/20 hover:bg-white/15 transition text-xs"
              >
                Download
              </a>
              {stableAttachment.mime === 'application/pdf' && url && (
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/10 border border-white/20 hover:bg-white/15 transition text-xs"
                >
                  Open
                </a>
              )}
            </div>
          </div>
        </div>
        {stableAttachment.mime === 'application/pdf' && url && (
          <div className="mt-3 border border-white/10 rounded-md overflow-hidden">
            <iframe
              src={url}
              title={displayName}
              className="w-full h-48 bg-white"
            />
          </div>
        )}
      </div>
    );
  }

  // Get current user
  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setCurrentUserId(user?.id || null);
    })();
  }, []);

  // Load partner profile with SW and Trust Flow
  useEffect(() => {
    if (!partnerId) return;
    (async () => {
      try {
        const { data, error: profError } = await supabase
          .from('profiles')
          .select('user_id, username, full_name, avatar_url, show_online_status, last_activity_at')
          .eq('user_id', partnerId)
          .maybeSingle();

        if (profError) {
          console.error('Error loading profile:', profError);
          return;
        }

        if (data) {
          const profileData = {
            user_id: data.user_id as string,
            username: data.username,
            full_name: data.full_name,
            avatar_url: data.avatar_url,
            show_online_status: data.show_online_status,
            last_activity_at: data.last_activity_at,
          };

          setPartnerProfile(profileData);
          showOnlineStatusRef.current = profileData.show_online_status !== false;
          lastActivityRef.current = profileData.last_activity_at ?? null;

          if (showOnlineStatusRef.current) {
            applyOnlineStatus(presenceOnlineRef.current, profileData.last_activity_at ?? null);
          } else {
            setIsOnline(null);
          }
        }

        // Load Social Weight from sw_scores table
        try {
          const { data: swData } = await supabase
            .from('sw_scores')
            .select('total')
            .eq('user_id', partnerId)
            .maybeSingle();
          
          if (swData && swData.total !== null && swData.total !== undefined) {
            setSocialWeight(Math.round(swData.total));
          } else {
            // Default to 75 if no SW data found
            setSocialWeight(75);
          }
        } catch (swErr) {
          console.error('Error loading Social Weight:', swErr);
          setSocialWeight(75);
        }

        // Load Trust Flow
        try {
          const { data: feedback } = await supabase
            .from('trust_feedback')
            .select('value')
            .eq('target_user_id', partnerId);
        
          const sum = ((feedback as any[]) || []).reduce((acc, r) => acc + (Number(r.value) || 0), 0);
          const rating = Math.max(0, Math.min(120, 80 + sum * 2));
          setTrustFlow(rating);
        } catch {
          setTrustFlow(80);
        }
        
        // Calculate days streak (consecutive days of communication)
        // This will be calculated when thread is loaded
      } catch (err) {
        console.error('Error loading profile:', err);
      }
    })();
  }, [partnerId, currentUserId, applyOnlineStatus]);

  // Use WebSocket presence (already handled by useWebSocketDm)
  useEffect(() => {
    if (wsPartnerOnline !== null) {
      applyOnlineStatus(wsPartnerOnline);
    }
  }, [wsPartnerOnline, applyOnlineStatus]);

  useEffect(() => {
    if (!partnerProfile?.user_id) {
      presenceOnlineRef.current = false;
      lastActivityRef.current = null;
      if (presenceUnsubscribeRef.current) {
        void presenceUnsubscribeRef.current();
        presenceUnsubscribeRef.current = null;
      }
      return;
    }

    const userId = partnerProfile.user_id;
    if (typeof partnerProfile.last_activity_at !== 'undefined') {
      lastActivityRef.current = partnerProfile.last_activity_at ?? null;
    }
    const showStatus = partnerProfile.show_online_status !== false;
    showOnlineStatusRef.current = showStatus;

    if (!showStatus) {
      setIsOnline(null);
      presenceOnlineRef.current = false;
      if (presenceUnsubscribeRef.current) {
        void presenceUnsubscribeRef.current();
        presenceUnsubscribeRef.current = null;
      }
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const unsubscribe = await subscribeToPresence([userId], (uid, online) => {
          if (!cancelled && uid === userId) {
            applyOnlineStatus(online);
          }
        });
        presenceUnsubscribeRef.current = unsubscribe;
      } catch (error) {
        console.error('Error subscribing to presence updates:', error);
      }
    })();

    (async () => {
      try {
        const state = await getPresenceMap(userId);
        if (!cancelled) {
          const online = !!state?.[userId]?.[0];
          applyOnlineStatus(online);
        }
      } catch (error) {
        console.error('Error retrieving initial presence state:', error);
      }
    })();

    const pollInterval = setInterval(async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('last_activity_at')
          .eq('user_id', userId)
          .maybeSingle();

        if (!cancelled && data) {
          const activity = (data as any).last_activity_at ?? null;
          applyOnlineStatus(presenceOnlineRef.current, activity);
        }
      } catch (error) {
        console.error('Error polling partner activity:', error);
      }
    }, 30000);

    return () => {
      cancelled = true;
      if (presenceUnsubscribeRef.current) {
        void presenceUnsubscribeRef.current();
        presenceUnsubscribeRef.current = null;
      }
      clearInterval(pollInterval);
    };
  }, [partnerProfile?.user_id, partnerProfile?.show_online_status, applyOnlineStatus]);

  // Listen for message acknowledgments and update receipts
  useEffect(() => {
    if (!thread?.id || !currentUserId || !partnerId) return;

    const { getWebSocketClient } = require('@/lib/dm/websocket');
    const wsClient = getWebSocketClient();
    
    const handleAck = async (event: any) => {
        if (event.type === 'ack' && event.thread_id === thread.id) {
          // Only update receipts for messages sent by current user
          // The ack event comes from the partner, so we update the receipt status
          // Verify that this receipt is for a message sent by current user
          try {
            const { data: message } = await supabase
              .from('dms_messages')
              .select('sender_id')
              .eq('id', event.message_id)
              .eq('sender_id', currentUserId)
              .maybeSingle();
            
            if (message) {
              // This receipt is for a message sent by current user
              setMessageReceipts((prev) => {
                const updated = new Map(prev);
                const receiptKey = String(event.message_id);
                // The status should be 'delivered' or 'read' from the partner
                updated.set(receiptKey, event.status || 'delivered');
                return updated;
              });
            }
          } catch (err) {
            console.error('Error verifying ack message:', err);
          }
        }
    };

    const handleMessage = (event: any) => {
        if (event.type === 'message' && event.thread_id === thread.id) {
          const message = event.message as any;
          // If this is our message, mark it as sent on server confirmation
          // Receipts will be updated when partner acknowledges
          if (message.sender_id === currentUserId) {
            setMessageReceipts((prev) => {
              const updated = new Map(prev);
              const receiptKey = String(event.server_msg_id);
              // Initially mark as 'sent', will be updated to 'delivered'/'read' when partner acknowledges
              if (!updated.has(receiptKey)) {
                updated.set(receiptKey, 'sent');
              }
              return updated;
            });
            setMessagesFromHook((prev: any[]) =>
              prev.map((msg) => {
                const matchesById = String((msg as any)?.id ?? '') === String(event.server_msg_id ?? '');
                const matchesByClient =
                  (msg as any)?.client_msg_id && message.client_msg_id && (msg as any).client_msg_id === message.client_msg_id;
                if (!matchesById && !matchesByClient) {
                  return msg;
                }
                return {
                  ...msg,
                  send_error: undefined,
                  delivery_state: 'sent',
                };
              })
            );
          }
        }
    };

    const unsubAck = wsClient.on('ack', handleAck);
    const unsubMessage = wsClient.on('message', handleMessage);

    // Also subscribe to realtime updates for receipts
    // This ensures we get updates even if WebSocket ack events don't work
    // We need to filter receipts for messages sent by current user, where partner is the recipient
    // So we need to check: receipt.user_id = partnerId AND message.sender_id = currentUserId
    // Since we can't filter by message sender in the channel filter, we'll filter in the handler
    const receiptsChannel = supabase
      .channel(`receipts:${thread.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'dms_message_receipts',
          filter: `user_id=eq.${partnerId}`,
        },
        async (payload) => {
          const receipt = payload.new as any;
          if (receipt && receipt.message_id) {
            // Verify that this receipt is for a message sent by current user
            try {
              const { data: message } = await supabase
                .from('dms_messages')
                .select('sender_id')
                .eq('id', receipt.message_id)
                .eq('sender_id', currentUserId)
                .maybeSingle();
              
                if (message) {
                  // This receipt is for a message sent by current user
                  setMessageReceipts((prev) => {
                    const updated = new Map(prev);
                    const receiptKey = String(receipt.message_id);
                    updated.set(receiptKey, receipt.status || 'delivered');
                    return updated;
                  });
                  setMessagesFromHook((prev: any[]) =>
                    prev.map((msg) => {
                      const matchesById = String((msg as any)?.id ?? '') === String(receipt.message_id ?? '');
                      if (!matchesById) {
                        return msg;
                      }
                      const deliveryState =
                        receipt.status === 'read'
                          ? 'read'
                          : receipt.status === 'delivered'
                            ? 'delivered'
                            : 'sent';
                      return {
                        ...msg,
                        send_error: undefined,
                        delivery_state: deliveryState,
                      };
                    })
                  );
                }
            } catch (err) {
              console.error('Error verifying receipt message:', err);
            }
          }
        }
      )
      .subscribe();

    return () => {
      unsubAck();
      unsubMessage();
      void supabase.removeChannel(receiptsChannel);
    };
  }, [thread?.id, currentUserId, partnerId]);

  // Get or create thread and load messages
  useEffect(() => {
    if (!currentUserId || !partnerId || currentUserId === partnerId) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      oldestMessageIdRef.current = null;
        historyAutoLoadReadyRef.current = false;
        initialScrollDoneRef.current = false;
      setLoading(true);
      setError(null);
      setHasMoreHistory(true);
      setHistoryError(null);
      setLoadingOlderMessages(false);

      try {
        // Get or create thread
        let threadData;
        try {
          threadData = await getOrCreateThread(currentUserId, partnerId);
        } catch (threadErr: any) {
          console.error('Error in getOrCreateThread:', threadErr);
          throw new Error(threadErr?.message || 'Failed to create or get thread');
        }
        
        if (cancelled) return;

        if (!threadData) {
          console.error('threadData is null or undefined');
          throw new Error('Failed to get thread: threadData is null');
        }

        const threadId = assertThreadId(threadData.id, 'Invalid thread ID received');

        setThread({
          ...threadData,
          id: threadId,
        });

        // Load messages with thread ID
        let messagesData;
        try {
          messagesData = await listMessages(threadId, { limit: INITIAL_MESSAGE_LIMIT });
        } catch (msgErr: any) {
          console.error('Error in listMessages:', msgErr, 'threadId:', threadId);
          // Continue without messages if we can't load them, but thread is valid
          messagesData = [];
        }
        if (cancelled) return;

        // Sort by created_at ascending (oldest first, newest last) and by id for consistent ordering
        const sorted = sortMessagesChronologically(messagesData);
        oldestMessageIdRef.current = sorted.length > 0 ? sorted[0].id : null;
        
        // Load message receipts for messages sent by current user (to show partner's read status)
        if (sorted.length > 0 && currentUserId && partnerId) {
          try {
            // Get message IDs of messages sent by current user
            const myMessageIds = sorted
              .filter((m) => m.sender_id === currentUserId)
              .map((m) => String(m.id));
            const supabaseMessageIds = myMessageIds.map((id) => {
              if (/^\d+$/.test(id)) {
                const numeric = Number(id);
                return Number.isSafeInteger(numeric) ? numeric : id;
              }
              return id;
            });
            
            if (supabaseMessageIds.length > 0) {
              // Load receipts where partner is the recipient (user_id = partnerId)
              const { data: receipts } = await supabase
                .from('dms_message_receipts')
                .select('message_id, status')
                .in('message_id', supabaseMessageIds)
                .eq('user_id', partnerId);
              
              if (receipts) {
                const receiptsMap = new Map<string, 'sent' | 'delivered' | 'read'>();
                for (const receipt of receipts) {
                  const status = (receipt.status as 'sent' | 'delivered' | 'read') ?? 'delivered';
                  receiptsMap.set(String(receipt.message_id), status);
                }
                setMessageReceipts(receiptsMap);
              }
            }
          } catch (err) {
            console.error('Error loading message receipts:', err);
          }
        }
        
        // Scroll to bottom after messages are loaded
        setTimeout(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
          }
          
          // Mark all messages as read when thread is opened and messages are loaded
          // This ensures that when user opens a chat, all visible messages are marked as read
          if (sorted.length > 0 && currentUserId && partnerId && threadId) {
            const lastMessage = sorted[sorted.length - 1];
            // Mark all messages as read when opening chat, regardless of sender
            // This ensures that on page refresh, these messages won't be unread
            if (lastMessage) {
              // Mark all messages up to the last one as read immediately
              fetch('/api/dms/messages.read', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  thread_id: String(threadId),
                  up_to_message_id: String(lastMessage.id),
                }),
              })
              .then((response) => {
                if (response.ok) {
                  // Dispatch event to update unread count in partner list
                  window.dispatchEvent(
                    new CustomEvent('dm:message-read', {
                      detail: {
                        threadId: String(threadId),
                        partnerId: partnerId,
                      },
                    })
                  );
                } else {
                  // Log error response for debugging
                  response.json().then((data) => {
                    console.error('Error marking messages as read on thread open:', data);
                  }).catch(() => {
                    console.error('Error marking messages as read on thread open:', response.status, response.statusText);
                  });
                }
              })
              .catch((err) => {
                console.error('Error marking messages as read on thread open:', err);
              });
            }
          }
        }, 100);

        setHasMoreHistory(sorted.length === INITIAL_MESSAGE_LIMIT);
        
        // Calculate days streak after thread is loaded
        try {
          const { data: allMessages } = await supabase
            .from('dms_messages')
            .select('created_at')
            .eq('thread_id', threadId)
            .in('sender_id', [currentUserId, partnerId])
            .order('created_at', { ascending: false })
            .limit(100);
          
          if (allMessages && allMessages.length > 0) {
            // Calculate consecutive days
            let streak = 0;
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            const messageDates = new Set(
              allMessages.map(m => {
                const d = new Date(m.created_at);
                d.setHours(0, 0, 0, 0);
                return d.getTime();
              })
            );
            
            let currentDate = new Date(today);
            while (messageDates.has(currentDate.getTime())) {
              streak++;
              currentDate.setDate(currentDate.getDate() - 1);
            }
            
            if (!cancelled) {
              setDaysStreak(streak);
            }
          } else if (!cancelled) {
            setDaysStreak(0);
          }
        } catch (streakErr) {
          console.error('Error calculating streak:', streakErr);
          if (!cancelled) {
            setDaysStreak(0);
          }
        }
      } catch (err: any) {
        if (!cancelled) {
          console.error('Error loading thread/messages:', err);
          console.error('Error details:', {
            currentUserId,
            partnerId,
            threadData: err?.threadData,
            message: err?.message
          });
          setError(err?.message || 'Failed to load conversation');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentUserId, partnerId]);

  // Initialize last message ID
  useEffect(() => {
    if (messages.length > 0 && !lastMessageIdRef.current) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg) {
        lastMessageIdRef.current = lastMsg.id;
      }
    }
  }, [messages.length]);
  
  useEffect(() => {
    if (messages.length === 0) {
      setHasMoreHistory(false);
    }
  }, [messages.length]);

  // Play sound on new messages (partner messages only) and acknowledge them
  useEffect(() => {
    if (messages.length === 0 || !currentUserId || !partnerId) return;

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) return;

    const isNewMessage = lastMessage.id !== lastMessageIdRef.current;
    const isFromPartner = lastMessage.sender_id === partnerId && lastMessage.sender_id !== currentUserId;

    if (isNewMessage) {
      const prevLastId = lastMessageIdRef.current;
      lastMessageIdRef.current = lastMessage.id;

      if (prevLastId === null) {
        return;
      }

      if (isFromPartner) {
        playIncomingNotification();
        // If user is at bottom, auto-read and keep stickiness. Otherwise, accumulate counter.
        if (thread?.id) {
          if (isAtBottom) {
            acknowledgeMessage(lastMessage.id, thread.id, 'read');
              setMessageReceipts((prev) => {
                const updated = new Map(prev);
                updated.set(String(lastMessage.id), 'read');
                return updated;
              });
          } else {
            setNewMessagesCount((c) => c + 1);
          }
        }
      }
    }
  }, [messages, currentUserId, partnerId, playIncomingNotification, thread?.id, acknowledgeMessage, isAtBottom]);

  // Typing indicators are handled by useWebSocketDm hook

  // Handle typing indicator
  const handleTyping = useCallback(() => {
    if (!thread?.id || !currentUserId || isTyping) return;

    const threadId = thread.id;

    setIsTyping(true);
    wsSendTyping(threadId, true);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      if (thread?.id) {
        wsSendTyping(thread.id, false);
      }
    }, 3000);
  }, [thread?.id, currentUserId, isTyping, wsSendTyping]);

  // Handle message text change with typing indicator
  const handleMessageTextChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setMessageText(e.target.value);
    handleTyping();
  }, [handleTyping]);

  // Persist per-thread draft
  useEffect(() => {
    if (!thread?.id) return;
    const key = `dm:draft:${thread.id}`;
    try {
      localStorage.setItem(key, messageText);
    } catch {}
  }, [messageText, thread?.id]);

  // Hydrate draft on thread change
  useEffect(() => {
    if (!thread?.id) return;
    const key = `dm:draft:${thread.id}`;
    try {
      const saved = localStorage.getItem(key);
      if (saved && saved !== messageText) {
        setMessageText(saved);
        setTimeout(() => textareaRef.current?.focus(), 0);
      }
    } catch {}
  }, [thread?.id]);
  
  const loadOlderMessages = useCallback(async () => {
    if (!thread?.id || loadingOlderMessages || !hasMoreHistory) {
      return;
    }

    const currentOldest = oldestMessageIdRef.current ?? messages[0]?.id ?? null;
    if (!currentOldest) {
      setHasMoreHistory(false);
      return;
    }

    setLoadingOlderMessages(true);
    setHistoryError(null);

    const scrollContainer = scrollRef.current;
    const prevHeight = scrollContainer?.scrollHeight ?? 0;
    const prevScrollTop = scrollContainer?.scrollTop ?? 0;

    try {
      const olderMessages = await listMessages(thread.id, {
        limit: HISTORY_PAGE_LIMIT,
        beforeId: currentOldest,
      });

      if (!olderMessages || olderMessages.length === 0) {
        setHasMoreHistory(false);
        return;
      }

      const orderedOlder = sortMessagesChronologically(olderMessages);
      oldestMessageIdRef.current = orderedOlder[0]?.id ?? oldestMessageIdRef.current;

      mergeMessagesIntoState(orderedOlder);

      requestAnimationFrame(() => {
        if (!scrollContainer) return;
        const newHeight = scrollContainer.scrollHeight;
        const diff = newHeight - prevHeight;
        scrollContainer.scrollTop = prevScrollTop + diff;
      });

      if (orderedOlder.length < HISTORY_PAGE_LIMIT) {
        setHasMoreHistory(false);
      }
    } catch (err) {
      console.error('Error loading older messages:', err);
      setHistoryError('Failed to load earlier messages.');
    } finally {
      setLoadingOlderMessages(false);
    }
  }, [thread?.id, loadingOlderMessages, hasMoreHistory, mergeMessages, messages]);

  useEffect(() => {
    const sentinel = historySentinelRef.current;
    const scrollContainer = scrollRef.current;

    if (!sentinel || !scrollContainer) {
      return;
    }

    if (historyObserverRef.current) {
      historyObserverRef.current.disconnect();
    }

      const observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (!historyAutoLoadReadyRef.current) {
            return;
          }
          if (entry?.isIntersecting && hasMoreHistory && !loadingOlderMessages) {
            void loadOlderMessages();
          }
        },
        {
          root: scrollContainer,
          threshold: 0.05,
        }
      );

    observer.observe(sentinel);
    historyObserverRef.current = observer;

    return () => {
      observer.disconnect();
      historyObserverRef.current = null;
    };
  }, [hasMoreHistory, loadingOlderMessages, loadOlderMessages, thread?.id]);

  // Scroll to bottom on new messages and when messages are initially loaded
  // Also mark messages as read when scrolling to bottom
  useLayoutEffect(() => {
    if (messages.length === 0 || !thread?.id || !currentUserId || !partnerId) {
      return;
    }

    const container = scrollRef.current;
    if (!container) {
      return;
    }

    if (!initialScrollDoneRef.current) {
      container.scrollTop = container.scrollHeight;
      historyAutoLoadReadyRef.current = true;
      initialScrollDoneRef.current = true;
      
      // Mark all messages as read when initially scrolling to bottom
      // This ensures that when user opens a chat, all visible messages are marked as read
      const lastMessage = messages[messages.length - 1];
      if (lastMessage && thread?.id) {
        // Mark all messages as read immediately when chat is opened
        // This ensures that on page refresh, these messages won't be unread
        fetch('/api/dms/messages.read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            thread_id: String(thread.id),
            up_to_message_id: String(lastMessage.id),
          }),
        })
        .then((response) => {
          if (response.ok) {
            // Dispatch event to update unread count in partner list
            window.dispatchEvent(
              new CustomEvent('dm:message-read', {
                detail: {
                  threadId: String(thread.id),
                  partnerId: partnerId,
                },
              })
            );
          } else {
            // Log error response for debugging
            response.json().then((data) => {
              console.error('Error marking messages as read on initial scroll:', data);
            }).catch(() => {
              console.error('Error marking messages as read on initial scroll:', response.status, response.statusText);
            });
          }
        })
        .catch((err) => {
          console.error('Error marking messages as read on initial scroll:', err);
        });
      }
      return;
    }

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    const shouldStickToBottom = distanceFromBottom <= 200;

    if (shouldStickToBottom && historyAutoLoadReadyRef.current) {
      container.scrollTop = container.scrollHeight;
      
      // Mark all messages as read when auto-scrolling to bottom
      const lastMessage = messages[messages.length - 1];
      if (lastMessage && thread?.id) {
        acknowledgeMessage(lastMessage.id, thread.id, 'read');
        fetch('/api/dms/messages.read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            thread_id: String(thread.id),
            up_to_message_id: String(lastMessage.id),
          }),
        })
        .then((response) => {
          if (response.ok) {
            // Dispatch event to update unread count in partner list
            window.dispatchEvent(
              new CustomEvent('dm:message-read', {
                detail: {
                  threadId: String(thread.id),
                  partnerId: partnerId,
                },
              })
            );
          } else {
            // Log error response for debugging
            response.json().then((data) => {
              console.error('Error marking messages as read on auto-scroll:', data);
            }).catch(() => {
              console.error('Error marking messages as read on auto-scroll:', response.status, response.statusText);
            });
          }
        })
        .catch((err) => {
          console.error('Error marking messages as read on auto-scroll:', err);
        });
      }
    }
  }, [messages.length, thread?.id, currentUserId, partnerId, messages, acknowledgeMessage]);

  // Track scroll position to toggle bottom stickiness and banner
  // Also mark messages as read when user scrolls to bottom
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !thread?.id || !currentUserId || !partnerId) return;

    let markReadTimeout: NodeJS.Timeout | null = null;
    let lastMarkedReadMessageId: number | null = null;

    const onScroll = () => {
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      const atBottom = distanceFromBottom <= 8; // treat as bottom if within 8px
      setIsAtBottom(atBottom);
      if (atBottom) {
        // Clear new messages counter when user reaches bottom
        setNewMessagesCount(0);
        setShowNewBanner(false);

        // Mark all messages as read when user is at bottom
        if (messages.length > 0) {
          const lastMessage = messages[messages.length - 1];
          if (lastMessage && lastMessage.id !== lastMarkedReadMessageId) {
            // Debounce mark as read to avoid too many requests
            if (markReadTimeout) {
              clearTimeout(markReadTimeout);
            }
            markReadTimeout = setTimeout(() => {
              // Only mark as read if message is from partner
              if (lastMessage.sender_id === partnerId && lastMessage.sender_id !== currentUserId && thread?.id) {
                acknowledgeMessage(lastMessage.id, thread.id, 'read');
                lastMarkedReadMessageId = lastMessage.id;
                
                // Also call the API to update last_read_message_id
                fetch('/api/dms/messages.read', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    thread_id: String(thread.id),
                    up_to_message_id: String(lastMessage.id),
                  }),
                })
                .then((response) => {
                  if (response.ok) {
                    // Dispatch event to update unread count in partner list
                    window.dispatchEvent(
                      new CustomEvent('dm:message-read', {
                        detail: {
                          threadId: String(thread.id),
                          partnerId: partnerId,
                        },
                      })
                    );
                  } else {
                    // Log error response for debugging
                    response.json().then((data) => {
                      console.error('Error marking messages as read:', data);
                    }).catch(() => {
                      console.error('Error marking messages as read:', response.status, response.statusText);
                    });
                  }
                })
                .catch((err) => {
                  console.error('Error marking messages as read:', err);
                });
              }
            }, 500);
          }
        }
      }
    };

    container.addEventListener('scroll', onScroll);
    // Initialize once
    onScroll();
    return () => {
      container.removeEventListener('scroll', onScroll);
      if (markReadTimeout) {
        clearTimeout(markReadTimeout);
      }
    };
  }, [thread?.id, currentUserId, partnerId, messages, acknowledgeMessage]);

  const handleJumpToBottom = useCallback(() => {
    const container = scrollRef.current;
    if (!container || !thread?.id || !currentUserId || !partnerId) return;
    container.scrollTop = container.scrollHeight;
    setNewMessagesCount(0);
    setShowNewBanner(false);
    
    // Mark all messages as read when jumping to bottom
    if (messages.length > 0 && thread?.id) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage) {
        acknowledgeMessage(lastMessage.id, thread.id, 'read');
        fetch('/api/dms/messages.read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            thread_id: String(thread.id),
            up_to_message_id: String(lastMessage.id),
          }),
        })
        .then((response) => {
          if (response.ok) {
            // Dispatch event to update unread count in partner list
            window.dispatchEvent(
              new CustomEvent('dm:message-read', {
                detail: {
                  threadId: String(thread.id),
                  partnerId: partnerId,
                },
              })
            );
          } else {
            // Log error response for debugging
            response.json().then((data) => {
              console.error('Error marking messages as read on jump to bottom:', data);
            }).catch(() => {
              console.error('Error marking messages as read on jump to bottom:', response.status, response.statusText);
            });
          }
        })
        .catch((err) => {
          console.error('Error marking messages as read on jump to bottom:', err);
        });
      }
    }
  }, [thread?.id, currentUserId, partnerId, messages, acknowledgeMessage]);

  // Auto-show/auto-hide banner with smooth animations
  useEffect(() => {
    if (newMessagesCount > 0 && !isAtBottom) {
      setShowNewBanner(true);
      if (bannerHideTimeoutRef.current) clearTimeout(bannerHideTimeoutRef.current);
      bannerHideTimeoutRef.current = setTimeout(() => {
        setShowNewBanner(false);
      }, 5000);
    } else {
      setShowNewBanner(false);
      if (bannerHideTimeoutRef.current) {
        clearTimeout(bannerHideTimeoutRef.current);
        bannerHideTimeoutRef.current = null;
      }
    }
    return () => {
      if (bannerHideTimeoutRef.current) {
        clearTimeout(bannerHideTimeoutRef.current);
        bannerHideTimeoutRef.current = null;
      }
    };
  }, [newMessagesCount, isAtBottom]);

  // Reset scroll trackers when thread changes
  useEffect(() => {
    initialScrollDoneRef.current = false;
    historyAutoLoadReadyRef.current = false;
  }, [thread?.id]);

  // Handle emoji selection
  const handleEmojiSelect = useCallback((emoji: string) => {
    setMessageText((prev) => prev + emoji);
  }, []);

  function handleAddFiles(fileList: FileList | File[]) {
    const incoming = Array.from(fileList);
    if (incoming.length === 0) return;

    const additions: SelectedAttachment[] = incoming.map((file) => {
      const previewUrl = file.type.startsWith('image/')
        ? URL.createObjectURL(file)
        : undefined;
      return {
        id: globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
        file,
        previewUrl,
        progress: 0,
        status: 'idle',
      };
    });

    setSelectedFiles((prev) => [...prev, ...additions]);
  }

  // Handle file selection
  function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (files && files.length > 0) {
      handleAddFiles(files);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  // Handle file removal
  function handleRemoveFile(id: string) {
    setSelectedFiles((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((item) => item.id !== id);
    });
  }

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!event.dataTransfer) return;
    event.dataTransfer.dropEffect = 'copy';
    setIsDragActive(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget === event.target) {
      setIsDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragActive(false);
    if (event.dataTransfer?.files?.length) {
      handleAddFiles(event.dataTransfer.files);
    }
  }, []);

  // Handle send message
  async function handleSend() {
    if (!thread || !thread.id || (!messageText.trim() && selectedFiles.length === 0) || sending) {
      return;
    }

    const threadId = thread.id;
    const textToSend = messageText.trim();
    const filesToSend = selectedFiles;

    setReplyingTo(null);
    setSending(true);

    const hasAttachments = filesToSend.length > 0;
    if (hasAttachments) {
      setUploadingAttachments(true);
    }

    setIsTyping(false);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    if (threadId) {
      wsSendTyping(threadId, false);
    }

    let attachments: DmAttachment[] = [];

    if (hasAttachments) {
      try {
        attachments = await Promise.all(
          filesToSend.map(async (item) => {
            setSelectedFiles((prev) =>
              prev.map((entry) =>
                entry.id === item.id
                  ? { ...entry, status: 'uploading', progress: 0, error: undefined }
                  : entry
              )
            );

            const attachment = await uploadAttachment(item.file, {
              onProgress: ({ uploadedBytes, totalBytes }) => {
                setSelectedFiles((prev) =>
                  prev.map((entry) =>
                    entry.id === item.id
                      ? {
                          ...entry,
                          progress: Math.min(100, Math.round((uploadedBytes / totalBytes) * 100)),
                        }
                      : entry
                  )
                );
              },
            });

            setSelectedFiles((prev) =>
              prev.map((entry) =>
                entry.id === item.id ? { ...entry, status: 'done', progress: 100 } : entry
              )
            );

            return attachment;
          })
        );
      } catch (err: any) {
        console.error('Error uploading attachments:', err);
        setSelectedFiles((prev) =>
          prev.map((entry) => {
            if (filesToSend.some((upload) => upload.id === entry.id)) {
              const alreadyDone = entry.status === 'done';
              return {
                ...entry,
                status: alreadyDone ? entry.status : 'error',
                error: alreadyDone ? entry.error : err?.message || 'Failed to upload',
              };
            }
            return entry;
          })
        );
        setError(err?.message || 'Failed to upload attachments');
        setSending(false);
        setUploadingAttachments(false);
        return;
      } finally {
        setUploadingAttachments(false);
      }
    }

    playSendConfirmation();

    try {
      const messageBody = textToSend || null;
      if (isOffline) {
        setOutbox((prev) => [...prev, { body: messageBody, attachments }]);
        setMessageText('');
        setSelectedFiles((prev) => {
          prev.forEach((entry) => {
            if (entry.previewUrl) {
              URL.revokeObjectURL(entry.previewUrl);
            }
          });
          return [];
        });
        playSendConfirmation();
        return;
      }
      await sendMessageHook(threadId, messageBody, annotateDocumentVersions(attachments, messages) as unknown[]);

      setMessageText('');
      setSelectedFiles((prev) => {
        prev.forEach((entry) => {
          if (entry.previewUrl) {
            URL.revokeObjectURL(entry.previewUrl);
          }
        });
        return [];
      });

      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      }, 100);
      playSendConfirmation();
    } catch (err: any) {
      console.error('Error sending message:', err);
      setError(err?.message || 'Failed to send message');
      setMessageText(textToSend);
    } finally {
      setSending(false);
      setUploadingAttachments(false);
    }
  }

    function annotateDocumentVersions(
      uploads: DmAttachment[],
      existingMessages: Message[]
    ): DmAttachment[] {
      if (uploads.length === 0) {
        return uploads;
      }

      const versionMap = new Map<string, number>();

      for (const message of existingMessages) {
        const messageAttachments = Array.isArray(message.attachments)
          ? (message.attachments as DmAttachment[])
          : [];
        for (const att of messageAttachments) {
          if (att?.type === 'file' && att.originalName) {
            const current = versionMap.get(att.originalName) ?? 0;
            const attVersion = att.version ?? (current > 0 ? current : 1);
            versionMap.set(att.originalName, Math.max(current, attVersion));
          }
        }
      }

      return uploads.map((att) => {
        if (att.type !== 'file' || !att.originalName) {
          return att;
        }
        const nextVersion = (versionMap.get(att.originalName) ?? 0) + 1;
        versionMap.set(att.originalName, nextVersion);
        return {
          ...att,
          version: nextVersion,
        };
      });
    }

    function formatTime(date: string): string {
    return new Date(date).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function formatDate(date: string): string {
    const d = new Date(date);
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);

    if (d.toDateString() === now.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString();
  }

  function formatFileSize(bytes?: number | null): string {
    if (typeof bytes !== 'number' || !Number.isFinite(bytes)) {
      return '';
    }
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    if (bytes >= 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${bytes} B`;
  }

  // Quick edit disabled (no editing in chat)
  // Track online/offline state
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Drain outbox when back online
  useEffect(() => {
    if (!thread?.id) return;
    if (isOffline || outbox.length === 0) return;
    let cancelled = false;
    (async () => {
      // Work on a copy to avoid mutation issues during setState
      const queue = [...outbox];
      for (let i = 0; i < queue.length; i += 1) {
        if (cancelled) return;
        const item = queue[i];
        try {
          await sendMessageHook(thread.id, item.body, annotateDocumentVersions(item.attachments, messages) as unknown[]);
          setOutbox((prev) => prev.slice(1));
          await new Promise((r) => setTimeout(r, 150));
        } catch (err) {
          console.error('Outbox send failed, will retry later', err);
          break;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOffline, outbox.length, thread?.id, messages, wsSendMessage]);

  // Global Ctrl/Cmd+F to open chat search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const meta = isMac ? e.metaKey : e.ctrlKey;
      if (meta && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 0);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const matchedMessageIds = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [] as number[];
    return messages
      .filter((m) => (m.body || '').toLowerCase().includes(q))
      .map((m) => m.id);
  }, [messages, searchQuery]);

  const scrollToMatch = useCallback((index: number) => {
    const ids = matchedMessageIds;
    if (ids.length === 0) return;
    const normalized = ((index % ids.length) + ids.length) % ids.length;
    const id = ids[normalized];
    const node = messageNodeMap.current.get(id);
    if (node && scrollRef.current) {
      node.scrollIntoView({ block: 'center' });
    }
    setSearchIndex(normalized);
  }, [matchedMessageIds]);

  useEffect(() => {
    setSearchIndex(0);
    if (matchedMessageIds.length > 0) {
      scrollToMatch(0);
    }
  }, [searchQuery, matchedMessageIds.length, scrollToMatch]);

  if (loading) {
    return (
      <div className="card card-glow h-full flex flex-col overflow-hidden">
        {/* Header skeleton */}
        <div className="px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-3 animate-pulse">
            <div className="h-10 w-10 rounded-full bg-white/10" />
            <div className="flex-1 min-w-0">
              <div className="h-3 w-40 bg-white/10 rounded mb-2" />
              <div className="h-2.5 w-24 bg-white/10 rounded" />
            </div>
          </div>
        </div>
        {/* Messages skeleton */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'} animate-pulse`}>
              <div className={`max-w-[70%] ${i % 2 === 0 ? '' : ''}`}>
                <div className="h-5 w-48 bg-white/10 rounded-2xl mb-2" />
                <div className="h-5 w-64 bg-white/10 rounded-2xl" />
              </div>
            </div>
          ))}
        </div>
        {/* Input skeleton */}
        <div className="px-3 pb-3 pt-2 border-t border-white/10">
          <div className="h-12 bg-white/5 border border-white/10 rounded-2xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (error && !thread) {
    return (
      <div className="card card-glow h-full flex items-center justify-center">
        <div className="text-red-400 max-w-md text-center">
          <div className="font-semibold mb-2">Error loading conversation</div>
          <div className="text-sm text-red-300">{error}</div>
          <div className="text-xs text-red-400/70 mt-2">Check browser console for details</div>
        </div>
      </div>
    );
  }

  if (!thread || !thread.id) {
    return (
      <div className="card card-glow h-full flex items-center justify-center">
        <div className="text-white/70">No conversation selected</div>
      </div>
    );
  }

  // Get partner name - prioritize full_name, then username, then fallback
  const partnerName = partnerProfile?.full_name ||
    partnerProfile?.username || 
    partnerId.slice(0, 8);
  const partnerAvatar = partnerProfile?.avatar_url || AVATAR_FALLBACK;

  const showStatusPreference = partnerProfile?.show_online_status !== false;
  let statusLabel: string | null = null;
  let statusClasses = '';
  let statusDotClasses = '';

  if (!showStatusPreference) {
    statusLabel = 'Private online';
    statusClasses = 'bg-purple-500/20 text-purple-200 border border-purple-500/30';
    statusDotClasses = 'bg-purple-300';
  } else if (isOnline === true) {
    statusLabel = 'Online';
    statusClasses = 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
    statusDotClasses = 'bg-emerald-400';
  } else if (isOnline === false) {
    statusLabel = 'Offline';
    statusClasses = 'bg-white/10 text-white/60 border border-white/20';
    statusDotClasses = 'bg-white/40';
  } else {
    statusLabel = null;
    statusClasses = '';
    statusDotClasses = '';
  }

  return (
    <div className="card card-glow flex flex-col h-[80dvh] md:h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-3">
          {/* Mobile back */}
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="md:hidden mr-1 rounded-lg px-2 py-1 border text-sm transition bg-white/10 border-white/20 text-white/90 hover:bg-white/15"
              aria-label="Back"
            >
              ←
            </button>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={partnerAvatar}
            alt={partnerName}
            className="h-10 w-10 rounded-full object-cover border border-white/10"
          />
          <div className="min-w-0 flex-1">
            {partnerProfile?.username ? (
              <Link
                href={`/u/${partnerProfile.username}`}
                className="text-white text-sm font-medium truncate hover:text-white/80 transition"
              >
                {partnerName}
              </Link>
            ) : (
              <div className="text-white text-sm font-medium truncate">{partnerName}</div>
            )}
              {/* Typing status */}
              {partnerTyping && (
                <div className="text-xs text-white/60 mt-0.5">
                  typing...
                </div>
              )}
              <div className="flex items-center gap-1.5 flex-wrap mt-1">
                {/* Online/Offline Badge */}
                {statusLabel && (
                  <span
                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs font-medium ${statusClasses}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${statusDotClasses}`} />
                    {statusLabel}
                  </span>
                )}

                {/* Social Weight Badge */}
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium bg-blue-500/20 text-blue-300 border border-blue-500/30"
                  title="Social Weight"
                >
                  SW: {socialWeight}/100
                </span>

                {/* Trust Flow Badge */}
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium bg-purple-500/20 text-purple-300 border border-purple-500/30"
                  title="Trust Flow"
                >
                  TF: {trustFlow}%
                </span>

                {/* Days Streak Badge */}
                {daysStreak > 0 && (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium bg-orange-500/20 text-orange-300 border border-orange-500/30"
                    title="Days streak"
                  >
                    <span className="text-xs leading-none" role="img" aria-label="fire">
                      {'\uD83D\uDD25'}
                    </span>
                    {daysStreak} {daysStreak === 1 ? 'day' : 'days'}
                  </span>
                )}
              </div>
          </div>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="px-4 py-2 bg-red-500/20 text-red-400 text-sm border-b border-red-500/30">
          {error}
        </div>
      )}

      {/* Offline banner / Outbox */}
      {(isOffline || outbox.length > 0) && (
        <div className="px-4 py-2 bg-amber-500/15 text-amber-200 text-sm border-b border-amber-500/30 flex items-center justify-between">
          <div>
            {isOffline ? 'You are offline.' : 'Back online.'} Messages {isOffline ? 'will be queued' : 'in queue will be sent'} automatically.
          </div>
          {outbox.length > 0 && (
            <div className="text-[11px] text-amber-200/80">Queue: {outbox.length}</div>
          )}
        </div>
      )}

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-hidden smooth-scroll px-3 py-4"
      >
        <div ref={historySentinelRef} className="h-1 w-full" />
        {loadingOlderMessages && (
          <div className="flex justify-center mb-2">
            <div className="text-xs text-white/60 animate-pulse">Loading earlier messages...</div>
          </div>
        )}
        {historyError && (
          <div className="flex flex-col items-center mb-3 gap-1">
            <div className="text-xs text-red-300 text-center">{historyError}</div>
            <button
              type="button"
              onClick={() => void loadOlderMessages()}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/20 text-red-300 border border-red-500/40 hover:bg-red-500/25 transition"
            >
              Retry loading messages
            </button>
          </div>
        )}
        {hasMoreHistory && !loadingOlderMessages && !historyError && messages.length > 0 && (
          <div className="flex justify-center mb-3">
            <button
              type="button"
              onClick={() => void loadOlderMessages()}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 text-white/70 border border-white/20 hover:bg-white/15 transition"
            >
              Load earlier messages
            </button>
          </div>
        )}
        {messages.length === 0 ? (
          <div className="text-center text-white/50 text-sm py-8">
            No messages yet. Start the conversation!
          </div>
        ) : (
          <div className="space-y-2">
            {messages.map((msg, idx) => {
              const isMine = msg.sender_id === currentUserId;
              const prevMsg = idx > 0 ? messages[idx - 1] : null;
              const nextMsg = idx < messages.length - 1 ? messages[idx + 1] : null;
              const showDate =
                !prevMsg ||
                formatDate(prevMsg.created_at) !== formatDate(msg.created_at);
              
              // Group messages from same sender within 5 minutes
              const isGroupedWithPrev = prevMsg && 
                prevMsg.sender_id === msg.sender_id &&
                new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime() < 5 * 60 * 1000;
              
              // Show time only if minute is different from previous message
              const showTime = !isGroupedWithPrev || 
                !prevMsg ||
                new Date(prevMsg.created_at).getMinutes() !== new Date(msg.created_at).getMinutes() ||
                formatDate(prevMsg.created_at) !== formatDate(msg.created_at);

              const isSearchMatch =
                searchQuery.trim().length > 0 && (msg.body || '').toLowerCase().includes(searchQuery.trim().toLowerCase());
              const highlightBody = (text: string) => {
                const q = searchQuery.trim();
                if (!q) return text;
                const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')})`, 'gi'));
                return (
                  <>
                    {parts.map((part, i) => (
                      <span key={i} className={part.toLowerCase() === q.toLowerCase() ? 'bg-yellow-500/30' : undefined}>
                        {part}
                      </span>
                    ))}
                  </>
                );
              };

              return (
                <div key={msg.id} ref={(el) => {
                  if (el) messageNodeMap.current.set(msg.id, el);
                  else messageNodeMap.current.delete(msg.id);
                }}>
                  {showDate && (
                    <div className="text-center text-xs text-white/50 py-3">
                      <span className="bg-white/5 px-3 py-1 rounded-full border border-white/10">
                        {formatDate(msg.created_at)}
                      </span>
                    </div>
                  )}

                  <div
                    className={`group flex gap-2 ${isMine ? 'justify-end' : 'justify-start'}`}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      const msgToReply = messages.find((m) => m.id === msg.id);
                      if (msgToReply && !msg.deleted_at) {
                        setReplyingTo(msgToReply);
                      }
                    }}
                  >
                    {!isMine && !isGroupedWithPrev && (
                      <img
                        src={partnerProfile?.avatar_url || AVATAR_FALLBACK}
                        alt=""
                        className="h-8 w-8 rounded-full object-cover border border-white/10 flex-shrink-0"
                      />
                    )}
                    {!isMine && isGroupedWithPrev && <div className="w-8" />}
                    
                    <div
                      className={`max-w-[78%] flex flex-col ${
                        isMine ? 'items-end' : 'items-start'
                      }`}
                    >
                      {replyingTo?.id === msg.id && (
                        <div className={`text-xs text-white/60 mb-1 px-2 py-1 rounded-lg bg-white/5 border border-white/10 max-w-full ${isMine ? 'text-right' : 'text-left'}`}>
                          Replying to: {msg.body?.substring(0, 50)}{msg.body && msg.body.length > 50 ? '...' : ''}
                        </div>
                      )}
                      
                      <div
                        className={`relative px-4 py-2.5 rounded-2xl transition-all message-enter ${
                          isMine
                            ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-br-sm shadow-lg'
                            : 'bg-white/10 text-white rounded-bl-sm border border-white/20 shadow-md'
                        }`}
                      >
                        {/* Hover actions */}
                        <div
                          className={`absolute top-1 ${isMine ? 'right-2' : 'left-2'} z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition`}
                          style={{ pointerEvents: 'auto' }}
                        >
                          <button
                            type="button"
                            onClick={() => setReplyingTo(msg)}
                            className={[
                              'px-1.5 py-0.5 rounded border text-[11px] transition shadow-sm backdrop-blur-sm',
                              theme === 'light'
                                ? 'bg-white/80 border-black/10 text-black hover:bg-white'
                                : 'bg-white/10 border-white/20 text-white/90 hover:bg-white/15',
                            ].join(' ')}
                            title="Reply"
                          >
                            Reply
                          </button>
                          {/* Edit/Delete disabled */}
                        </div>
                        {msg.attachments && Array.isArray(msg.attachments) && msg.attachments.length > 0 && (
                          <div className="mb-2 space-y-2">
                            {(msg.attachments as any[]).map((att: any, attIdx: number) => (
                              <AttachmentPreview key={attIdx} attachment={att} />
                            ))}
                          </div>
                        )}
                        
                        {msg.deleted_at ? (
                          <div className="italic text-white/60 text-sm">
                            Message deleted
                          </div>
                        ) : msg.body && msg.body.trim() ? (
                          <div className="whitespace-pre-wrap leading-relaxed text-sm">
                            {isSearchMatch ? highlightBody(msg.body) : msg.body}
                          </div>
                        ) : msg.attachments && Array.isArray(msg.attachments) && msg.attachments.length > 0 ? (
                          null // Only show attachments if no text
                        ) : null}
                        
                        {showTime && (
                          <div className={`flex items-center gap-2 mt-1.5 ${isMine ? 'justify-end' : 'justify-start'}`}>
                            <span className="text-[10px] text-white/60">
                              {formatTime(msg.created_at)}
                            </span>
                            {msg.edited_at && (
                              <span className="text-[10px] text-white/50 italic">
                                edited
                              </span>
                            )}
                            {/* Message status indicators (only for sent messages) */}
                            {isMine && (
                              <div className="flex items-center ml-1">
                                  {(() => {
                                    const receiptStatus = messageReceipts.get(String(msg.id));
                                  
                                  if (receiptStatus === 'read') {
                                    // Double checkmark — read (blue)
                                    return (
                                      <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        viewBox="0 0 16 15"
                                        width="14"
                                        height="14"
                                        className="text-white"
                                        aria-label="Read"
                                        title="Read"
                                        fill="currentColor"
                                        style={{ minWidth: '14px' }}
                                      >
                                        <path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.879a.32.32 0 0 1-.484.033l-.358-.325a.319.319 0 0 0-.484.032l-.378.483a.418.418 0 0 0 .036.541l1.32 1.266c.143.14.361.125.484-.033l6.272-8.175a.366.366 0 0 0-.063-.51zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879a.32.32 0 0 1-.484.033L1.891 7.769a.366.366 0 0 0-.515.006l-.423.433a.364.364 0 0 0 .006.514l3.258 3.185c.143.14.361.125.484-.033l6.272-8.175a.365.365 0 0 0-.063-.51z" />
                                      </svg>
                                    );
                                  } else if (receiptStatus === 'delivered') {
                                    // Single checkmark — delivered (gray)
                                    return (
                                      <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        viewBox="0 0 16 16"
                                        width="14"
                                        height="14"
                                        className="text-white/70"
                                        aria-label="Delivered"
                                        title="Delivered"
                                        fill="currentColor"
                                        style={{ minWidth: '14px' }}
                                      >
                                        <path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z" />
                                      </svg>
                                    );
                                  } else {
                                    // Single checkmark — sent (more transparent)
                                    return (
                                      <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        viewBox="0 0 16 16"
                                        width="14"
                                        height="14"
                                        className="text-white/50"
                                        aria-label="Sent"
                                        title="Sent"
                                        fill="currentColor"
                                        style={{ minWidth: '14px' }}
                                      >
                                        <path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z" />
                                      </svg>
                                    );
                                  }
                                })()}
                              </div>
                            )}
                          </div>
                        )}
                          {/* Local echo controls: show for pending messages (id === -1) */}
                          {isMine && msg.id === -1 && (
                            <div className={`flex items-center gap-2 mt-2 ${isMine ? 'justify-end' : 'justify-start'}`}>
                              <span className={theme === 'light' ? 'text-[11px] text-black/60' : 'text-[11px] text-white/70'}>
                                {(msg as any)?.send_error ? 'Failed to send' : 'Sending…'}
                              </span>
                              <button
                                type="button"
                                className={[
                                  'px-2 py-0.5 rounded border text-[11px] transition',
                                  theme === 'light'
                                    ? 'bg-black/5 border-black/20 text-black/80 hover:bg-black/10'
                                    : 'bg-white/10 border-white/20 text-white/80 hover:bg-white/15',
                                ].join(' ')}
                                onClick={() => {
                                  // Cancel: remove local echo
                                  setMessagesFromHook((prev: any[]) =>
                                    prev.filter((m) => (m as any).client_msg_id !== (msg as any).client_msg_id)
                                  );
                                }}
                              >
                                Cancel
                              </button>
                              {(msg as any)?.send_error && (
                                <button
                                  type="button"
                                  className={[
                                    'px-2 py-0.5 rounded border text-[11px] transition',
                                    theme === 'light'
                                      ? 'bg-blue-600/10 border-blue-600/30 text-blue-700 hover:bg-blue-600/15'
                                      : 'bg-blue-500/20 border-blue-500/30 text-blue-200 hover:bg-blue-500/25',
                                  ].join(' ')}
                                  onClick={() => {
                                    // Retry: remove echo and resend with fresh client id
                                    const echoBody = msg.body || null;
                                    const echoAttachments = Array.isArray(msg.attachments)
                                      ? (msg.attachments as any[])
                                      : [];
                                    setMessagesFromHook((prev: any[]) =>
                                      prev.filter((m) => (m as any).client_msg_id !== (msg as any).client_msg_id)
                                    );
                                    void sendMessageHook(thread!.id, echoBody, echoAttachments);
                                  }}
                                >
                                  Retry
                                </button>
                              )}
                            </div>
                          )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            
            {/* Typing indicator */}
            {partnerTyping && (
              <div className="flex gap-2 justify-start">
                <img
                  src={partnerProfile?.avatar_url || AVATAR_FALLBACK}
                  alt=""
                  className="h-8 w-8 rounded-full object-cover border border-white/10 flex-shrink-0"
                />
                <div className="bg-white/10 rounded-2xl rounded-bl-sm border border-white/20 px-4 py-3">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* New messages banner */}
      <div className="pointer-events-none absolute bottom-20 left-1/2 -translate-x-1/2">
        <div
          className={[
            'transition-all duration-300 ease-out transform',
            showNewBanner && newMessagesCount > 0 && !isAtBottom
              ? 'opacity-100 translate-y-0'
              : 'opacity-0 translate-y-2',
          ].join(' ')}
          onMouseEnter={() => {
            if (bannerHideTimeoutRef.current) {
              clearTimeout(bannerHideTimeoutRef.current);
              bannerHideTimeoutRef.current = null;
            }
          }}
          onMouseLeave={() => {
            if (!isAtBottom && newMessagesCount > 0) {
              bannerHideTimeoutRef.current = setTimeout(() => setShowNewBanner(false), 3000);
            }
          }}
        >
          <button
            type="button"
            onClick={handleJumpToBottom}
            className="pointer-events-auto px-3 py-1.5 rounded-full bg-blue-500/20 border border-blue-500/30 text-blue-200 text-xs font-medium shadow-md hover:bg-blue-500/25 active:scale-[0.98] transition"
          >
            {newMessagesCount} new message{newMessagesCount === 1 ? '' : 's'} — Jump to bottom
          </button>
        </div>
      </div>


      {/* In-chat search bar */}
      {searchOpen && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-10">
          <div className="flex items-center gap-2 bg-white/10 border border-white/20 rounded-lg px-2 py-1 shadow-lg">
            <input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search in conversation"
              className="bg-transparent placeholder-white/40 text-sm text-white outline-none px-1 py-1 w-56"
            />
            <div className="text-[11px] text-white/60">
              {matchedMessageIds.length > 0 ? `${searchIndex + 1}/${matchedMessageIds.length}` : '0/0'}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/15 text-xs"
                onClick={() => scrollToMatch(searchIndex - 1)}
                disabled={matchedMessageIds.length === 0}
              >
                Prev
              </button>
              <button
                type="button"
                className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/15 text-xs"
                onClick={() => scrollToMatch(searchIndex + 1)}
                disabled={matchedMessageIds.length === 0}
              >
                Next
              </button>
              <button
                type="button"
                className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/15 text-xs"
                onClick={() => { setSearchOpen(false); setSearchQuery(''); }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Selected files preview */}
        {selectedFiles.length > 0 && (
          <div className="px-3 pt-2 pb-1 border-t border-white/10">
            <div className="flex flex-col gap-2">
              {selectedFiles.map((item) => {
                const { file, status, progress, previewUrl } = item;
                const icon = file.type.startsWith('image/')
                  ? null
                  : file.type.startsWith('video/')
                  ? '\uD83C\uDFA5'
                  : file.type.startsWith('audio/')
                  ? '\uD83C\uDFB5'
                  : '\uD83D\uDCC4';

                return (
                  <div
                    key={item.id}
                    className="relative flex items-center gap-3 px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-sm"
                  >
                    <div className="h-10 w-10 flex-shrink-0 rounded-md overflow-hidden border border-white/15 bg-white/5 flex items-center justify-center">
                      {previewUrl ? (
                        <img src={previewUrl} alt={file.name} className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-base" role="img" aria-hidden="true">
                          {icon}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-white/90 truncate">{file.name}</span>
                        <span className="text-[11px] text-white/50 shrink-0">{formatFileSize(file.size)}</span>
                      </div>
                      {status === 'uploading' && (
                        <div className="mt-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-cyan-400 transition-all"
                            style={{ width: `${Math.min(100, Math.round(progress))}%` }}
                          />
                        </div>
                      )}
                      {status === 'error' && (
                        <div className="mt-1 text-xs text-red-300">
                          {item.error || 'Failed to upload'}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveFile(item.id)}
                      className="text-white/60 hover:text-white/90 transition disabled:opacity-40"
                      title="Remove"
                      disabled={status === 'uploading'}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      {/* Reply preview */}
      {replyingTo && (
        <div className="px-4 py-2 border-t border-white/10 bg-white/5">
          <div className="flex items-start gap-2">
            <div 
              className="flex-1 min-w-0 cursor-pointer hover:bg-white/5 rounded-lg p-1 -m-1 transition"
              onClick={() => {
                // Scroll to the quoted message
                const node = messageNodeMap.current.get(replyingTo.id);
                if (node && scrollRef.current) {
                  node.scrollIntoView({ block: 'center', behavior: 'smooth' });
                  // Highlight the message briefly
                  node.style.backgroundColor = 'rgba(59, 130, 246, 0.3)';
                  setTimeout(() => {
                    node.style.backgroundColor = '';
                  }, 2000);
                }
              }}
              title="Click to scroll to quoted message"
            >
              <div className="text-xs text-white/60 mb-1.5">Replying to:</div>
              <div className="border-l-2 border-white/20 pl-3 py-1.5 bg-white/5 rounded-r-lg">
                <div className="text-xs text-white/50 mb-0.5">
                  {replyingTo.sender_id === currentUserId ? 'You' : (partnerProfile?.full_name || partnerProfile?.username || 'User')}
                </div>
                {replyingTo.deleted_at ? (
                  <div className="text-sm text-white/50 italic">Message deleted</div>
                ) : replyingTo.body ? (
                  <div className="text-sm text-white/90 whitespace-pre-wrap break-words">
                    {replyingTo.body.length > 150 ? replyingTo.body.substring(0, 150) + '...' : replyingTo.body}
                  </div>
                ) : replyingTo.attachments && Array.isArray(replyingTo.attachments) && replyingTo.attachments.length > 0 ? (
                  <div className="text-sm text-white/90">
                    {getAttachmentIcon((replyingTo.attachments[0] as any)?.type)} Attachment
                  </div>
                ) : (
                  <div className="text-sm text-white/50 italic">Empty message</div>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setReplyingTo(null)}
              className="text-white/60 hover:text-white/90 transition ml-2 flex-shrink-0"
              title="Cancel reply"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="px-3 pb-3 pt-2 border-t border-white/10 pb-[calc(env(safe-area-inset-bottom)+12px)]">
      <div
        className={`relative flex items-end gap-2 bg-white/5 border border-white/10 rounded-2xl px-2 py-2 transition ${
          isDragActive ? 'ring-2 ring-cyan-400/50 border-cyan-400/50 bg-white/10' : ''
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt"
            onChange={handleFileSelect}
            className="hidden"
          />
          {/* Attach button */}
          <button
            type="button"
            className="px-2 py-1 rounded-xl text-white/80 hover:bg-white/10 transition flex-shrink-0"
            title="Attach file, photo, or video"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending || uploadingAttachments}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
              />
            </svg>
          </button>
          <textarea
            ref={textareaRef}
            className="flex-1 bg-transparent border-0 focus:ring-0 placeholder-white/40 resize-none max-h-32 overflow-y-auto text-sm py-1"
            value={messageText}
            onChange={handleMessageTextChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder={replyingTo ? "Reply to message..." : "Type a message..."}
            disabled={uploadingAttachments || isOffline}
            rows={1}
            style={{
              height: 'auto',
              minHeight: '24px',
              fontSize: '16px', // Prevent zoom on mobile
            }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = 'auto';
              target.style.height = `${Math.min(target.scrollHeight, 128)}px`;
            }}
          />
          <div className="flex items-center gap-1 flex-shrink-0">
            <EmojiPicker onEmojiSelect={handleEmojiSelect} position="top" />
              <button
                className="btn btn-primary rounded-xl px-4 py-2 text-sm font-medium"
                onClick={handleSend}
                disabled={
                  (!messageText.trim() && selectedFiles.length === 0) ||
                  sending ||
                  uploadingAttachments ||
                  hasUploadingAttachment ||
                  isOffline
                }
              >
              {isOffline ? (
                <span className="flex items-center gap-1">
                  Offline
                </span>
              ) : uploadingAttachments ? (
                <span className="flex items-center gap-1">
                  <span className="animate-spin">?</span>
                  Uploading...
                </span>
              ) : sending ? (
                <span className="flex items-center gap-1">
                  <span className="animate-pulse">?</span>
                  Sending...
                </span>
              ) : (
                'Send'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

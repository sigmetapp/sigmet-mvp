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
import { resolveAvatarUrl } from '@/lib/utils';

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
  return String(a.id).localeCompare(String(b.id));
}

function sortMessagesChronologically(rawMessages: Message[]): Message[] {
  return [...rawMessages].sort(compareMessages);
}

function mergeMessages(existing: Message[], additions: Message[]): Message[] {
  if (additions.length === 0) {
    return existing;
  }

  const byId = new Map<string, Message>();
  for (const msg of existing) {
    byId.set(String(msg.id), msg);
  }
  for (const msg of additions) {
    byId.set(String(msg.id), msg);
  }

  return sortMessagesChronologically(Array.from(byId.values()));
}

function sanitizeMessageIdsForQuery(ids: Array<unknown>): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const raw of ids) {
    if (raw === null || raw === undefined) {
      continue;
    }

    const str = String(raw).trim();
    if (!str || str === '-1') {
      continue;
    }

    const lower = str.toLowerCase();
    if (lower === 'nan' || lower === 'undefined' || lower === 'null') {
      continue;
    }

    if (seen.has(lower)) {
      continue;
    }

    seen.add(lower);
    result.push(str);
  }

  return result;
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
  const lastMessageIdRef = useRef<string | null>(null);
  const oldestMessageIdRef = useRef<string | null>(null);

  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<SelectedAttachment[]>([]);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<{ url: string; alt: string } | null>(null);
  const [lightboxImages, setLightboxImages] = useState<Array<{ url: string; alt: string }>>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
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
    loadOlderMessages: loadOlderMessagesFromHook,
  } = useWebSocketDm(thread?.id || null, { initialLimit: INITIAL_MESSAGE_LIMIT });

  // Backward-compatible alias to avoid ReferenceError in older chunks
  const wsSendMessage = sendMessageHook;
  
  // Local state
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
  const messagesRef = useRef<Message[]>([]);
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

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

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
  function AttachmentPreview({ attachment, allAttachments, attachmentIndex }: { attachment: DmAttachment; allAttachments?: DmAttachment[]; attachmentIndex?: number }) {
    const [url, setUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [imageLoaded, setImageLoaded] = useState(false);
    const [error, setError] = useState(false);

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
      setError(false);
      setImageLoaded(false);

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
            setError(true);
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

    const handleImageClick = useCallback(async () => {
      if (!url || stableAttachment.type !== 'image') return;
      
      // Collect all image attachments for gallery
      const imageAttachments = allAttachments?.filter(att => att.type === 'image') || [attachment];
      
      // Resolve URLs for all images
      const imageUrls = await Promise.all(
        imageAttachments.map(async (att) => {
          try {
            const resolvedUrl = await resolveAttachmentUrl(att, 3600);
            return {
              url: resolvedUrl,
              alt: att.originalName ?? (att as any)?.original_name ?? 'Image'
            };
          } catch (err) {
            console.error('Error resolving attachment URL for gallery:', err);
            return {
              url: url, // Fallback to current URL
              alt: att.originalName ?? (att as any)?.original_name ?? 'Image'
            };
          }
        })
      );
      
      const currentIndex = imageAttachments.findIndex(att => 
        att.path === stableAttachment.path || 
        (att as any)?.storagePath === (stableAttachment as any)?.storagePath ||
        att.url === stableAttachment.url
      );
      
      setLightboxImages(imageUrls);
      setLightboxIndex(currentIndex >= 0 ? currentIndex : (attachmentIndex ?? 0));
      setLightboxImage({ url, alt: stableAttachment.originalName ?? (stableAttachment as any)?.original_name ?? 'Image' });
      setLightboxOpen(true);
    }, [url, stableAttachment, allAttachments, attachmentIndex]);

    if (loading) {
      return (
        <div className="relative w-64 h-64 bg-gradient-to-br from-white/5 to-white/10 rounded-xl flex items-center justify-center border border-white/10 overflow-hidden">
          <div className="absolute inset-0 bg-white/5 animate-pulse" />
          <div className="relative z-10 flex flex-col items-center gap-2">
            <div className="w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
            <div className="text-white/40 text-xs">Loading...</div>
          </div>
        </div>
      );
    }

    if (stableAttachment.type === 'image' && url) {
      return (
        <div className="relative group">
          <button
            type="button"
            onClick={handleImageClick}
            className="relative block w-full max-w-[320px] rounded-xl overflow-hidden border border-white/10 hover:border-white/20 transition-all duration-200 hover:shadow-lg hover:shadow-white/10 cursor-pointer bg-white/5"
          >
            {!imageLoaded && (
              <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-white/10 animate-pulse flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
              </div>
            )}
            <img
              src={url}
              alt={stableAttachment.originalName ?? (stableAttachment as any)?.original_name ?? 'Image'}
              className={`w-full h-auto max-h-[400px] object-cover transition-opacity duration-300 ${
                imageLoaded ? 'opacity-100' : 'opacity-0'
              }`}
              onLoad={() => setImageLoaded(true)}
              onError={() => {
                setError(true);
                setImageLoaded(false);
              }}
              loading="lazy"
            />
            {error && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/5">
                <div className="text-white/40 text-xs">Failed to load image</div>
              </div>
            )}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-200 flex items-center justify-center opacity-0 group-hover:opacity-100">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-8 h-8 text-white/80"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
              </svg>
            </div>
          </button>
        </div>
      );
    }

    if (stableAttachment.type === 'video' && url) {
      return (
        <div className="relative max-w-[320px] rounded-xl overflow-hidden border border-white/10 bg-black/20 group hover:border-white/20 transition-all duration-200">
          <video
            src={url}
            controls
            preload="metadata"
            playsInline
            className="w-full max-h-[400px] object-contain"
          />
        </div>
      );
    }

    if (!url || error) {
      return (
        <div className="px-4 py-3 bg-white/5 rounded-xl border border-white/10 text-xs text-white/60 max-w-[320px]">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            Unable to load preview.
          </div>
        </div>
      );
    }

    const displayName =
      stableAttachment.originalName ?? (stableAttachment as any)?.original_name ?? 'Document';
    return (
      <div className="px-4 py-3 bg-white/5 rounded-xl border border-white/10 max-w-[320px] text-sm text-white/80 hover:bg-white/10 transition-colors duration-200">
        <div className="flex items-start gap-3">
          <span className="text-2xl leading-none flex-shrink-0" role="img" aria-hidden="true">
            {getAttachmentIcon(stableAttachment.type)}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="font-medium truncate">{displayName}</div>
              {stableAttachment.version && (
                <span className="text-[11px] px-1.5 py-0.5 rounded bg-white/10 border border-white/20 shrink-0">
                  v{stableAttachment.version}
                </span>
              )}
            </div>
            <div className="text-[11px] text-white/50 mt-0.5">
              {formatFileSize(stableAttachment.size ?? (stableAttachment as any)?.size)}
            </div>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <a
                href={url || '#'}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 border border-white/20 hover:bg-white/15 transition text-xs"
                onClick={(e) => e.stopPropagation()}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download
              </a>
              {stableAttachment.mime === 'application/pdf' && url && (
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 border border-white/20 hover:bg-white/15 transition text-xs"
                  onClick={(e) => e.stopPropagation()}
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  Open
                </a>
              )}
            </div>
          </div>
        </div>
        {stableAttachment.mime === 'application/pdf' && url && (
          <div className="mt-3 border border-white/10 rounded-lg overflow-hidden">
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

  const updateMessageReceiptStatus = useCallback(
    (
      messageId: string,
      status: 'sent' | 'delivered' | 'read',
      source: 'ack' | 'realtime' | 'refresh' | 'bootstrap',
    ) => {
      if (!messageId) {
        return;
      }

      setMessageReceipts((prev) => {
        const previousStatus = prev.get(messageId);
        if (previousStatus === status) {
          console.debug('[DM] Receipt status unchanged', {
            messageId,
            status,
            source,
          });
          return prev;
        }

        const next = new Map(prev);
        next.set(messageId, status);
        console.log('[DM] Receipt status updated', {
          messageId,
          previousStatus,
          status,
          source,
        });
        return next;
      });

      setMessagesFromHook((prev) => {
        let changed = false;
        const updated = prev.map((msg) => {
          if (String(msg.id) !== messageId) {
            return msg;
          }

          const nextDeliveryState =
            status === 'read'
              ? 'read'
              : status === 'delivered'
                ? 'delivered'
                : 'sent';

          const currentDeliveryState = (msg as any).delivery_state;
          const currentSendError = (msg as any).send_error;

          if (currentDeliveryState === nextDeliveryState && currentSendError === undefined) {
            return msg;
          }

          changed = true;
          return {
            ...msg,
            delivery_state: nextDeliveryState,
            send_error: undefined,
          };
        });

        if (changed) {
          console.debug('[DM] Updated message delivery_state due to receipt', {
            messageId,
            status,
            source,
          });
          return updated;
        }

        return prev;
      });
    },
    [setMessageReceipts, setMessagesFromHook],
  );

  useEffect(() => {
    setMessageReceipts(new Map());
    console.debug('[DM] Reset message receipts map for thread', {
      threadId: thread?.id ?? null,
    });
  }, [thread?.id]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const dump = () => {
      const rows = Array.from(messageReceipts.entries()).map(([messageId, status]) => {
        const message = messagesRef.current.find((msg) => String(msg.id) === messageId);
        return {
          messageId,
          status,
          delivery_state: (message as any)?.delivery_state ?? null,
          sender_id: message?.sender_id ?? null,
          client_msg_id: (message as any)?.client_msg_id ?? null,
          body_preview: message?.body ? String(message.body).slice(0, 80) : null,
        };
      });
      console.groupCollapsed('[DM] Receipt debug dump');
      console.table(rows);
      console.groupEnd();
      return rows;
    };

    (window as any).__DM_RECEIPTS_DEBUG__ = {
      dump,
      entries: () => Array.from(messageReceipts.entries()),
      get: (messageId: string) => messageReceipts.get(messageId),
      size: messageReceipts.size,
      lastUpdatedAt: new Date().toISOString(),
    };
    return () => {
      if ((window as any).__DM_RECEIPTS_DEBUG__) {
        delete (window as any).__DM_RECEIPTS_DEBUG__;
      }
    };
  }, [messageReceipts, messages]);

  // Listen for message acknowledgments and update receipts
  useEffect(() => {
    if (!thread?.id || !currentUserId || !partnerId) return;

    const { getWebSocketClient } = require('@/lib/dm/websocket');
    const wsClient = getWebSocketClient();
    
      const handleAck = async (event: any) => {
        if (event.type !== 'ack' || event.thread_id !== thread.id) {
          return;
        }

        const receiptKey = String(event.message_id ?? '');
        if (!receiptKey || receiptKey === 'undefined') {
          console.warn('[DM] Received ack without a valid message_id', event);
          return;
        }

        const newStatus = (event.status as 'sent' | 'delivered' | 'read') || 'delivered';
        const clientMsgId = event.client_msg_id ?? null;

        const localMessage =
          messagesRef.current.find((msg) => String(msg.id) === receiptKey) ?? null;

        if (localMessage) {
          if (localMessage.sender_id === currentUserId) {
            updateMessageReceiptStatus(receiptKey, newStatus, 'ack');
          } else {
            console.debug('[DM] Ignoring ack for message not sent by current user', {
              messageId: receiptKey,
              senderId: localMessage.sender_id,
              currentUserId,
              status: newStatus,
              clientMsgId,
            });
          }
          return;
        }

        try {
          const { data: message } = await supabase
            .from('dms_messages')
            .select('sender_id')
            .eq('id', event.message_id)
            .eq('sender_id', currentUserId)
            .maybeSingle();

          if (message) {
            updateMessageReceiptStatus(receiptKey, newStatus, 'ack-db');
          } else {
            console.debug('[DM] Ack message not found or not sent by current user', {
              messageId: receiptKey,
              status: newStatus,
              clientMsgId,
            });
          }
        } catch (err) {
          console.error('Error verifying ack message:', err);
        }
      };

    const handleMessage = (event: any) => {
        if (event.type === 'message' && event.thread_id === thread.id) {
          const message = event.message as any;
          // If this is our message, mark it as sent on server confirmation
          // Receipts will be updated when partner acknowledges
          if (message.sender_id === currentUserId) {
              const receiptKey = String(event.server_msg_id ?? '');
              if (receiptKey && receiptKey !== 'undefined') {
                updateMessageReceiptStatus(receiptKey, 'sent', 'local');
              }

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
            if (!receipt || !receipt.message_id) {
              return;
            }

            const receiptKey = String(receipt.message_id);
            const newStatus = (receipt.status as 'sent' | 'delivered' | 'read') || 'delivered';

            const localMessage =
              messagesRef.current.find((msg) => String(msg.id) === receiptKey) ?? null;

            if (localMessage) {
              if (localMessage.sender_id === currentUserId) {
                updateMessageReceiptStatus(receiptKey, newStatus, 'realtime');
              } else {
                console.debug('[DM] Ignoring realtime receipt for partner message', {
                  messageId: receiptKey,
                  senderId: localMessage.sender_id,
                  currentUserId,
                  status: newStatus,
                });
              }
              return;
            }

            try {
              const { data: message } = await supabase
                .from('dms_messages')
                .select('sender_id')
                .eq('id', receipt.message_id)
                .eq('sender_id', currentUserId)
                .maybeSingle();

              if (message) {
                updateMessageReceiptStatus(receiptKey, newStatus, 'realtime-db');
              } else {
                console.debug('[DM] Realtime receipt not for current user message', {
                  messageId: receiptKey,
                  status: newStatus,
                });
              }
            } catch (err) {
              console.error('Error verifying receipt message:', err);
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

  // Periodically refresh receipts to ensure UI is up-to-date
  useEffect(() => {
    if (!thread?.id || !currentUserId || !partnerId) return;

    const refreshReceipts = async () => {
      try {
        // Get message IDs of messages sent by current user
        const myMessageIds = messages
          .filter((m) => m.sender_id === currentUserId && m.id !== -1)
          .map((m) => m.id);
        
        const queryMessageIds = sanitizeMessageIdsForQuery(myMessageIds);
        if (queryMessageIds.length === 0) return;
        
        // Load receipts where partner is the recipient
        const { data: receipts } = await supabase
          .from('dms_message_receipts')
          .select('message_id, status')
          .in('message_id', queryMessageIds)
          .eq('user_id', partnerId);
        
        if (receipts) {
          for (const receipt of receipts) {
            const messageId = String(receipt.message_id);
            if (!messageId || messageId === '-1') {
              continue;
            }

            const status = (receipt.status as 'sent' | 'delivered' | 'read') ?? 'delivered';
            updateMessageReceiptStatus(messageId, status, 'refresh');
          }
        }
      } catch (err) {
        console.error('Error refreshing receipts:', err);
      }
    };
    
    // Refresh immediately
    void refreshReceipts();
    
    // Refresh every 5 seconds to catch any missed updates
    const interval = setInterval(refreshReceipts, 5000);
    
    return () => clearInterval(interval);
  }, [thread?.id, currentUserId, partnerId, messages]);

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
          console.info(
            '[DM] listMessages raw',
            (messagesData || []).slice(-5).map((msg: any) => ({
              id: msg?.id ?? null,
              created_at: msg?.created_at ?? null,
              body: msg?.body ?? null
            }))
          );
        } catch (msgErr: any) {
          console.error('Error in listMessages:', msgErr, 'threadId:', threadId);
          // Continue without messages if we can't load them, but thread is valid
          messagesData = [];
        }
        if (cancelled) return;

        // Sort by created_at ascending (oldest first, newest last) and by id for consistent ordering
        const sorted = sortMessagesChronologically(messagesData);
        setMessagesFromHook(sorted);
        oldestMessageIdRef.current = sorted.length > 0 ? String(sorted[0].id) : null;
        
        const first = sorted[0];
        const last = sorted[sorted.length - 1];
        console.info('[DM] Bootstrap messages', {
          threadId,
          count: sorted.length,
          oldestId: first ? first.id : null,
          oldestAt: first ? first.created_at : null,
          newestId: last ? last.id : null,
          newestAt: last ? last.created_at : null,
          newestText: last ? (last.body ?? (last as any).text ?? null) : null,
        });
        
        // Load message receipts for messages sent by current user (to show partner's read status)
          if (sorted.length > 0 && currentUserId && partnerId) {
            try {
              // Get message IDs of messages sent by current user
              const myMessageIds = sorted
                .filter((m) => m.sender_id === currentUserId)
                .map((m) => m.id);

              const queryMessageIds = sanitizeMessageIdsForQuery(myMessageIds);

              if (queryMessageIds.length > 0) {
                // Load receipts where partner is the recipient (user_id = partnerId)
                const { data: receipts } = await supabase
                  .from('dms_message_receipts')
                  .select('message_id, status')
                  .in('message_id', queryMessageIds)
                  .eq('user_id', partnerId);
                
                if (receipts) {
                  const applied: Array<{ messageId: string; status: 'sent' | 'delivered' | 'read' }> = [];
                  for (const receipt of receipts) {
                    const messageId = String(receipt.message_id);
                    if (!messageId || messageId === '-1') {
                      continue;
                    }
                    const status = (receipt.status as 'sent' | 'delivered' | 'read') ?? 'delivered';
                    applied.push({ messageId, status });
                    updateMessageReceiptStatus(messageId, status, 'bootstrap');
                  }
                  if (applied.length > 0) {
                    console.log('[DM] Loaded receipts via bootstrap', applied);
                  }
                }
              }
            } catch (err) {
              console.error('Error loading message receipts:', err);
            }
          }
        
        // Scroll to bottom after messages are loaded (always scroll to newest messages)
        // Use multiple attempts to ensure scroll happens after DOM is fully rendered
        const scrollToBottom = () => {
          if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
          }
        };
        
        // Immediate scroll
        scrollToBottom();
        
        // Scroll after a short delay to ensure DOM is rendered
        setTimeout(() => {
          scrollToBottom();
          initialScrollDoneRef.current = true;
        }, 100);
        
        // Additional scroll after longer delay to catch any late renders
        setTimeout(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
          }
        }, 300);
          
          // Mark all messages as read when thread is opened and messages are loaded
          // This ensures that when user opens a chat, all visible messages are marked as read
          const newestMessage = sorted[sorted.length - 1] ?? null;
          const messageId =
            newestMessage && newestMessage.id !== undefined && newestMessage.id !== null
              ? String(newestMessage.id)
              : '';
          const shouldMarkRead =
            messageId &&
            messageId !== '-1' &&
            currentUserId &&
            partnerId &&
            threadId;

          if (shouldMarkRead) {
            fetch('/api/dms/messages.read', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                thread_id: String(threadId),
                up_to_message_id: messageId,
              }),
            })
              .then((response) => {
                if (response.ok) {
                  window.dispatchEvent(
                    new CustomEvent('dm:message-read', {
                      detail: {
                        threadId: String(threadId),
                        partnerId,
                      },
                    })
                  );
                } else {
                  response
                    .json()
                    .then((data) => {
                      console.error('Error marking messages as read on thread open:', data);
                    })
                    .catch(() => {
                      console.error(
                        'Error marking messages as read on thread open:',
                        response.status,
                        response.statusText
                      );
                    });
                }
              })
              .catch((err) => {
                console.error('Error marking messages as read on thread open:', err);
              });
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
        lastMessageIdRef.current = String(lastMsg.id);
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

    const lastMessageId = String(lastMessage.id);
    const isNewMessage = lastMessageId !== lastMessageIdRef.current;
    const isFromPartner = lastMessage.sender_id === partnerId && lastMessage.sender_id !== currentUserId;

    if (isNewMessage) {
      const prevLastId = lastMessageIdRef.current;
      lastMessageIdRef.current = lastMessageId;

      if (prevLastId === null) {
        return;
      }

      if (isFromPartner) {
        playIncomingNotification();
        // If user is at bottom, auto-read and keep stickiness. Otherwise, accumulate counter.
        if (thread?.id) {
          if (isAtBottom) {
            // Mark message as read via API to update receipts
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
              }
            })
            .catch((err) => {
              console.error('Error marking message as read:', err);
            });
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
    if (!thread?.id || loadingOlderMessages || !hasMoreHistory || !loadOlderMessagesFromHook) {
      return;
    }

    const currentOldest = oldestMessageIdRef.current ?? (messages[0]?.id ? String(messages[0]?.id) : null) ?? null;
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
      // Use loadOlderMessagesFromHook from the hook (loads 20 messages at a time)
      const olderMessages = await loadOlderMessagesFromHook(currentOldest);

      if (!olderMessages || olderMessages.length === 0) {
        setHasMoreHistory(false);
        return;
      }

      // Update oldest message ID
      oldestMessageIdRef.current = olderMessages[0]?.id ? String(olderMessages[0]?.id) : oldestMessageIdRef.current;

      // Restore scroll position after loading older messages
      requestAnimationFrame(() => {
        if (!scrollContainer) return;
        const newHeight = scrollContainer.scrollHeight;
        const diff = newHeight - prevHeight;
        scrollContainer.scrollTop = prevScrollTop + diff;
      });

      // If we got less than 20 messages, there are no more older messages
      if (olderMessages.length < 20) {
        setHasMoreHistory(false);
      }
    } catch (err) {
      console.error('Error loading older messages:', err);
      setHistoryError('Failed to load earlier messages.');
    } finally {
      setLoadingOlderMessages(false);
    }
  }, [thread?.id, loadingOlderMessages, hasMoreHistory, loadOlderMessagesFromHook, messages]);

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

  // Always scroll to bottom when thread changes (when opening a dialog)
  useEffect(() => {
    if (!thread?.id || !messages.length || loading) {
      return;
    }

    // Reset scroll state when thread changes
    initialScrollDoneRef.current = false;
    
    // Scroll to bottom after a short delay to ensure DOM is rendered
    // Use requestAnimationFrame to ensure DOM is fully rendered
    requestAnimationFrame(() => {
      const container = scrollRef.current;
      if (container) {
        container.scrollTop = container.scrollHeight;
        // Double-check after another short delay
        setTimeout(() => {
          if (container) {
            container.scrollTop = container.scrollHeight;
          }
          // Final check after longer delay to catch any late renders
          setTimeout(() => {
            if (container) {
              container.scrollTop = container.scrollHeight;
            }
            initialScrollDoneRef.current = true;
          }, 100);
        }, 50);
      }
    });
  }, [thread?.id, loading, messages.length]);

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
      // Use requestAnimationFrame to ensure DOM is fully rendered before scrolling
      requestAnimationFrame(() => {
        if (container) {
          container.scrollTop = container.scrollHeight;
          // Double-check after a short delay to ensure scroll happened
          setTimeout(() => {
            if (container) {
              container.scrollTop = container.scrollHeight;
            }
          }, 50);
        }
      });
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
      // Use sendMessage from lib/dms
      const { sendMessage: sendMessageLib } = await import('@/lib/dms');
      await sendMessageLib(
        threadId, 
        messageBody, 
        annotateDocumentVersions(attachments, messages) as unknown[],
        undefined // client_msg_id - will be generated by hook
      );

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
      
      // Use centralized error handling
      import('@/lib/dm/errorHandler').then(({ handleDmError, getUserFriendlyMessage }) => {
        handleDmError(err, {
          component: 'DmsChatWindow',
          action: 'send_message',
          threadId: threadId ? String(threadId) : undefined,
        });
        
        // Show user-friendly error message
        const userMessage = getUserFriendlyMessage(err);
        setError(userMessage);
      }).catch(() => {
        // Fallback if error handler not available
        setError(err?.message || 'Failed to send message');
      });
      
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
          // Use sendMessage from lib/dms
          const { sendMessage: sendMessageLib } = await import('@/lib/dms');
          await sendMessageLib(thread.id, item.body, annotateDocumentVersions(item.attachments, messages) as unknown[], undefined);
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
  const partnerAvatar = resolveAvatarUrl(partnerProfile?.avatar_url) ?? AVATAR_FALLBACK;

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
              
              // Group messages from same sender within 5 minutes (for avatar display only)
              const isGroupedWithPrev = prevMsg && 
                prevMsg.sender_id === msg.sender_id &&
                new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime() < 5 * 60 * 1000;
              
              // Always show time and status for all messages
              // This ensures users can see when each message was sent and its delivery status
              const showTime = true;

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
                  >
                    {!isMine && !isGroupedWithPrev && (
                      <img
                        src={resolveAvatarUrl(partnerProfile?.avatar_url) ?? AVATAR_FALLBACK}
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
                      <div
                        className={`relative px-4 py-2.5 rounded-2xl transition-all message-enter ${
                          isMine
                            ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-br-sm shadow-lg'
                            : 'bg-white/10 text-white rounded-bl-sm border border-white/20 shadow-md'
                        }`}
                      >
                        {msg.attachments && Array.isArray(msg.attachments) && msg.attachments.length > 0 && (
                          <div className="mb-2 space-y-2">
                            {(msg.attachments as any[]).map((att: any, attIdx: number) => (
                              <AttachmentPreview 
                                key={attIdx} 
                                attachment={att} 
                                allAttachments={msg.attachments as DmAttachment[]}
                                attachmentIndex={attIdx}
                              />
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
                        
                        {/* Always show time and status for all messages */}
                        <div className={`flex items-center gap-2 mt-1.5 ${isMine ? 'justify-end' : 'justify-start'}`}>
                          <span className="text-[10px] text-white/60">
                            {formatTime(msg.created_at)}
                          </span>
                          {msg.edited_at && (
                            <span className="text-[10px] text-white/50 italic">
                              edited
                            </span>
                          )}
                          {/* Message status indicators (always show for sent messages) */}
                          {isMine && (
                              <div className="flex items-center ml-1">
                                  {(() => {
                                    // Check for local-echo message status first
                                    const deliveryState = (msg as any).delivery_state;
                                    const sendError = (msg as any).send_error;
                                    const receiptStatus = messageReceipts.get(String(msg.id));
                                  
                                    // Failed message
                                    if (sendError || deliveryState === 'failed') {
                                      return (
                                        <svg
                                          xmlns="http://www.w3.org/2000/svg"
                                          viewBox="0 0 16 16"
                                          width="14"
                                          height="14"
                                          className="text-red-400"
                                          aria-label="Failed"
                                          title={sendError || 'Failed to send'}
                                          fill="currentColor"
                                          style={{ minWidth: '14px' }}
                                        >
                                          <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z" />
                                          <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
                                        </svg>
                                      );
                                    }
                                    
                                    // Sending message (local-echo)
                                    if (msg.id === -1 || deliveryState === 'sending') {
                                      return (
                                        <svg
                                          xmlns="http://www.w3.org/2000/svg"
                                          viewBox="0 0 16 16"
                                          width="14"
                                          height="14"
                                          className="text-white/40 animate-pulse"
                                          aria-label="Sending"
                                          title="Sending..."
                                          fill="currentColor"
                                          style={{ minWidth: '14px' }}
                                        >
                                          <circle cx="8" cy="8" r="1.5" />
                                        </svg>
                                      );
                                    }
                                    
                                    // Read status - check both receiptStatus and deliveryState
                                    // Also check if message was read by checking if it's not from partner and was acknowledged
                                    const isRead = receiptStatus === 'read' || 
                                                  (deliveryState === 'read' && msg.id !== -1);
                                    
                                    if (isRead) {
                                      // Double checkmark — read (blue/white)
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
                                    } else if (receiptStatus === 'delivered' || deliveryState === 'delivered') {
                                      // Double checkmark — delivered (gray)
                                      return (
                                        <svg
                                          xmlns="http://www.w3.org/2000/svg"
                                          viewBox="0 0 16 15"
                                          width="14"
                                          height="14"
                                          className="text-white/70"
                                          aria-label="Delivered"
                                          title="Delivered"
                                          fill="currentColor"
                                          style={{ minWidth: '14px' }}
                                        >
                                          <path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.879a.32.32 0 0 1-.484.033l-.358-.325a.319.319 0 0 0-.484.032l-.378.483a.418.418 0 0 0 .036.541l1.32 1.266c.143.14.361.125.484-.033l6.272-8.175a.366.366 0 0 0-.063-.51zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879a.32.32 0 0 1-.484.033L1.891 7.769a.366.366 0 0 0-.515.006l-.423.433a.364.364 0 0 0 .006.514l3.258 3.185c.143.14.361.125.484-.033l6.272-8.175a.365.365 0 0 0-.063-.51z" />
                                        </svg>
                                      );
                                    } else if (deliveryState === 'sent' || receiptStatus === 'sent') {
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
                                  } else {
                                    // Default: single checkmark — sent (most transparent)
                                    return (
                                      <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        viewBox="0 0 16 16"
                                        width="14"
                                        height="14"
                                        className="text-white/40"
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
                  src={resolveAvatarUrl(partnerProfile?.avatar_url) ?? AVATAR_FALLBACK}
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
                const isImage = file.type.startsWith('image/');
                const icon = isImage
                  ? null
                  : file.type.startsWith('video/')
                  ? '\uD83C\uDFA5'
                  : file.type.startsWith('audio/')
                  ? '\uD83C\uDFB5'
                  : '\uD83D\uDCC4';

                return (
                  <div
                    key={item.id}
                    className="relative flex items-center gap-3 px-3 py-2.5 bg-white/10 border border-white/20 rounded-xl text-sm hover:bg-white/15 transition-colors group"
                  >
                    <div className={`${isImage ? 'h-16 w-16' : 'h-10 w-10'} flex-shrink-0 rounded-lg overflow-hidden border border-white/15 bg-white/5 flex items-center justify-center`}>
                      {previewUrl && isImage ? (
                        <img src={previewUrl} alt={file.name} className="h-full w-full object-cover" />
                      ) : previewUrl ? (
                        <img src={previewUrl} alt={file.name} className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-base" role="img" aria-hidden="true">
                          {icon}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-white/90 truncate font-medium">{file.name}</span>
                        <span className="text-[11px] text-white/50 shrink-0">{formatFileSize(file.size)}</span>
                      </div>
                      {status === 'uploading' && (
                        <div className="mt-2 h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all duration-300 rounded-full"
                            style={{ width: `${Math.min(100, Math.round(progress))}%` }}
                          />
                        </div>
                      )}
                      {status === 'error' && (
                        <div className="mt-1 text-xs text-red-300 flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
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

      {/* Input */}
      <div className="px-3 pb-3 pt-2 border-t border-white/10 pb-[calc(env(safe-area-inset-bottom)+12px)]">
      <div
        className={`relative flex items-end gap-2 bg-white/5 border border-white/10 rounded-2xl px-3 py-2.5 transition ${
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
            className="px-2 py-1.5 rounded-xl text-white/80 hover:bg-white/10 transition flex-shrink-0 self-center"
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
            className="flex-1 bg-transparent border-0 focus:outline-none focus:ring-0 placeholder-white/40 resize-none max-h-32 overflow-y-auto text-sm text-white leading-6 py-1.5 px-1"
            value={messageText}
            onChange={handleMessageTextChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder="Type a message..."
            disabled={uploadingAttachments || isOffline}
            rows={1}
            style={{
              height: 'auto',
              minHeight: '24px',
              fontSize: '16px', // Prevent zoom on mobile
              lineHeight: '24px',
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

      {/* Lightbox Modal for Image Viewing */}
      {lightboxOpen && lightboxImage && (
        <LightboxModal
          images={lightboxImages}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxOpen(false)}
          onNavigate={(index) => setLightboxIndex(index)}
        />
      )}
    </div>
  );
}

// Lightbox Modal Component
function LightboxModal({
  images,
  currentIndex,
  onClose,
  onNavigate,
}: {
  images: Array<{ url: string; alt: string }>;
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft' && images.length > 1) {
        e.preventDefault();
        onNavigate(currentIndex > 0 ? currentIndex - 1 : images.length - 1);
      } else if (e.key === 'ArrowRight' && images.length > 1) {
        e.preventDefault();
        onNavigate(currentIndex < images.length - 1 ? currentIndex + 1 : 0);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden'; // Prevent body scroll

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [currentIndex, images.length, onClose, onNavigate]);

  const currentImage = images[currentIndex];

  if (!currentImage) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white backdrop-blur-sm"
        aria-label="Close"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Navigation buttons */}
      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onNavigate(currentIndex > 0 ? currentIndex - 1 : images.length - 1);
            }}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white backdrop-blur-sm"
            aria-label="Previous image"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onNavigate(currentIndex < images.length - 1 ? currentIndex + 1 : 0);
            }}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white backdrop-blur-sm"
            aria-label="Next image"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </>
      )}

      {/* Image counter */}
      {images.length > 1 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-sm text-white text-sm font-medium">
          {currentIndex + 1} / {images.length}
        </div>
      )}

      {/* Image container */}
      <div
        className="relative max-w-[90vw] max-h-[90vh] flex items-center justify-center p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={currentImage.url}
          alt={currentImage.alt}
          className="max-w-full max-h-full object-contain rounded-lg shadow-2xl transition-opacity duration-300"
          style={{ imageRendering: 'high-quality' }}
          loading="eager"
        />
      </div>

      {/* Download button */}
      <a
        href={currentImage.url}
        download
        onClick={(e) => e.stopPropagation()}
        className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white flex items-center gap-2 backdrop-blur-sm"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        Download
      </a>
    </div>
  );
}

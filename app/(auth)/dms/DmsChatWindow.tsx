'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { getOrCreateThread, listMessages, sendMessage, type Message, type Thread } from '@/lib/dms';
import { useDmRealtime } from '@/hooks/useDmRealtime';
import EmojiPicker from '@/components/EmojiPicker';
import { uploadAttachment, type DmAttachment, getSignedUrlForAttachment } from '@/lib/dm/attachments';
import { subscribeToThread, sendTypingIndicator } from '@/lib/dm/realtime';
import { assertThreadId } from '@/lib/dm/threadId';

type Props = {
  partnerId: string;
};

export default function DmsChatWindow({ partnerId }: Props) {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [partnerProfile, setPartnerProfile] = useState<{
    username: string | null;
    full_name: string | null;
    avatar_url: string | null;
  } | null>(null);
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [socialWeight, setSocialWeight] = useState<number>(75);
  const [trustFlow, setTrustFlow] = useState<number>(80);
  const [daysStreak, setDaysStreak] = useState<number>(0);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastMessageIdRef = useRef<number | null>(null);

  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);

  const [initialMessages, setInitialMessages] = useState<Message[]>([]);
  const [messages, setMessages] = useDmRealtime(thread?.id || null, initialMessages);
  
  // New features state
  const [isTyping, setIsTyping] = useState(false);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const presenceChannelRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const threadChannelRef = useRef<any>(null);

  const AVATAR_FALLBACK =
    "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='100%' height='100%' fill='%23222'/><circle cx='32' cy='24' r='14' fill='%23555'/><rect x='12' y='44' width='40' height='12' rx='6' fill='%23555'/></svg>";

  // Attachment preview component
  function AttachmentPreview({ attachment }: { attachment: DmAttachment }) {
    const [url, setUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
      if (attachment.path) {
        getSignedUrlForAttachment(attachment, 3600)
          .then((signedUrl) => {
            setUrl(signedUrl);
            setLoading(false);
          })
          .catch((err) => {
            console.error('Error loading attachment:', err);
            setLoading(false);
          });
      }
    }, [attachment]);

    if (loading) {
      return (
        <div className="w-48 h-48 bg-white/5 rounded-lg flex items-center justify-center border border-white/10">
          <div className="text-white/40 text-xs">Loading...</div>
        </div>
      );
    }

    if (attachment.type === 'image' && url) {
      return (
        <img
          src={url}
          alt="Attachment"
          className="max-w-[280px] max-h-[280px] rounded-lg object-cover border border-white/10"
        />
      );
    }

    if (attachment.type === 'video' && url) {
      return (
        <div className="relative max-w-[280px] max-h-[280px] rounded-lg overflow-hidden border border-white/10 bg-black/20">
          <video
            src={url}
            controls
            className="max-w-full max-h-full"
          />
        </div>
      );
    }

    return (
      <div className="px-3 py-2 bg-white/5 rounded-lg border border-white/10 flex items-center gap-2 max-w-[280px]">
        <span className="text-xl">??</span>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-white/90 truncate">File</div>
          <div className="text-[10px] text-white/60">
            {attachment.size ? `${(attachment.size / 1024).toFixed(1)} KB` : ''}
          </div>
        </div>
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
          .select('user_id, username, full_name, avatar_url')
          .eq('user_id', partnerId)
          .maybeSingle();

        if (profError) {
          console.error('Error loading profile:', profError);
          return;
        }

        if (data) {
          setPartnerProfile({
            username: data.username,
            full_name: data.full_name,
            avatar_url: data.avatar_url,
          });
        }

        // Load Social Weight (default 75)
        try {
          // For now, default value. Replace with actual query when SW table exists
          setSocialWeight(75);
        } catch {
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
  }, [partnerId, currentUserId]);

  // Subscribe to partner presence
  useEffect(() => {
    if (!partnerId) return;

    const channel = supabase.channel(`presence:${partnerId}`, {
      config: { presence: { key: partnerId } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const isPartnerOnline = !!state[partnerId]?.[0];
        setIsOnline(isPartnerOnline);
      })
      .on('presence', { event: 'join' }, () => {
        setIsOnline(true);
      })
      .on('presence', { event: 'leave' }, () => {
        setIsOnline(false);
      })
      .subscribe();

    presenceChannelRef.current = channel;

    return () => {
      channel.unsubscribe();
      presenceChannelRef.current = null;
    };
  }, [partnerId]);

  // Get or create thread and load messages
  useEffect(() => {
    if (!currentUserId || !partnerId || currentUserId === partnerId) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

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
          messagesData = await listMessages(threadId, 50);
        } catch (msgErr: any) {
          console.error('Error in listMessages:', msgErr, 'threadId:', threadId);
          // Continue without messages if we can't load them, but thread is valid
          messagesData = [];
        }
        if (cancelled) return;

        // Sort by created_at ascending (oldest first, newest last) and by id for consistent ordering
        const sorted = messagesData.sort((a, b) => {
          const timeA = new Date(a.created_at).getTime();
          const timeB = new Date(b.created_at).getTime();
          if (timeA !== timeB) return timeA - timeB;
          return a.id - b.id;
        });
        setInitialMessages(sorted);
        setMessages(sorted);
        
        // Scroll to bottom after messages are loaded
        setTimeout(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
          }
        }, 300);
        
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

  // Play sound on new messages (from partner or own messages)
  useEffect(() => {
    if (messages.length === 0 || !currentUserId || !partnerId) return;
    
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) return;
    
    // Check if this is a new message (from partner or own)
    const isNewMessage = lastMessage.id !== lastMessageIdRef.current;
    const isFromPartner = lastMessage.sender_id === partnerId && lastMessage.sender_id !== currentUserId;
    const isOwnMessage = lastMessage.sender_id === currentUserId;
    
    if (isNewMessage && (isFromPartner || isOwnMessage)) {
      const prevLastId = lastMessageIdRef.current;
      lastMessageIdRef.current = lastMessage.id;
      
      // Skip sound for the first message when loading conversation
      if (prevLastId === null) {
        return;
      }
      
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
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.3);
      } catch (err) {
        console.error('Error playing sound:', err);
      }
    }
  }, [messages, currentUserId, partnerId]);

  // Subscribe to typing indicators
  useEffect(() => {
    if (!thread?.id || !currentUserId || !partnerId) return;

    const threadId = thread.id;

    let unsubscribe: (() => void) | null = null;

    (async () => {
      try {
        unsubscribe = await subscribeToThread(threadId, {
          onTyping: (event) => {
            if (event.userId === partnerId) {
              setPartnerTyping(event.typing);
            }
          },
        });
      } catch (err) {
        console.error('Error subscribing to typing indicators:', err);
      }
    })();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [thread?.id, currentUserId, partnerId]);

  // Handle typing indicator
  const handleTyping = useCallback(() => {
    if (!thread?.id || !currentUserId || isTyping) return;

    const threadId = thread.id;

    setIsTyping(true);
    void sendTypingIndicator(threadId, currentUserId, true);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      if (thread?.id && currentUserId) {
        void sendTypingIndicator(thread.id, currentUserId, false);
      }
    }, 3000);
  }, [thread?.id, currentUserId, isTyping]);

  // Handle message text change with typing indicator
  const handleMessageTextChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setMessageText(e.target.value);
    handleTyping();
  }, [handleTyping]);

  // Scroll to bottom on new messages and when messages are initially loaded
  useEffect(() => {
    if (scrollRef.current) {
      // Use setTimeout to ensure DOM is updated
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      }, 100);
    }
  }, [messages.length]);

  // Scroll to bottom when thread changes (new conversation opened)
  useEffect(() => {
    if (thread?.id && messages.length > 0 && scrollRef.current) {
      // Delay to ensure messages are rendered
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      }, 200);
    }
  }, [thread?.id, messages.length > 0]);

  // Handle emoji selection
  const handleEmojiSelect = useCallback((emoji: string) => {
    setMessageText((prev) => prev + emoji);
  }, []);

  // Handle file selection
  function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    if (files.length > 0) {
      setSelectedFiles((prev) => [...prev, ...files]);
    }
    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  // Handle file removal
  function handleRemoveFile(index: number) {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  }

  // Handle send message with optimistic update
  async function handleSend() {
    if (!thread || !thread.id || (!messageText.trim() && selectedFiles.length === 0) || sending) return;

    const threadId = thread.id;

    const textToSend = messageText.trim();
    const replyToId = replyingTo?.id || null;
    setMessageText('');
    setReplyingTo(null);
    setSending(true);
    setUploadingAttachments(true);
    
    // Clear typing indicator
    setIsTyping(false);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    if (threadId && currentUserId) {
      void sendTypingIndicator(threadId, currentUserId, false);
    }

    let attachments: DmAttachment[] = [];

    // Upload files if any
    if (selectedFiles.length > 0) {
      try {
        attachments = await Promise.all(
          selectedFiles.map((file) => uploadAttachment(file))
        );
        setSelectedFiles([]);
      } catch (err: any) {
        console.error('Error uploading attachments:', err);
        setError(err?.message || 'Failed to upload attachments');
        setSending(false);
        setUploadingAttachments(false);
        return;
      }
    }

    setUploadingAttachments(false);

    // Optimistic update
    const optimisticMessage: Message = {
      id: Date.now(), // Temporary ID
      thread_id: threadId,
      sender_id: currentUserId!,
      kind: 'text',
      body: textToSend || null,
      attachments: attachments as unknown[],
      created_at: new Date().toISOString(),
      edited_at: null,
      deleted_at: null,
    };

    const previousMessages = messages;
    // Add optimistic message sorted by time
    const withOptimistic = [...messages, optimisticMessage].sort((a, b) => {
      const timeA = new Date(a.created_at).getTime();
      const timeB = new Date(b.created_at).getTime();
      if (timeA !== timeB) return timeA - timeB;
      return a.id - b.id;
    });
    setMessages(withOptimistic);

    try {
      // API endpoint will handle empty body with attachments automatically
      // It uses zero-width space character which is invisible
      const messageBody = textToSend || null;
      const sentMessage = await sendMessage(threadId, messageBody, attachments as unknown[]);
      // Replace optimistic message with real one and ensure proper sorting
      setMessages((prev) => {
        const updated = prev.map((m) => (m.id === optimisticMessage.id ? sentMessage : m));
        return updated.sort((a, b) => {
          const timeA = new Date(a.created_at).getTime();
          const timeB = new Date(b.created_at).getTime();
          if (timeA !== timeB) return timeA - timeB;
          return a.id - b.id;
        });
      });
      
      // Scroll to bottom after sending
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      }, 100);
    } catch (err: any) {
      console.error('Error sending message:', err);
      // Rollback on error
      setMessages(previousMessages);
      setMessageText(textToSend);
      setError(err?.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
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

  if (loading) {
    return (
      <div className="card card-glow h-full flex items-center justify-center">
        <div className="text-white/70">Loading conversation...</div>
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

  const partnerName =
    partnerProfile?.full_name ||
    partnerProfile?.username ||
    partnerId.slice(0, 8);
  const partnerAvatar = partnerProfile?.avatar_url || AVATAR_FALLBACK;

  return (
    <div className="card card-glow flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-3">
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
            <div className="flex items-center gap-1.5 flex-wrap mt-1">
              {/* Online/Offline Badge */}
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs font-medium ${
                  isOnline
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-white/10 text-white/60 border border-white/20'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isOnline ? 'bg-emerald-400' : 'bg-white/40'
                  }`}
                />
                {isOnline ? 'online' : 'offline'}
              </span>
              
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
                  <span className="text-xs leading-none" role="img" aria-label="fire">??</span>
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

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto smooth-scroll px-3 py-4"
      >
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

              return (
                <div key={msg.id}>
                  {showDate && (
                    <div className="text-center text-xs text-white/50 py-3">
                      <span className="bg-white/5 px-3 py-1 rounded-full border border-white/10">
                        {formatDate(msg.created_at)}
                      </span>
                    </div>
                  )}

                  <div
                    className={`flex gap-2 ${isMine ? 'justify-end' : 'justify-start'}`}
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
                            {msg.body}
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


      {/* Selected files preview */}
      {selectedFiles.length > 0 && (
        <div className="px-3 pt-2 pb-1 border-t border-white/10">
          <div className="flex flex-wrap gap-2">
            {selectedFiles.map((file, index) => (
              <div
                key={index}
                className="relative inline-flex items-center gap-2 px-2 py-1.5 bg-white/10 border border-white/20 rounded-lg text-sm"
              >
                {file.type.startsWith('image/') ? (
                  <span className="text-xs">??</span>
                ) : file.type.startsWith('video/') ? (
                  <span className="text-xs">??</span>
                ) : (
                  <span className="text-xs">??</span>
                )}
                <span className="text-white/90 truncate max-w-[150px]">{file.name}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveFile(index)}
                  className="text-white/60 hover:text-white/90 transition"
                  title="Remove"
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
            ))}
          </div>
        </div>
      )}

      {/* Reply preview */}
      {replyingTo && (
        <div className="px-4 py-2 border-t border-white/10 bg-white/5 flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <div className="text-xs text-white/60 mb-1">Replying to:</div>
            <div className="text-sm text-white/90 truncate">
              {replyingTo.body?.substring(0, 100)}{replyingTo.body && replyingTo.body.length > 100 ? '...' : ''}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setReplyingTo(null)}
            className="text-white/60 hover:text-white/90 transition ml-2"
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
      )}

      {/* Input */}
      <div className="px-3 pb-3 pt-2 border-t border-white/10">
        <div className="relative flex items-end gap-2 bg-white/5 border border-white/10 rounded-2xl px-2 py-2">
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
            disabled={sending || uploadingAttachments}
            rows={1}
            style={{
              height: 'auto',
              minHeight: '24px',
            }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = 'auto';
              target.style.height = `${Math.min(target.scrollHeight, 128)}px`;
            }}
          />
          <div className="flex items-center gap-1 flex-shrink-0">
            <EmojiPicker onEmojiSelect={handleEmojiSelect} />
            <button
              className="btn btn-primary rounded-xl px-4 py-2 text-sm font-medium"
              onClick={handleSend}
              disabled={(!messageText.trim() && selectedFiles.length === 0) || sending || uploadingAttachments}
            >
              {uploadingAttachments ? (
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

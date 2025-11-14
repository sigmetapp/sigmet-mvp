'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import Button from '@/components/Button';
import { getPresenceMap } from '@/lib/dm/presence';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { resolveDirectionEmoji } from '@/lib/directions';
import { useTheme } from '@/components/ThemeProvider';
import PostFeed from '@/components/PostFeed';
import { resolveAvatarUrl } from '@/lib/utils';
import GoalReactions from '@/components/GoalReactions';
import { calculateUserWeight, getRepeatCount, MIN_USER_WEIGHT } from '@/lib/trustFlow';
import TrustFlowInfoModal from '@/components/TrustFlowInfoModal';
import { X as CloseIcon } from 'lucide-react';

type Profile = {
  user_id: string;
  username: string | null;
  full_name: string | null;
  bio: string | null;
  country: string | null;
  website_url?: string | null;
  facebook_url?: string | null;
  instagram_url?: string | null;
  twitter_url?: string | null;
  avatar_url: string | null;
  directions_selected: string[] | null;
  show_online_status?: boolean | null;
  created_at?: string;
  last_activity_at?: string | null;
  relationship_status?: string | null;
  educational_institution_id?: number | null;
  date_of_birth?: string | null;
  work_career_status?: string | null;
};

type SWLevel = {
  name: string;
  minSW: number;
  maxSW?: number;
  features: string[];
  color: string;
};

type LevelColorScheme = {
  text: string;
  bg: string;
  bgGradient: string;
  border: string;
  borderGlow: string;
  badgeBg: string;
  badgeBorder: string;
  checkmark: string;
  hex: string;
};

const LEVEL_COLOR_SCHEMES: Record<string, LevelColorScheme> = {
  'Beginner': {
    text: 'text-gray-400',
    bg: 'bg-gray-500/10',
    bgGradient: 'from-gray-500/15 to-gray-600/10',
    border: 'border-gray-400/30',
    borderGlow: 'shadow-[0_0_8px_rgba(156,163,175,0.3)]',
    badgeBg: 'bg-gray-500/20',
    badgeBorder: 'border-gray-400/40',
    checkmark: 'text-gray-400',
    hex: '#9ca3af'
  },
  'Growing': {
    text: 'text-blue-400',
    bg: 'bg-blue-500/10',
    bgGradient: 'from-blue-500/15 to-blue-600/10',
    border: 'border-blue-400/30',
    borderGlow: 'shadow-[0_0_8px_rgba(96,165,250,0.3)]',
    badgeBg: 'bg-blue-500/20',
    badgeBorder: 'border-blue-400/40',
    checkmark: 'text-blue-400',
    hex: '#60a5fa'
  },
  'Advance': {
    text: 'text-purple-400',
    bg: 'bg-purple-500/10',
    bgGradient: 'from-purple-500/15 to-purple-600/10',
    border: 'border-purple-400/30',
    borderGlow: 'shadow-[0_0_8px_rgba(167,139,250,0.3)]',
    badgeBg: 'bg-purple-500/20',
    badgeBorder: 'border-purple-400/40',
    checkmark: 'text-purple-400',
    hex: '#a78bfa'
  },
  'Expert': {
    text: 'text-yellow-400',
    bg: 'bg-yellow-500/10',
    bgGradient: 'from-yellow-500/15 to-yellow-600/10',
    border: 'border-yellow-400/30',
    borderGlow: 'shadow-[0_0_8px_rgba(251,191,36,0.3)]',
    badgeBg: 'bg-yellow-500/20',
    badgeBorder: 'border-yellow-400/40',
    checkmark: 'text-yellow-400',
    hex: '#fbbf24'
  },
  'Leader': {
    text: 'text-orange-400',
    bg: 'bg-orange-500/10',
    bgGradient: 'from-orange-500/15 to-orange-600/10',
    border: 'border-orange-400/30',
    borderGlow: 'shadow-[0_0_8px_rgba(251,146,60,0.3)]',
    badgeBg: 'bg-orange-500/20',
    badgeBorder: 'border-orange-400/40',
    checkmark: 'text-orange-400',
    hex: '#fb923c'
  },
  'Angel': {
    text: 'text-pink-400',
    bg: 'bg-pink-500/10',
    bgGradient: 'from-pink-500/15 to-pink-600/10',
    border: 'border-pink-400/30',
    borderGlow: 'shadow-[0_0_8px_rgba(244,114,182,0.3)]',
    badgeBg: 'bg-pink-500/20',
    badgeBorder: 'border-pink-400/40',
    checkmark: 'text-pink-400',
    hex: '#f472b6'
  }
};

const SW_LEVELS: SWLevel[] = [
  {
    name: 'Beginner',
    minSW: 0,
    maxSW: 100,
    features: [],
    color: 'text-gray-400'
  },
  {
    name: 'Growing',
    minSW: 100,
    maxSW: 1250,
    features: [],
    color: 'text-blue-400'
  },
  {
    name: 'Advance',
    minSW: 1251,
    maxSW: 6250,
    features: [],
    color: 'text-purple-400'
  },
  {
    name: 'Expert',
    minSW: 6251,
    maxSW: 10000,
    features: [],
    color: 'text-yellow-400'
  },
  {
    name: 'Leader',
    minSW: 10000,
    maxSW: 50000,
    features: [],
    color: 'text-orange-400'
  },
  {
    name: 'Angel',
    minSW: 50000,
    features: [],
    color: 'text-pink-400'
  }
];

function getSWLevel(sw: number, levels: SWLevel[]): SWLevel {
  for (let i = levels.length - 1; i >= 0; i--) {
    if (sw >= levels[i].minSW) {
      return levels[i];
    }
  }
  return levels[0];
}

function getNextLevel(sw: number, levels: SWLevel[]): SWLevel | null {
  const currentLevel = getSWLevel(sw, levels);
  const currentIndex = levels.findIndex(level => level.name === currentLevel.name);
  if (currentIndex < levels.length - 1) {
    return levels[currentIndex + 1];
  }
  return null;
}


export default function PublicProfilePage() {
  const AVATAR_FALLBACK =
    "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='100%' height='100%' fill='%23222'/><circle cx='32' cy='24' r='14' fill='%23555'/><rect x='12' y='44' width='40' height='12' rx='6' fill='%23555'/></svg>";
  const params = useParams<{ slug: string }>();
  const slug = params?.slug as string;
  const router = useRouter();
  const { theme } = useTheme();
  const isLight = theme === "light";

  const [viewerId, setViewerId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [isSuspended, setIsSuspended] = useState<boolean>(false);
  const [iFollow, setIFollow] = useState<boolean>(false);
  const [followsMe, setFollowsMe] = useState<boolean>(false);
  const [updatingFollow, setUpdatingFollow] = useState(false);
  const [followersCount, setFollowersCount] = useState<number>(0);
  const [followingCount, setFollowingCount] = useState<number>(0);
  const [referralsCount, setReferralsCount] = useState<number>(0);
  const [connectionsCount, setConnectionsCount] = useState<number>(0);
  const [recentSocial, setRecentSocial] = useState<
    { kind: 'in' | 'out'; otherUserId: string; created_at?: string }[]
  >([]);
  const [activeTab, setActiveTab] = useState<'info' | 'goals'>('info');
  const [userGoals, setUserGoals] = useState<Array<{ id: string; text: string; target_date: string | null }>>([]);
  const [goalReactions, setGoalReactions] = useState<Record<string, { count: number; selected: boolean }>>({});
  // Trust Flow state (actual TF value, not percentage)
  const [trustFlow, setTrustFlow] = useState<number>(0);
  const [trustFlowColor, setTrustFlowColor] = useState<string>('gray');
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [trustFlowInfoOpen, setTrustFlowInfoOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackPending, setFeedbackPending] = useState(false);
  const [pushType, setPushType] = useState<'positive' | 'negative' | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<
    Array<{
      type: 'feedback' | 'profile_change';
      author_id: string | null;
      value?: number;
      field_name?: string;
      old_value?: string | null;
      new_value?: string | null;
      comment: string | null;
      created_at?: string;
      // Admin-only TF details
      tfDetails?: {
        weight: number;
        repeatCount: number;
        effectiveWeight: number;
        contribution: number;
        pushType: 'positive' | 'negative';
      };
    }>
  >([]);
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [presenceChannel, setPresenceChannel] = useState<RealtimeChannel | null>(null);

  // avatar upload (own profile)
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  // Badges state
  const [displayedBadges, setDisplayedBadges] = useState<
    Array<{ id: string; name: string; emoji: string; description: string }>
  >([]);

  // SW (Social Weight) state
  const [totalSW, setTotalSW] = useState<number | null>(null);
  const [loadingSW, setLoadingSW] = useState(false);
  const [swLevels, setSwLevels] = useState<SWLevel[]>(SW_LEVELS); // Start with default levels
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  const isMe = useMemo(() => {
    if (!viewerId || !profile) return false;
    return viewerId === profile.user_id;
  }, [viewerId, profile]);

  useEffect(() => {
    // resolve viewer id
    supabase.auth.getUser().then(({ data }) => setViewerId(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    // Check if user is admin
    if (!viewerId) {
      setIsAdmin(false);
      return;
    }
    supabase.rpc('is_admin_uid').then(({ data, error }) => {
      if (error) {
        console.error('Error checking admin status:', error);
        setIsAdmin(false);
      } else {
        setIsAdmin(data ?? false);
      }
    });
  }, [viewerId]);

  // Helper function to check if user is online based on last_activity_at
  const isOnlineByActivity = (lastActivityAt: string | null | undefined): boolean => {
    if (!lastActivityAt) return false;
    const lastActivity = new Date(lastActivityAt);
    const now = new Date();
    const diffInMinutes = (now.getTime() - lastActivity.getTime()) / (1000 * 60);
    return diffInMinutes < 5; // Online if activity was within last 5 minutes
  };

  // Track online status for the viewed profile
  useEffect(() => {
    if (!profile?.user_id) return;

    // Check if user wants to show online status
    const showStatus = profile.show_online_status !== false;
    
    console.log('[Online Status] Profile check:', {
      userId: profile.user_id,
      username: profile.username,
      show_online_status: profile.show_online_status,
      showStatus,
      last_activity_at: profile.last_activity_at,
    });

    if (!showStatus) {
      // User has privacy setting - show as "Private online"
      console.log('[Online Status] Privacy setting enabled - showing "Private online"');
      setIsOnline(null);
      return;
    }

    // Helper function to check online status (presence OR activity within 5 minutes)
    const checkOnlineStatus = (presenceOnline: boolean, lastActivityAt?: string | null): boolean => {
      const activityOnline = isOnlineByActivity(lastActivityAt);
      const isOnline = presenceOnline || activityOnline;
      console.log('[Online Status] Status check:', {
        presenceOnline,
        activityOnline,
        lastActivityAt,
        isOnline,
      });
      return isOnline;
    };

    // Subscribe to presence channel for this user
    const channelName = `presence:${profile.user_id}`;
    console.log('[Online Status] Subscribing to channel:', channelName);
    const channel = supabase.channel(channelName);
    
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        console.log('[Online Status] Presence sync event:', { state });
        const presenceOnline = Object.keys(state).length > 0 && 
          Object.values(state).some((presences: any[]) => 
            presences.some((p: any) => p.online === true)
          );
        const finalStatus = checkOnlineStatus(presenceOnline, profile.last_activity_at);
        console.log('[Online Status] Sync result - presenceOnline:', presenceOnline, 'finalStatus:', finalStatus);
        setIsOnline(finalStatus);
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        console.log('[Online Status] Presence join event:', { key, newPresences });
        const presenceOnline = newPresences.some((p: any) => p.online === true);
        const finalStatus = checkOnlineStatus(presenceOnline, profile.last_activity_at);
        if (finalStatus) {
          console.log('[Online Status] User joined as online');
          setIsOnline(true);
        } else {
          setIsOnline(false);
        }
      })
      .on('presence', { event: 'leave' }, () => {
        console.log('[Online Status] Presence leave event');
        // Check if any presence remains
        const state = channel.presenceState();
        const presenceOnline = Object.keys(state).length > 0 && 
          Object.values(state).some((presences: any[]) => 
            presences.some((p: any) => p.online === true)
          );
        const finalStatus = checkOnlineStatus(presenceOnline, profile.last_activity_at);
        console.log('[Online Status] Leave result - presenceOnline:', presenceOnline, 'finalStatus:', finalStatus);
        setIsOnline(finalStatus);
      })
      .subscribe((status) => {
        console.log('[Online Status] Channel subscription status:', status);
      });

    setPresenceChannel(channel);

    // Initial check
    (async () => {
      try {
        console.log('[Online Status] Performing initial presence check');
        const state = await getPresenceMap(profile.user_id);
        console.log('[Online Status] Initial presence state:', state);
        const presenceOnline = Object.keys(state).length > 0 && 
          Object.values(state).some((presences: any[]) => 
            presences.some((p: any) => p.online === true)
          );
        const finalStatus = checkOnlineStatus(presenceOnline, profile.last_activity_at);
        console.log('[Online Status] Initial check result - presenceOnline:', presenceOnline, 'finalStatus:', finalStatus);
        setIsOnline(finalStatus);
      } catch (error) {
        console.error('[Online Status] Initial check error:', error);
        // Fallback to activity-based check
        const activityOnline = isOnlineByActivity(profile.last_activity_at);
        setIsOnline(activityOnline);
      }
    })();

    // Poll for last_activity_at updates every 30 seconds
    const activityPollInterval = setInterval(async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('last_activity_at')
          .eq('user_id', profile.user_id)
          .maybeSingle();
        
        if (data) {
          const newLastActivityAt = (data as any).last_activity_at;
          if (newLastActivityAt !== profile.last_activity_at) {
            // Update profile with new last_activity_at
            setProfile((prev) => prev ? { ...prev, last_activity_at: newLastActivityAt } : null);
            
            // Recheck online status
            const state = channel.presenceState();
            const presenceOnline = Object.keys(state).length > 0 && 
              Object.values(state).some((presences: any[]) => 
                presences.some((p: any) => p.online === true)
              );
            const finalStatus = checkOnlineStatus(presenceOnline, newLastActivityAt);
            setIsOnline(finalStatus);
          }
        }
      } catch (error) {
        console.error('[Online Status] Error polling activity:', error);
      }
    }, 30000);

    return () => {
      channel.unsubscribe();
      setPresenceChannel(null);
      clearInterval(activityPollInterval);
    };
  }, [profile?.user_id, profile?.show_online_status, profile?.last_activity_at]);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      setLoadingProfile(true);
      setIsSuspended(false); // Reset suspended status when loading new profile
      // If slug looks like a UUID, resolve by id and redirect to username
      const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(slug);
      if (uuidLike) {
        const { data } = await supabase
          .from('profiles')
          .select('user_id, username, last_activity_at')
          .eq('user_id', slug)
          .maybeSingle();
        const prof = (data as unknown as Profile) || null;
        if (prof?.username && prof.username.trim() !== '') {
          router.replace(`/u/${encodeURIComponent(prof.username)}`);
          return; // keep loading until navigation
        }
        // No username – treat as not found
        setProfile(null);
        setLoadingProfile(false);
        return;
      }

      // Otherwise, resolve strictly by username
      const { data } = await supabase
        .from('profiles')
        .select('user_id, username, full_name, bio, country, website_url, facebook_url, instagram_url, twitter_url, avatar_url, directions_selected, show_online_status, created_at, last_activity_at, relationship_status, educational_institution_id, date_of_birth, work_career_status')
        .eq('username', slug)
        .maybeSingle();
      const profileData = ((data as unknown) as Profile) || null;
      setProfile(profileData);
      
      // Load suspended status if profile exists
      if (profileData?.user_id) {
        try {
          const statusResp = await fetch(`/api/user/${profileData.user_id}/status`);
          if (statusResp.ok) {
            const statusData = await statusResp.json();
            setIsSuspended(statusData.suspended === true);
          }
        } catch (err) {
          console.error('Error loading suspended status:', err);
          setIsSuspended(false);
        }
      }
      
      // Load educational institution if exists
      if (profileData?.educational_institution_id) {
        const { data: inst } = await supabase
          .from('educational_institutions')
          .select('name, type')
          .eq('id', profileData.educational_institution_id)
          .maybeSingle();
        if (inst) {
          setEducationalInstitution({ name: inst.name, type: inst.type });
        } else {
          setEducationalInstitution(null);
        }
      } else {
        setEducationalInstitution(null);
      }
      
      setLoadingProfile(false);
    })();
  }, [slug, router]);


  // Load Trust Flow score - now uses cached value for fast loading
  useEffect(() => {
    if (!profile?.user_id) return;
    (async () => {
      try {
        console.log('[Trust Flow] Loading TF for user:', profile.user_id);
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          console.log('[Trust Flow] No session, setting to base value');
          setTrustFlow(5.0); // BASE_TRUST_FLOW
          setTrustFlowColor('gray');
          return;
        }

        // Load from cache first (fast), API will auto-recalculate if needed
        // Force recalculation if we suspect the value might be stale (base value 5.0)
        console.log('[Trust Flow] Fetching TF from API...');
        const res = await fetch(`/api/users/${profile.user_id}/trust-flow?recalculate=true`, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
          },
          cache: 'no-store',
        });

        console.log('[Trust Flow] API response status:', res.status);

        if (res.ok) {
          const data = await res.json();
          console.log('[Trust Flow] API response data:', JSON.stringify(data, null, 2));
          // Ensure we have a valid trustFlow value (should be at least 5.0)
          const tfValue = data.trustFlow && typeof data.trustFlow === 'number' && data.trustFlow > 0 
            ? data.trustFlow 
            : 5.0; // BASE_TRUST_FLOW fallback
          console.log('[Trust Flow] Setting TF to:', tfValue, '(raw value:', data.trustFlow, ')');
          setTrustFlow(tfValue);
          setTrustFlowColor(data.color || 'gray');
        } else {
          // Use base Trust Flow value (5.0) instead of 0 on error
          const errorText = await res.text();
          console.error('[Trust Flow] API error:', res.status, errorText);
          setTrustFlow(5.0); // BASE_TRUST_FLOW
          setTrustFlowColor('gray');
        }
      } catch (error) {
        console.error('[Trust Flow] Fetch error:', error);
        // Use base Trust Flow value (5.0) instead of 0 on error
        setTrustFlow(5.0); // BASE_TRUST_FLOW
        setTrustFlowColor('gray');
      }
    })();
  }, [profile?.user_id]);

  // Load recent follow actions (last 5)
  useEffect(() => {
    if (!profile?.user_id) return;
    (async () => {
      try {
        const { data } = await supabase
          .from('follows')
          .select('follower_id, followee_id, created_at')
          .or(`follower_id.eq.${profile.user_id},followee_id.eq.${profile.user_id}`)
          .order('created_at', { ascending: false })
          .limit(5);
        const rows = (data as any[]) || [];
        const mapped: { kind: 'in' | 'out'; otherUserId: string; created_at?: string }[] = [];
        for (const r of rows) {
          if (r.followee_id === profile.user_id) {
            mapped.push({ kind: 'in', otherUserId: r.follower_id as string, created_at: r.created_at });
          } else if (r.follower_id === profile.user_id) {
            mapped.push({ kind: 'out', otherUserId: r.followee_id as string, created_at: r.created_at });
          }
        }
        setRecentSocial(mapped);
      } catch {
        setRecentSocial([]);
      }
    })();
  }, [profile?.user_id]);


  useEffect(() => {
    if (!viewerId || !profile?.user_id || viewerId === profile.user_id) return;
    (async () => {
      try {
        const [{ data: f1 }, { data: f2 }] = await Promise.all([
          supabase.from('follows').select('followee_id').eq('follower_id', viewerId).eq('followee_id', profile.user_id).limit(1),
          supabase.from('follows').select('follower_id').eq('followee_id', viewerId).eq('follower_id', profile.user_id).limit(1),
        ]);
        setIFollow(!!(f1 && (f1 as any[]).length > 0));
        setFollowsMe(!!(f2 && (f2 as any[]).length > 0));
      } catch {
        setIFollow(false);
        setFollowsMe(false);
      }
    })();
  }, [viewerId, profile?.user_id]);

  // Load social counts
  useEffect(() => {
    if (!profile?.user_id) return;
    (async () => {
      try {
        const [followersRes, followingRes, referralsRes] = await Promise.all([
          supabase
            .from('follows')
            .select('follower_id', { count: 'exact', head: true })
            .eq('followee_id', profile.user_id),
          supabase
            .from('follows')
            .select('followee_id', { count: 'exact', head: true })
            .eq('follower_id', profile.user_id),
          supabase
            .from('invites')
            .select('code', { count: 'exact', head: true })
            .eq('creator', profile.user_id)
            .gt('uses', 0),
        ]);
        setFollowersCount(followersRes.count || 0);
        setFollowingCount(followingRes.count || 0);
        setReferralsCount(referralsRes.count || 0);

        // Calculate connections (mutual follows): people who follow the user AND are followed by the user
        const [followersData, followingData] = await Promise.all([
          supabase
            .from('follows')
            .select('follower_id')
            .eq('followee_id', profile.user_id),
          supabase
            .from('follows')
            .select('followee_id')
            .eq('follower_id', profile.user_id),
        ]);

        if (followersData.data && followingData.data) {
          const followersSet = new Set(followersData.data.map((f: any) => f.follower_id));
          const followingSet = new Set(followingData.data.map((f: any) => f.followee_id));
          
          // Find intersection: people who are both followers and following
          let connections = 0;
          followersSet.forEach((followerId) => {
            if (followingSet.has(followerId)) {
              connections++;
            }
          });
          setConnectionsCount(connections);
        } else {
          setConnectionsCount(0);
        }
      } catch {
        setFollowersCount(0);
        setFollowingCount(0);
        setReferralsCount(0);
        setConnectionsCount(0);
      }
    })();
  }, [profile?.user_id]);

  // Load user goals
  useEffect(() => {
    if (!profile?.user_id) return;
    (async () => {
      try {
        // Load goals from profiles JSON field
        const { data: profileData } = await supabase
          .from('profiles')
          .select('goals')
          .eq('user_id', profile.user_id)
          .maybeSingle();
        
        if (profileData?.goals && Array.isArray(profileData.goals)) {
          const goals = profileData.goals.map((g: any) => ({
            id: g.id || Date.now().toString() + Math.random(),
            text: g.text || '',
            target_date: g.target_date || null
          }));
          setUserGoals(goals);
          
          // Load reactions for all goals
          if (goals.length > 0) {
            const goalIds = goals.map(g => g.id);
            const { data: { user } } = await supabase.auth.getUser();
            
            const { data: reactions } = await supabase
              .from('goal_reactions')
              .select('goal_id, kind, user_id')
              .eq('goal_user_id', profile.user_id)
              .in('goal_id', goalIds);
            
            const reactionsMap: Record<string, { count: number; selected: boolean }> = {};
            goalIds.forEach(goalId => {
              const goalReactions = (reactions || []).filter(r => r.goal_id === goalId && r.kind === 'inspire');
              reactionsMap[goalId] = {
                count: goalReactions.length,
                selected: user ? goalReactions.some(r => r.user_id === user.id) : false
              };
            });
            setGoalReactions(reactionsMap);
          }
        } else {
          setUserGoals([]);
          setGoalReactions({});
        }
      } catch (err) {
        console.error('Error loading goals:', err);
        setUserGoals([]);
        setGoalReactions({});
      }
    })();
  }, [profile?.user_id]);

  // Load displayed badges
  useEffect(() => {
    if (!profile?.user_id) return;
    (async () => {
      try {
        // Get display preferences for this user
        const { data: displayPrefs } = await supabase
          .from('badge_display_preferences')
          .select('displayed_badges')
          .eq('user_id', profile.user_id)
          .maybeSingle();

        const displayedBadgeIds = displayPrefs?.displayed_badges || [];

        if (displayedBadgeIds.length === 0) {
          setDisplayedBadges([]);
          return;
        }

        // Get badge types for displayed badges
        const { data: badgeTypes } = await supabase
          .from('badge_types')
          .select('id, name, emoji, description')
          .in('id', displayedBadgeIds)
          .order('sort_order', { ascending: true });

        // Verify these badges are actually earned by this user
        const { data: earnedBadges } = await supabase
          .from('user_badges')
          .select('badge_id')
          .eq('user_id', profile.user_id)
          .in('badge_id', displayedBadgeIds);

        const earnedBadgeIds = new Set((earnedBadges || []).map((b) => b.badge_id));

        // Filter to only show earned badges
        const filtered = (badgeTypes || []).filter((bt) => earnedBadgeIds.has(bt.id));

        setDisplayedBadges(filtered);
      } catch {
        setDisplayedBadges([]);
      }
    })();
  }, [profile?.user_id]);

  // Load SW (Social Weight) data
  useEffect(() => {
    if (!profile?.user_id) return;
    (async () => {
      setLoadingSW(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          setTotalSW(null);
          setLoadingSW(false);
          return;
        }

        // Try to get SW from cache first (sw_scores table)
        const { data: swScore, error: swScoreError } = await supabase
          .from('sw_scores')
          .select('total, last_updated')
          .eq('user_id', profile.user_id)
          .single();

        // Check if cached data is fresh (less than 15 minutes old)
        const isStale = !swScore || !swScore.last_updated || 
          (Date.now() - new Date(swScore.last_updated).getTime()) > (15 * 60 * 1000);

        if (swScore && !isStale) {
          // Use cached data - it's fresh
          setTotalSW(swScore.total || 0);
          setLoadingSW(false); // Stop loading immediately
        } else {
          // Show cached data immediately (even if stale) for fast UI
          if (swScore?.total !== undefined) {
            setTotalSW(swScore.total);
            setLoadingSW(false); // Stop loading immediately when showing cached data
          }
          
          // Trigger background recalculation (don't wait for it)
          fetch(`/api/sw/recalculate`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ user_id: profile.user_id }),
          })
          .then(res => res.json())
          .then(data => {
            // Update UI when recalculation completes
            if (data.totalSW !== undefined) {
              setTotalSW(data.totalSW);
            }
          })
          .catch(() => {
            // Ignore errors in background recalculation
          });
        }
        
        // Load SW levels from weights (separate lightweight call, don't wait for it)
        fetch('/api/sw/weights', {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        })
        .then(res => res.ok ? res.json() : null)
        .then(weightsData => {
          if (weightsData?.sw_levels) {
            try {
              const mappedLevels = weightsData.sw_levels.map((level: any, index: number) => {
                const defaultLevel = SW_LEVELS.find(l => l.name === level.name) || SW_LEVELS[index] || SW_LEVELS[0];
                return {
                  name: level.name || defaultLevel.name,
                  minSW: level.minSW ?? defaultLevel.minSW,
                  maxSW: level.maxSW ?? defaultLevel.maxSW,
                  features: defaultLevel.features,
                  color: defaultLevel.color,
                };
              });
              
              if (mappedLevels.length > 0) {
                setSwLevels(mappedLevels);
              }
            } catch (err) {
              console.error('Error parsing sw_levels:', err);
            }
          }
        })
        .catch(() => {
          // Ignore errors
        });
      } catch (error) {
        console.error('Error loading SW:', error);
        setTotalSW(null);
        setLoadingSW(false);
      }
    })();
  }, [profile?.user_id]);

  async function toggleFollow() {
    if (!viewerId || !profile?.user_id || viewerId === profile.user_id) return;
    setUpdatingFollow(true);
    try {
      if (!iFollow) {
        const { error } = await supabase.from('follows').insert({ follower_id: viewerId, followee_id: profile.user_id });
        if (!error) setIFollow(true);
      } else {
        const { error } = await supabase
          .from('follows')
          .delete()
          .eq('follower_id', viewerId)
          .eq('followee_id', profile.user_id);
        if (!error) setIFollow(false);
      }
    } finally {
      setUpdatingFollow(false);
    }
  }

  async function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !isMe) return;
    setAvatarUploading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const me = auth.user?.id;
      if (!me) return;
      const path = `${me}/avatar.png`;
      const bucket = supabase.storage.from('avatars');
      const { error: upErr } = await bucket.upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data } = bucket.getPublicUrl(path);
      const url = data.publicUrl;
      await supabase.from('profiles').upsert({ user_id: me, avatar_url: url }, { onConflict: 'user_id' });
      setProfile((p) => (p ? { ...p, avatar_url: url } : p));
    } catch (e) {
      // no-op
    } finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  }

  function trustBarStyleFor(tf: number): React.CSSProperties {
    // Calculate bar width based on TF value
    // For display purposes, map TF to 0-100% width:
    // - Negative TF: 0-30% width
    // - 0-10 TF: 30-50% width
    // - 10-40 TF: 50-70% width
    // - 40-100 TF: 70-90% width
    // - 100+ TF: 90-100% width
    let widthPercent = 0;
    if (tf < 0) {
      widthPercent = Math.max(0, Math.min(30, 30 + (tf / 5) * 10));
    } else if (tf < 10) {
      widthPercent = 30 + (tf / 10) * 20;
    } else if (tf < 40) {
      widthPercent = 50 + ((tf - 10) / 30) * 20;
    } else if (tf < 100) {
      widthPercent = 70 + ((tf - 40) / 60) * 20;
    } else {
      widthPercent = 90 + Math.min(10, ((tf - 100) / 100) * 10);
    }
    
    // Get color based on TF value
    let background = 'linear-gradient(90deg, #9ca3af, #6b7280)'; // gray (default)
    if (tf < 0) {
      background = 'linear-gradient(90deg, #ef4444, #dc2626)'; // red
    } else if (tf >= 0 && tf < 10) {
      background = 'linear-gradient(90deg, #9ca3af, #6b7280)'; // gray
    } else if (tf >= 10 && tf < 40) {
      background = 'linear-gradient(90deg, #fbbf24, #f59e0b)'; // yellow
    } else if (tf >= 40 && tf < 100) {
      background = 'linear-gradient(90deg, #10b981, #059669)'; // green
    } else {
      background = 'linear-gradient(90deg, #6366f1, #8b5cf6)'; // blue/purple
    }
    
    return { width: `${Math.max(0, Math.min(100, widthPercent))}%`, background };
  }

  async function submitFeedback(kind: 'up' | 'down') {
    if (!profile?.user_id) return;
    
    // Validate message field: required, minimum 100 characters
    if (!feedbackText || feedbackText.trim().length < 100) {
      alert('Please provide a message with at least 100 characters explaining your push.');
      return;
    }
    
    setFeedbackPending(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const me = auth.user?.id || null;
      
      // Prevent users from giving feedback to themselves
      if (me === profile.user_id) {
        setFeedbackPending(false);
        setFeedbackOpen(false);
        setFeedbackText('');
        setPushType(null);
        return;
      }
      
      if (!me) {
        setFeedbackPending(false);
        return;
      }
      
      // Check if user can push (anti-gaming)
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setFeedbackPending(false);
        return;
      }
      
      try {
        const canPushRes = await fetch(`/api/users/${profile.user_id}/trust-push/check`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ fromUserId: me }),
        });
        
        if (canPushRes.ok) {
          const canPushData = await canPushRes.json();
          if (!canPushData.canPush) {
            alert(canPushData.reason || 'Cannot submit push at this time');
            setFeedbackPending(false);
            return;
          }
        }
      } catch (checkError) {
        console.error('Error checking push limit:', checkError);
        // Continue anyway - don't block on check error
      }
      
      // Insert into trust_pushes table
      try {
        const { data: insertData, error: insertError } = await supabase
          .from('trust_pushes')
          .insert({
            from_user_id: me,
            to_user_id: profile.user_id,
            type: kind === 'up' ? 'positive' : 'negative',
            reason: feedbackText || null,
          })
          .select()
          .single();
        
        if (insertError) {
          console.error('Error inserting trust push:', insertError);
          alert('Failed to submit feedback. Please try again.');
          setFeedbackPending(false);
          return;
        }
        
        if (!insertData) {
          console.error('No data returned from trust push insert');
          alert('Failed to submit feedback. Please try again.');
          setFeedbackPending(false);
          return;
        }
        
        console.log('[Trust Push] Trust push inserted successfully:', insertData.id, 'type:', insertData.type, 'from:', insertData.from_user_id, 'to:', insertData.to_user_id);
        
        // Verify the push was actually saved by reading it back immediately
        // This ensures the transaction is committed
        const { data: verifyData, error: verifyError } = await supabase
          .from('trust_pushes')
          .select('id, type, created_at')
          .eq('id', insertData.id)
          .single();
        
        if (verifyError || !verifyData) {
          console.error('[Trust Push] Failed to verify push was saved:', verifyError);
          // Continue anyway - the insert might have succeeded even if verify failed
        } else {
          console.log('[Trust Push] Push verified in database:', verifyData.id, 'created_at:', verifyData.created_at);
        }
      } catch (insertErr) {
        console.error('[Trust Push] Exception inserting trust push:', insertErr);
        alert('Failed to submit feedback. Please try again.');
        setFeedbackPending(false);
        return;
      }
      
      setFeedbackOpen(false);
      setFeedbackText('');
      setPushType(null);
      
      // Wait a bit to ensure database commit before recalculating
      console.log('[Trust Push] Waiting for database commit...');
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Recalculate Trust Flow - API will now save to cache automatically
      // Use recalculate=true to force recalculation after push
      // Pass pushId so metadata can be saved in history
      let retries = 3;
      let recalculated = false;
      
      while (retries > 0 && !recalculated) {
        try {
          console.log(`[Trust Push] Recalculating Trust Flow (attempt ${4 - retries}/3)...`);
          const res = await fetch(`/api/users/${profile.user_id}/trust-flow?recalculate=true&pushId=${insertData.id}`, {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          });

          if (res.ok) {
            const data = await res.json();
            // Ensure we have a valid trustFlow value (should be at least 5.0)
            const tfValue = data.trustFlow && typeof data.trustFlow === 'number' && data.trustFlow > 0 
              ? data.trustFlow 
              : 5.0; // BASE_TRUST_FLOW fallback
            console.log('[Trust Push] Trust Flow recalculated and cached successfully:', tfValue, 'previous:', trustFlow);
            setTrustFlow(tfValue);
            setTrustFlowColor(data.color || 'gray');
            recalculated = true;
          } else {
            const errorText = await res.text();
            console.error('[Trust Push] Error recalculating Trust Flow:', res.status, errorText);
            retries--;
            if (retries > 0) {
              // Wait before retry
              const delay = 500;
              console.log(`[Trust Push] Retrying in ${delay}ms...`);
              await new Promise(resolve => setTimeout(resolve, delay));
            } else {
              // After all retries failed, use base value
              console.warn('[Trust Push] All retries failed, using base Trust Flow value');
              setTrustFlow(5.0); // BASE_TRUST_FLOW
              setTrustFlowColor('gray');
            }
          }
        } catch (recalcErr) {
          console.error('[Trust Push] Error recalculating Trust Flow:', recalcErr);
          retries--;
          if (retries > 0) {
            const delay = 500;
            console.log(`[Trust Push] Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          } else {
            console.warn('[Trust Push] All retries failed, using base Trust Flow value');
            setTrustFlow(5.0); // BASE_TRUST_FLOW
            setTrustFlowColor('gray');
          }
        }
      }
      
      if (!recalculated) {
        console.warn('Failed to recalculate Trust Flow after retries, using base value');
        // Ensure we have at least base value
        if (trustFlow === 0) {
          setTrustFlow(5.0); // BASE_TRUST_FLOW
          setTrustFlowColor('gray');
        }
      }
    } finally {
      setFeedbackPending(false);
    }
  }

  async function openHistory() {
    if (!isMe || !profile?.user_id) return;
    setHistoryOpen(true);
    try {
      // Load trust pushes, profile changes, and trust_flow_history (for saved metadata)
      const [pushesRes, changesRes, historyRes] = await Promise.all([
        supabase
          .from('trust_pushes')
          .select('id, from_user_id, type, reason, created_at')
          .eq('to_user_id', profile.user_id)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('profile_changes')
          .select('editor_id, field_name, old_value, new_value, comment, created_at')
          .eq('target_user_id', profile.user_id)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('trust_flow_history')
          .select('push_id, metadata')
          .eq('user_id', profile.user_id)
          .not('push_id', 'is', null),
      ]);
      
      // Create a map of push_id to saved metadata
      const savedMetadataMap = new Map<number, {
        weight: number;
        repeatCount: number;
        effectiveWeight: number;
        contribution: number;
      }>();
      
      if (historyRes.data) {
        for (const historyItem of historyRes.data) {
          if (historyItem.push_id && historyItem.metadata) {
            const metadata = historyItem.metadata as any;
            if (metadata.weight !== undefined && metadata.repeatCount !== undefined && 
                metadata.effectiveWeight !== undefined && metadata.contribution !== undefined) {
              savedMetadataMap.set(historyItem.push_id, {
                weight: Number(metadata.weight),
                repeatCount: Number(metadata.repeatCount),
                effectiveWeight: Number(metadata.effectiveWeight),
                contribution: Number(metadata.contribution),
              });
            }
          }
        }
      }

      let feedbackItems: any[] = [];
      
      if (isAdmin) {
        // For admins: use saved metadata from trust_flow_history if available, otherwise recalculate
        // First, get all pushes sorted chronologically to calculate repeat counts correctly (as fallback)
        const { data: allPushes } = await supabase
          .from('trust_pushes')
          .select('id, from_user_id, type, reason, created_at')
          .eq('to_user_id', profile.user_id)
          .order('created_at', { ascending: true }); // Ascending for correct repeat count calculation

        if (allPushes && allPushes.length > 0) {
          // Create a map of push ID to TF details
          // First, try to use saved metadata, then fallback to recalculation
          const pushDetailsMap = new Map<number, {
            weight: number;
            repeatCount: number;
            effectiveWeight: number;
            contribution: number;
            pushType: 'positive' | 'negative';
          }>();

          // Check which pushes have saved metadata
          const pushesNeedingRecalc: typeof allPushes = [];
          for (const push of allPushes) {
            const savedMetadata = savedMetadataMap.get(Number(push.id));
            if (savedMetadata) {
              // Use saved metadata
              pushDetailsMap.set(Number(push.id), {
                weight: savedMetadata.weight,
                repeatCount: savedMetadata.repeatCount,
                effectiveWeight: savedMetadata.effectiveWeight,
                contribution: savedMetadata.contribution,
                pushType: push.type as 'positive' | 'negative',
              });
            } else {
              // Need to recalculate for this push
              pushesNeedingRecalc.push(push);
            }
          }

          // If some pushes need recalculation, do it
          if (pushesNeedingRecalc.length > 0) {
            // Group pushes by from_user_id to calculate repeat counts
            const pushesByUser = new Map<string, typeof allPushes>();
            for (const push of allPushes) {
              const fromUserId = push.from_user_id;
              if (!pushesByUser.has(fromUserId)) {
                pushesByUser.set(fromUserId, []);
              }
              pushesByUser.get(fromUserId)!.push(push);
            }

            // Calculate base effective weights for all unique pushers (cache them)
            // Base weight depends on pusher's Trust Flow (1.5, 2.0, or 2.5)
            const baseWeightCache = new Map<string, number>();
            const baseWeightPromises: Promise<void>[] = [];
            
            for (const fromUserId of pushesByUser.keys()) {
              baseWeightPromises.push(
                (async () => {
                  try {
                    // Get cached TF for pusher
                    const { data: profile } = await supabase
                      .from('profiles')
                      .select('trust_flow')
                      .eq('user_id', fromUserId)
                      .maybeSingle();
                    
                    const tf = profile?.trust_flow !== null && profile?.trust_flow !== undefined 
                      ? Number(profile.trust_flow) 
                      : 5.0; // BASE_TRUST_FLOW
                    
                    // Determine base weight based on Trust Flow
                    let baseWeight = 1.5; // Default
                    if (tf < 10) {
                      baseWeight = 1.5; // Low TF
                    } else if (tf < 40) {
                      baseWeight = 2.0; // Moderate TF
                    } else {
                      baseWeight = 2.5; // High TF
                    }
                    
                    baseWeightCache.set(fromUserId, baseWeight);
                    console.log(`[TF History] User ${fromUserId} base weight: ${baseWeight.toFixed(1)} (TF: ${tf.toFixed(2)})`);
                  } catch (error) {
                    console.error(`[TF History] Error calculating base weight for user ${fromUserId}:`, error);
                    baseWeightCache.set(fromUserId, 1.5); // Default fallback
                  }
                })()
              );
            }
            
            await Promise.all(baseWeightPromises);

            // Calculate details for pushes that need recalculation
            for (const [fromUserId, userPushes] of pushesByUser.entries()) {
              // Get base weight from cache, fallback to 1.5 if not found
              const baseWeight = baseWeightCache.get(fromUserId) ?? 1.5;
              
              // Sort pushes by created_at to process in chronological order
              const sortedPushes = [...userPushes].sort((a, b) => 
                new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
              );
              
              for (let i = 0; i < sortedPushes.length; i++) {
                const push = sortedPushes[i];
                const pushId = Number(push.id);
                
                // Skip if we already have saved metadata for this push
                if (pushDetailsMap.has(pushId)) {
                  continue;
                }
                
                const pushDate = new Date(push.created_at);
                const thirtyDaysAgo = new Date(pushDate);
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                
                // Count how many pushes from this user to this target within 30 days before this push
                const recentPushesBeforeThis = sortedPushes.filter(p => {
                  const pDate = new Date(p.created_at);
                  return pDate >= thirtyDaysAgo && pDate <= pushDate;
                });
                
                // Repeat count is the index of this push in the recent pushes (0-based)
                const repeatCount = recentPushesBeforeThis.findIndex(p => p.created_at === push.created_at);
                
                // Calculate effective weight: each repeat is 33% less (multiply by 0.67^repeatCount)
                const effectiveWeight = baseWeight * Math.pow(0.67, repeatCount);
                const contribution = push.type === 'positive' ? effectiveWeight : -effectiveWeight;
                
                pushDetailsMap.set(pushId, {
                  weight: baseWeight, // Show base weight (not used in calculation, just for display)
                  repeatCount,
                  effectiveWeight,
                  contribution,
                  pushType: push.type as 'positive' | 'negative',
                });
              }
            }
          }

          // Now map the pushes from pushesRes (which are in descending order) with details
          feedbackItems = ((pushesRes.data as any[]) || []).map((r) => {
            const details = pushDetailsMap.get(Number(r.id));
            return {
              type: 'feedback' as const,
              author_id: (r.from_user_id as string) || null,
              value: r.type === 'positive' ? 1 : -1,
              comment: (r.reason as string) || null,
              created_at: r.created_at as string | undefined,
              tfDetails: details,
            };
          });
        } else {
          feedbackItems = [];
        }
      } else {
        // For non-admins: simple mapping without details
        feedbackItems = ((pushesRes.data as any[]) || []).map((r) => ({
          type: 'feedback' as const,
          author_id: (r.from_user_id as string) || null,
          value: r.type === 'positive' ? 1 : -1,
          comment: (r.reason as string) || null,
          created_at: r.created_at as string | undefined,
        }));
      }

      const changeItems = ((changesRes.data as any[]) || []).map((r) => ({
        type: 'profile_change' as const,
        author_id: (r.editor_id as string) || null,
        field_name: (r.field_name as string) || null,
        old_value: r.old_value,
        new_value: r.new_value,
        comment: (r.comment as string) || null,
        created_at: r.created_at as string | undefined,
      }));

      // Combine and sort by date
      const allItems = [...feedbackItems, ...changeItems].sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return dateB - dateA;
      });

      setHistoryItems(allItems.slice(0, 50));
    } catch (error) {
      console.error('Error loading history:', error);
      setHistoryItems([]);
    }
  }

  // Directions from growth-directions API
  const [availableDirections, setAvailableDirections] = useState<Array<{ id: string; slug: string; title: string; emoji: string; isPrimary: boolean }>>([]);
  const [loadingDirections, setLoadingDirections] = useState(true);
  
  // Educational institution data
  const [educationalInstitution, setEducationalInstitution] = useState<{ name: string; type: string } | null>(null);
  
  // Load directions from growth-directions API
  useEffect(() => {
    (async () => {
      setLoadingDirections(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          setAvailableDirections([]);
          setLoadingDirections(false);
          return;
        }

        const res = await fetch('/api/growth/directions.list', {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (res.ok) {
          const { directions: dirs } = await res.json();
          const rawDirections = Array.isArray(dirs) ? dirs : [];
          // Load all directions, not just selected ones - we'll match by ID from profile.directions_selected
          const mapped = rawDirections.map((dir: any) => ({
            id: dir.id,
            slug: dir.slug,
            title: dir.title,
            emoji: resolveDirectionEmoji(dir.slug, dir.emoji),
            isPrimary: dir.isPrimary || false,
          }));
          setAvailableDirections(mapped);
        }
      } catch (error) {
        console.error('Error loading directions:', error);
      } finally {
        setLoadingDirections(false);
      }
    })();
  }, [profile?.user_id]);

  return (
    <div className="max-w-7xl mx-auto px-0 md:px-4 py-6 md:py-8 space-y-6">
      {/* Profile header */}
      <div className={`card p-4 md:p-6 mx-4 md:mx-0 ${!loadingProfile && profile ? 'animate-fade-in-up' : ''}`}>
        {loadingProfile ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-4">
              <div className="w-20 h-20 rounded-full skeleton"></div>
              <div className="h-6 w-48 skeleton rounded"></div>
              <div className="h-4 w-32 skeleton rounded"></div>
            </div>
          </div>
        ) : !profile ? (
          <div className="text-white/70 animate-fade-in">Profile not found</div>
        ) : (
          <div className="flex flex-col md:flex-row md:items-start items-center gap-4">
            <div className="relative flex flex-col items-center animate-fade-in-scale animate-stagger-1">
              <div className="relative">
                {(() => {
                  if (loadingSW || totalSW === null) {
                    return (
                      <img
                        src={resolveAvatarUrl(profile.avatar_url) ?? AVATAR_FALLBACK}
                        alt="avatar"
                        className="h-40 w-40 rounded-full object-cover border border-white/10 animate-fade-in-scale"
                      />
                    );
                  }
                  const currentLevel = getSWLevel(totalSW, swLevels);
                  const nextLevel = getNextLevel(totalSW, swLevels);
                  
                  // Calculate progress percentage (same formula as /sw page)
                  const progressToNext = nextLevel 
                    ? ((totalSW - currentLevel.minSW) / (nextLevel.minSW - currentLevel.minSW)) * 100
                    : 100;
                  
                  // Clamp progress between 0 and 100
                  const clampedProgress = Math.max(0, Math.min(100, progressToNext));
                  
                  // Calculate circumference for progress circle
                  // Make SVG larger to show thick progress border around avatar
                  const avatarSize = 160; // h-40 = 160px
                  const svgSize = 200; // Larger to accommodate thick border
                  const center = svgSize / 2;
                  // Radius creates border that's visible around avatar (half of thick stroke will be outside)
                  const radius = (avatarSize / 2) + 4;
                  const circumference = 2 * Math.PI * radius;
                  
                  // Calculate strokeDashoffset: circumference when 0% progress, 0 when 100% progress
                  // Formula: offset = circumference - (progress / 100) * circumference
                  const strokeDashoffset = circumference - (clampedProgress / 100) * circumference;
                  
                  // Get color for progress circle based on level using color scheme
                  const colorScheme = LEVEL_COLOR_SCHEMES[currentLevel.name] || LEVEL_COLOR_SCHEMES['Beginner'];
                  const progressColor = colorScheme.hex;
                  const shouldShowBadge = currentLevel.name !== 'Beginner';
                  
                  return (
                    <div className="relative inline-flex items-center justify-center">
                      {/* Glow effect ring - outer glow layer */}
                      {shouldShowBadge && (
                        <div
                          className="absolute inset-0 rounded-full pointer-events-none"
                          style={{
                            width: `${avatarSize}px`,
                            height: `${avatarSize}px`,
                            boxShadow: `0 0 20px ${progressColor}60, 0 0 32px ${progressColor}40, 0 0 48px ${progressColor}30`,
                            background: `radial-gradient(circle at center, ${progressColor}20, transparent 70%)`,
                          }}
                        />
                      )}
                      <svg 
                        className="absolute transform -rotate-90 animate-fade-in-scale" 
                        width={svgSize} 
                        height={svgSize}
                        viewBox={`0 0 ${svgSize} ${svgSize}`}
                        style={{ 
                          left: `${(avatarSize - svgSize) / 2}px`,
                          top: `${(avatarSize - svgSize) / 2}px`,
                          animationDelay: '0.2s',
                        }}
                      >
                        {/* Background circle - darker for better contrast */}
                        <circle
                          cx={center}
                          cy={center}
                          r={radius}
                          fill="none"
                          stroke="rgba(255, 255, 255, 0.15)"
                          strokeWidth="9"
                        />
                        {/* Progress circle - very thick and visible */}
                        <circle
                          cx={center}
                          cy={center}
                          r={radius}
                          fill="none"
                          stroke={progressColor}
                          strokeWidth="9"
                          strokeDasharray={circumference}
                          strokeDashoffset={strokeDashoffset}
                          strokeLinecap="round"
                          className="animate-fade-in"
                          style={{ 
                            filter: `drop-shadow(0 0 6px ${progressColor}60)`,
                            opacity: 0.95,
                            animationDelay: '0.3s',
                            transition: 'stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.6s ease-out 0.3s'
                          }}
                        />
                      </svg>
                      <img
                        src={resolveAvatarUrl(profile.avatar_url) ?? AVATAR_FALLBACK}
                        alt="avatar"
                        className="h-40 w-40 rounded-full object-cover relative z-10 animate-fade-in-scale"
                        style={{ 
                          animationDelay: '0.1s',
                          border: shouldShowBadge ? `3px solid ${progressColor}` : '1px solid rgba(255, 255, 255, 0.1)',
                          boxShadow: shouldShowBadge 
                            ? `0 0 16px ${progressColor}80, 0 0 28px ${progressColor}60, 0 0 40px ${progressColor}40, inset 0 0 12px ${progressColor}20`
                            : undefined
                        }}
                      />
                    </div>
                  );
                })()}
              </div>
              {isMe && (
                <>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={onPickAvatar}
                  />
                  <button
                    onClick={() => avatarInputRef.current?.click()}
                    className="absolute -bottom-1 -right-1 h-7 px-2 rounded-full text-xs border border-white/20 bg-white/10 hover:bg-white/20 backdrop-blur z-20"
                    disabled={avatarUploading}
                  >
                    {avatarUploading ? '...' : 'Edit'}
                  </button>
                </>
              )}
              {!isMe && (
                <Link
                  href={`/dms?partnerId=${encodeURIComponent(profile.user_id)}`}
                  className="mt-3 px-4 py-2 rounded-lg text-sm font-medium border border-white/20 bg-white/10 hover:bg-white/20 text-white/90 transition"
                >
                  Write
                </Link>
              )}
            </div>
            <div className="min-w-0 flex-1 w-full animate-fade-in-up animate-stagger-2">
              <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3 md:justify-between">
                <div className="flex items-center gap-2 flex-wrap justify-center md:justify-start">
                  <h1 className="text-xl md:text-2xl font-semibold text-white truncate animate-fade-in">
                    {profile.full_name || profile.username || profile.user_id.slice(0, 8)}
                  </h1>
                  {isSuspended && (
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      isLight ? 'bg-red-100 text-red-700 border border-red-300' : 'bg-red-500/20 text-red-300 border border-red-500/30'
                    }`}>
                      Account Suspended
                    </span>
                  )}
                  {(() => {
                    const showStatus = profile.show_online_status !== false;
                    if (!showStatus) {
                      return (
                        <span className="px-2 py-1 rounded-full text-xs border border-white/20 bg-white/10 text-white/80 whitespace-nowrap">
                          Private online
                        </span>
                      );
                    }
                    if (isOnline === true) {
                      return (
                        <span className="px-2 py-1 rounded-full text-xs border border-emerald-500/50 bg-emerald-500/20 text-emerald-300 whitespace-nowrap">
                          Online
                        </span>
                      );
                    }
                    if (isOnline === false) {
                      return (
                        <span className="px-2 py-1 rounded-full text-xs border border-white/20 bg-white/10 text-white/60 whitespace-nowrap">
                          Offline
                        </span>
                      );
                    }
                    return null;
                  })()}
                </div>
                {isMe ? (
                  <div className="flex justify-center md:justify-end gap-2 flex-shrink-0">
                    <button
                      onClick={() => setShareModalOpen(true)}
                      className="px-2.5 md:px-3 py-1.5 rounded-lg text-xs md:text-sm border border-white/20 text-white/80 hover:bg-white/10 flex items-center gap-1.5 whitespace-nowrap"
                      title="Share profile"
                    >
                      <svg className="w-3.5 h-3.5 md:w-4 md:h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                      </svg>
                      <span className="hidden sm:inline">Share</span>
                    </button>
                    <Link href="/profile" className="px-2.5 md:px-3 py-1.5 rounded-lg text-xs md:text-sm border border-white/20 text-white/80 hover:bg-white/10 whitespace-nowrap">
                      Edit
                    </Link>
                  </div>
                ) : (
                  <div className="flex gap-2 justify-center md:justify-end flex-shrink-0">
                    <Button variant="secondary" className="text-xs md:text-sm px-2.5 md:px-4">Connections</Button>
                    <Button variant={iFollow ? 'secondary' : 'primary'} onClick={toggleFollow} disabled={updatingFollow} className="text-xs md:text-sm px-2.5 md:px-4">
                      {iFollow ? 'Following' : 'Follow'}
                    </Button>
                  </div>
                )}
              </div>
              <div className="text-white/70 text-sm mt-1 flex flex-wrap items-center gap-2">
                <Link href={`/u/${encodeURIComponent(profile.username || profile.user_id)}`} className="hover:underline">
                  @{profile.username || profile.user_id.slice(0, 8)}
                </Link>
                {profile.country && (() => {
                  const city = String(profile.country).split(",")[0].trim();
                  return (
                    <>
                      <span>•</span>
                      <Link href={`/city/${encodeURIComponent(city)}`} className="hover:underline">
                        {profile.country}
                      </Link>
                    </>
                  );
                })()}
                {(profile.facebook_url || profile.instagram_url || profile.twitter_url) && (
                  <>
                    <span>•</span>
                    <div className="flex items-center gap-2">
                      {profile.facebook_url && (
                        <a
                          href={profile.facebook_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`flex items-center justify-center w-6 h-6 rounded-lg transition-all hover:scale-110 ${
                            isLight
                              ? 'bg-gradient-to-br from-blue-600/20 to-blue-700/20 border border-blue-600/30 hover:bg-blue-600/30'
                              : 'bg-gradient-to-br from-blue-600/15 to-blue-700/15 border border-blue-600/30 hover:bg-blue-600/25'
                          }`}
                          title="Facebook"
                        >
                          <svg className="w-3.5 h-3.5 text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                          </svg>
                        </a>
                      )}
                      {profile.instagram_url && (
                        <a
                          href={profile.instagram_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`flex items-center justify-center w-6 h-6 rounded-lg transition-all hover:scale-110 ${
                            isLight
                              ? 'bg-gradient-to-br from-pink-600/20 to-purple-600/20 border border-pink-600/30 hover:bg-pink-600/30'
                              : 'bg-gradient-to-br from-pink-600/15 to-purple-600/15 border border-pink-600/30 hover:bg-pink-600/25'
                          }`}
                          title="Instagram"
                        >
                          <svg className="w-3.5 h-3.5 text-pink-400" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                          </svg>
                        </a>
                      )}
                      {profile.twitter_url && (
                        <a
                          href={profile.twitter_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`flex items-center justify-center w-6 h-6 rounded-lg transition-all hover:scale-110 ${
                            isLight
                              ? 'bg-gradient-to-br from-gray-800/20 to-gray-900/20 border border-gray-800/30 hover:bg-gray-800/30'
                              : 'bg-gradient-to-br from-gray-800/15 to-gray-900/15 border border-gray-800/30 hover:bg-gray-800/25'
                          }`}
                          title="X.com (Twitter)"
                        >
                          <svg className="w-3.5 h-3.5 text-gray-300" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                          </svg>
                        </a>
                      )}
                    </div>
                  </>
                )}
              </div>
              {!isMe && (
                <div className="mt-2 text-white/70 text-xs flex items-center gap-2">
                  {followsMe && <span className="px-2 py-0.5 rounded-full border border-white/20">follows you</span>}
                  {iFollow && <span className="px-2 py-0.5 rounded-full border border-white/20">you follow</span>}
                </div>
              )}
              {/* Social Weight and Trust Flow side by side */}
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Social Weight */}
                <div className={`rounded-2xl border border-white/15 bg-white/5 p-3 animate-fade-in-up ${!loadingSW && totalSW !== null ? 'animate-stagger-3' : ''}`}>
                  <div className="flex items-center justify-between text-white/80 text-sm mb-2">
                    <div className="font-medium">Social Weight</div>
                    <div className="flex items-center gap-2">
                      {(() => {
                        if (loadingSW || totalSW === null) return null;
                        const currentLevel = getSWLevel(totalSW, swLevels);
                        const colorScheme = LEVEL_COLOR_SCHEMES[currentLevel.name] || LEVEL_COLOR_SCHEMES['Beginner'];
                        // Use theme-aware colors for better readability in light theme
                        const textColorMap: Record<string, string> = {
                          'text-gray-400': isLight ? 'text-gray-700' : 'text-gray-300',
                          'text-blue-400': isLight ? 'text-blue-700' : 'text-blue-300',
                          'text-purple-400': isLight ? 'text-purple-700' : 'text-purple-300',
                          'text-yellow-400': isLight ? 'text-yellow-700' : 'text-yellow-300',
                          'text-orange-400': isLight ? 'text-orange-700' : 'text-orange-300',
                          'text-pink-400': isLight ? 'text-pink-700' : 'text-pink-300',
                        };
                        const textColor = textColorMap[currentLevel.color] || (isLight ? 'text-gray-700' : 'text-white/80');
                        const badgeClass = `${colorScheme.badgeBorder} ${colorScheme.badgeBg} ${textColor}`;
                        return (
                          <div className={`px-2 py-0.5 rounded-full border text-xs font-medium ${badgeClass}`}>
                            {currentLevel.name}
                          </div>
                        );
                      })()}
                      {loadingSW ? (
                        <div className="px-2 py-0.5 rounded-full border border-white/20 text-white/80 text-xs">Loading...</div>
                      ) : totalSW !== null ? (
                        <div className="px-2 py-0.5 rounded-full border border-white/20 text-white/80">
                          {totalSW.toLocaleString()}
                        </div>
                      ) : (
                        <div className="px-2 py-0.5 rounded-full border border-white/20 text-white/80 text-xs">N/A</div>
                      )}
                    </div>
                  </div>
                  {loadingSW ? (
                    <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                      <div className="h-full w-20 skeleton rounded-full"></div>
                    </div>
                  ) : totalSW !== null ? (
                    (() => {
                      const currentLevel = getSWLevel(totalSW, swLevels);
                      const nextLevel = getNextLevel(totalSW, swLevels);
                      const progressToNext = nextLevel 
                        ? ((totalSW - currentLevel.minSW) / (nextLevel.minSW - currentLevel.minSW)) * 100
                        : 100;
                      const clampedProgress = Math.max(0, Math.min(100, progressToNext));
                      const colorScheme = LEVEL_COLOR_SCHEMES[currentLevel.name] || LEVEL_COLOR_SCHEMES['Beginner'];
                      return (
                        <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                          <div 
                            className="h-full transition-all duration-500" 
                            style={{ 
                              width: `${clampedProgress}%`,
                              backgroundColor: colorScheme.hex
                            }}
                          ></div>
                        </div>
                      );
                    })()
                  ) : (
                    <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                      <div className="h-full w-0"></div>
                    </div>
                  )}
                  <div className="mt-2 text-xs text-white/60">
                    {loadingSW ? 'Loading...' : totalSW !== null ? 'Total Points' : 'Unable to load SW'}
                  </div>
                </div>

                {/* Trust Flow */}
                <div className={`rounded-2xl border border-white/15 bg-white/5 p-3 animate-fade-in-up animate-stagger-4`}>
                  <div className="flex items-center justify-between text-white/80 text-sm mb-2">
                    <div className="flex items-center gap-1.5">
                      <div className="font-medium">Trust Flow</div>
                      <button
                        onClick={() => setTrustFlowInfoOpen(true)}
                        className="text-white/40 hover:text-white/60 transition cursor-pointer"
                        title="Что такое Trust Flow?"
                        aria-label="Информация о Trust Flow"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-3.5 w-3.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                      </button>
                    </div>
                    <div className={`px-2 py-0.5 rounded-full border border-white/20 text-white/80 ${
                      trustFlowColor === 'red' ? 'text-red-300' :
                      trustFlowColor === 'yellow' ? 'text-yellow-300' :
                      trustFlowColor === 'green' ? 'text-green-300' :
                      trustFlowColor === 'blue' ? 'text-blue-300' :
                      'text-white/80'
                    }`}>
                      {trustFlow.toFixed(1)}
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full" style={trustBarStyleFor(trustFlow)} />
                  </div>
                  {!isMe && (
                    <button
                      onClick={() => setFeedbackOpen(true)}
                      className="mt-2 text-xs text-white/60 hover:text-white/80 underline"
                    >
                      Leave opinion
                    </button>
                  )}
                  {isMe && (
                    <button
                      onClick={openHistory}
                      className="mt-2 text-xs text-white/60 hover:text-white/80 underline"
                    >
                      Change history
                    </button>
                  )}
                </div>
              </div>

              {/* Selected directions: only primary (priority) direction with Focus on */}
              {(() => {
                const primaryDirection = profile.directions_selected?.length
                  ? availableDirections.find((a) => 
                      profile.directions_selected?.includes(a.id) && a.isPrimary === true
                    )
                  : null;
                
                if (!primaryDirection) return null;
                
                return (
                  <div className="mt-4">
                    <div className={`px-4 py-3 rounded-xl border-2 shadow-lg ${
                      isLight 
                        ? 'border-primary-blue/50 bg-gradient-to-r from-primary-blue/15 to-primary-blue-light/15' 
                        : 'border-primary-blue/40 bg-gradient-to-r from-primary-blue/20 to-primary-blue-light/20'
                    }`}>
                      <div className={`text-xs font-medium mb-1 uppercase tracking-wider ${
                        isLight ? 'text-primary-text-secondary' : 'text-white/60'
                      }`}>
                        Focus on:
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-2xl leading-none">{primaryDirection.emoji}</span>
                        <span className={`text-base font-semibold ${
                          isLight ? 'text-primary-text' : 'text-white/90'
                        }`}>
                          {primaryDirection.title}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </div>

      {/* Unified Profile Info Block - Full width with tabs */}
      {!loadingProfile && profile && (
        <div className="w-full">
          <div className="card p-5 md:p-6 mx-4 md:mx-0 animate-fade-in-up animate-stagger-2">
            {/* Tabs */}
            <div className="flex items-center gap-2 mb-5 border-b border-white/10">
              <button
                onClick={() => setActiveTab('info')}
                className={`px-4 py-2 text-sm font-semibold transition-all relative ${
                  activeTab === 'info'
                    ? isLight
                      ? 'text-primary-text'
                      : 'text-white/90'
                    : isLight
                    ? 'text-primary-text-secondary'
                    : 'text-white/60'
                }`}
              >
                Profile Information
                {activeTab === 'info' && (
                  <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${
                    isLight ? 'bg-primary-blue' : 'bg-primary-blue-light'
                  }`} />
                )}
              </button>
              <button
                onClick={() => setActiveTab('goals')}
                className={`px-4 py-2 text-sm font-semibold transition-all relative ${
                  activeTab === 'goals'
                    ? isLight
                      ? 'text-primary-text'
                      : 'text-white/90'
                    : isLight
                    ? 'text-primary-text-secondary'
                    : 'text-white/60'
                }`}
              >
                Goals
                {activeTab === 'goals' && (
                  <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${
                    isLight ? 'bg-primary-blue' : 'bg-primary-blue-light'
                  }`} />
                )}
              </button>
            </div>

            {/* Tab content */}
            {activeTab === 'info' && (
              <div>
                <div className="space-y-3">
                  {/* Bio and Place of Study - Inline with separator */}
                  {(profile.bio || educationalInstitution) && (
                    <div className="pb-3 border-b border-white/10">
                      <div className="flex flex-wrap items-start gap-3">
                        {/* Bio */}
                        {profile.bio && (
                          <>
                            <div className="flex-1 min-w-0">
                              <div className={`text-[10px] font-semibold mb-1 uppercase tracking-wider ${
                                isLight ? 'text-primary-text-secondary' : 'text-white/50'
                              }`}>
                                Bio
                              </div>
                              <div className={`text-sm leading-snug ${isLight ? 'text-primary-text' : 'text-white/90'}`}>
                                {profile.bio}
                              </div>
                            </div>
                            {educationalInstitution && (
                              <div className={`w-px h-12 ${isLight ? 'bg-gray-300' : 'bg-white/20'}`} />
                            )}
                          </>
                        )}
                        
                        {/* Place of Study */}
                        {educationalInstitution && (
                          <div className="flex-shrink-0">
                            <div className={`text-[10px] font-semibold mb-1 uppercase tracking-wider ${
                              isLight ? 'text-primary-text-secondary' : 'text-white/50'
                            }`}>
                              Place of Study
                            </div>
                            <div className={`text-sm ${isLight ? 'text-primary-text' : 'text-white/80'}`}>
                              {educationalInstitution.name} ({educationalInstitution.type === 'school' ? 'School' : educationalInstitution.type === 'college' ? 'College' : 'University'})
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Main Info Grid - 2 columns on mobile, 3 columns on desktop */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {/* Column 1 */}
                    <div className="space-y-3">
                      {/* Location */}
                      {profile.country && (
                        <div>
                          <div className={`text-[10px] font-semibold mb-1 uppercase tracking-wider ${
                            isLight ? 'text-primary-text-secondary' : 'text-white/50'
                          }`}>
                            Location
                          </div>
                          <div className={`text-sm ${isLight ? 'text-primary-text' : 'text-white/80'}`}>
                            {(() => {
                              const city = String(profile.country).split(",")[0].trim();
                              return (
                                <Link href={`/city/${encodeURIComponent(city)}`} className="hover:underline inline-flex items-center gap-1.5">
                                  <span>{profile.country}</span>
                                  <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                  </svg>
                                </Link>
                              );
                            })()}
                          </div>
                        </div>
                      )}

                      {/* Work & Career */}
                      {profile.work_career_status && (
                        <div>
                          <div className={`text-[10px] font-semibold mb-1 uppercase tracking-wider ${
                            isLight ? 'text-primary-text-secondary' : 'text-white/50'
                          }`}>
                            Work & Career
                          </div>
                          <div className={`text-sm font-medium ${isLight ? 'text-primary-text' : 'text-white/90'}`}>
                            {profile.work_career_status === 'employed' ? 'Employed' :
                             profile.work_career_status === 'entrepreneur' ? 'Entrepreneur' :
                             profile.work_career_status === 'student' ? 'Student' :
                             profile.work_career_status === 'looking_for_opportunities' ? 'Looking for Opportunities' :
                             profile.work_career_status === 'unemployed' ? 'Unemployed' :
                             profile.work_career_status}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Column 2 */}
                    <div className="space-y-3">
                      {/* Relationship Status */}
                      {profile.relationship_status && (
                        <div>
                          <div className={`text-[10px] font-semibold mb-1 uppercase tracking-wider ${
                            isLight ? 'text-primary-text-secondary' : 'text-white/50'
                          }`}>
                            Relationship
                          </div>
                          <div className={`text-sm ${isLight ? 'text-primary-text' : 'text-white/80'}`}>
                            {profile.relationship_status === 'single' ? 'Single' :
                             profile.relationship_status === 'looking' ? 'Looking' :
                             profile.relationship_status === 'dating' ? 'Dating' :
                             profile.relationship_status === 'married' ? 'Married' :
                             profile.relationship_status}
                          </div>
                        </div>
                      )}

                      {/* Date of birth */}
                      {profile.date_of_birth && (
                        <div>
                          <div className={`text-[10px] font-semibold mb-1 uppercase tracking-wider ${
                            isLight ? 'text-primary-text-secondary' : 'text-white/50'
                          }`}>
                            Date of birth
                          </div>
                          <div className={`text-sm ${isLight ? 'text-primary-text' : 'text-white/80'}`}>
                            {new Date(profile.date_of_birth).toLocaleDateString('en-GB', { 
                              day: '2-digit', 
                              month: '2-digit', 
                              year: 'numeric' 
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Column 3 */}
                    <div className="space-y-3">
                      {/* Portfolio */}
                      {profile.website_url && (
                        <div>
                          <div className={`text-[10px] font-semibold mb-1 uppercase tracking-wider ${
                            isLight ? 'text-primary-text-secondary' : 'text-white/50'
                          }`}>
                            Portfolio
                          </div>
                          <div className={`text-sm ${isLight ? 'text-primary-text' : 'text-white/80'}`}>
                            <a 
                              href={profile.website_url} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="hover:underline inline-flex items-center gap-1.5 break-all"
                            >
                              <span className="truncate">
                                {profile.website_url && profile.website_url.length > 20 
                                  ? profile.website_url.substring(0, 20) + '...' 
                                  : profile.website_url}
                              </span>
                              <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                            </a>
                          </div>
                        </div>
                      )}

                      {/* Joined */}
                      {profile.created_at && (
                        <div>
                          <div className={`text-[10px] font-semibold mb-1 uppercase tracking-wider ${
                            isLight ? 'text-primary-text-secondary' : 'text-white/50'
                          }`}>
                            Joined
                          </div>
                          <div className={`text-sm ${isLight ? 'text-primary-text' : 'text-white/80'}`}>
                            {new Date(profile.created_at).toLocaleDateString('en-GB', { 
                              day: '2-digit', 
                              month: '2-digit', 
                              year: 'numeric' 
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Stats block - Connections, Following, Followers, Referrals */}
                  <div className="pt-3 border-t border-white/10">
                    <div className={`text-[10px] font-semibold mb-3 uppercase tracking-wider ${
                      isLight ? 'text-primary-text-secondary' : 'text-white/50'
                    }`}>
                      Statistics
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {/* Connections */}
                      <div className="flex flex-col">
                        <div className={`text-[10px] font-semibold mb-1 uppercase tracking-wider ${
                          isLight ? 'text-primary-text-secondary' : 'text-white/50'
                        }`}>
                          Connections
                        </div>
                        <div className={`text-2xl font-bold mb-0.5 ${
                          isLight 
                            ? 'bg-gradient-to-r from-violet-500 to-purple-500 bg-clip-text text-transparent' 
                            : 'bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent'
                        }`}>
                          {connectionsCount}
                        </div>
                        <div className={`text-[10px] ${isLight ? 'text-primary-text-secondary' : 'text-white/60'}`}>
                          Mutual
                        </div>
                      </div>

                      {/* Following */}
                      <div className="flex flex-col">
                        <div className={`text-[10px] font-semibold mb-1 uppercase tracking-wider ${
                          isLight ? 'text-primary-text-secondary' : 'text-white/50'
                        }`}>
                          Following
                        </div>
                        <div className={`text-2xl font-bold mb-0.5 ${
                          isLight 
                            ? 'bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent' 
                            : 'bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent'
                        }`}>
                          {followingCount}
                        </div>
                        <div className={`text-[10px] ${isLight ? 'text-primary-text-secondary' : 'text-white/60'}`}>
                          You follow
                        </div>
                      </div>

                      {/* Followers */}
                      <div className="flex flex-col">
                        <div className={`text-[10px] font-semibold mb-1 uppercase tracking-wider ${
                          isLight ? 'text-primary-text-secondary' : 'text-white/50'
                        }`}>
                          Followers
                        </div>
                        <div className={`text-2xl font-bold mb-0.5 ${
                          isLight 
                            ? 'bg-gradient-to-r from-blue-500 to-cyan-500 bg-clip-text text-transparent' 
                            : 'bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent'
                        }`}>
                          {followersCount}
                        </div>
                        <div className={`text-[10px] ${isLight ? 'text-primary-text-secondary' : 'text-white/60'}`}>
                          Following you
                        </div>
                      </div>

                      {/* Referrals */}
                      <div className="flex flex-col">
                        <div className={`text-[10px] font-semibold mb-1 uppercase tracking-wider ${
                          isLight ? 'text-primary-text-secondary' : 'text-white/50'
                        }`}>
                          Referrals
                        </div>
                        <div className={`text-2xl font-bold mb-0.5 ${
                          isLight 
                            ? 'bg-gradient-to-r from-emerald-500 to-teal-500 bg-clip-text text-transparent' 
                            : 'bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent'
                        }`}>
                          {referralsCount}
                        </div>
                        <div className={`text-[10px] ${isLight ? 'text-primary-text-secondary' : 'text-white/60'}`}>
                          Invited
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Goals Tab */}
            {activeTab === 'goals' && (
              <div className="space-y-2">
                {userGoals.length === 0 ? (
                  <div className={`text-center py-12 ${isLight ? 'text-primary-text-secondary' : 'text-white/60'}`}>
                    <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                    <p className="text-sm">No goals set yet. Goals can be added in profile settings.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {userGoals.map((goal, index) => (
                      <div
                        key={goal.id}
                        className={`flex items-center justify-between gap-4 py-2.5 px-3 rounded-lg border ${
                          isLight
                            ? 'border-gray-200 bg-gray-50/50 hover:bg-gray-100/50'
                            : 'border-white/10 bg-white/5 hover:bg-white/10'
                        } transition-all`}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                            isLight
                              ? 'bg-primary-blue/20 text-primary-blue'
                              : 'bg-primary-blue/20 text-primary-blue-light'
                          }`}>
                            {index + 1}
                          </div>
                          <div className={`text-sm flex-1 min-w-0 ${isLight ? 'text-primary-text' : 'text-white/90'}`}>
                            {goal.text}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          {goal.target_date && (
                            <div className={`text-xs flex items-center gap-1.5 ${
                              isLight ? 'text-primary-text-secondary' : 'text-white/60'
                            }`}>
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              <span>
                                {new Date(goal.target_date).toLocaleDateString('en-GB', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric'
                                })}
                              </span>
                            </div>
                          )}
                          {profile?.user_id && (
                            <GoalReactions
                              goalUserId={profile.user_id}
                              goalId={goal.id}
                              initialCount={goalReactions[goal.id]?.count || 0}
                              initialSelected={goalReactions[goal.id]?.selected || false}
                              onReactionChange={(selected, count) => {
                                setGoalReactions(prev => ({
                                  ...prev,
                                  [goal.id]: { count, selected }
                                }));
                              }}
                            />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Badges block */}
      {!loadingProfile && profile && displayedBadges.length > 0 && (
        <div className="card p-4 md:p-6 mx-4 md:mx-0 animate-fade-in-up">
          <h2 className="text-lg font-medium text-white/90 mb-4">Badges</h2>
          <div className="flex flex-wrap items-center gap-3">
            {displayedBadges.map((badge) => (
              <div
                key={badge.id}
                className="flex items-center gap-2 px-3 py-2 rounded-xl border border-white/20 bg-white/10 hover:bg-white/15 transition"
                title={`${badge.name}: ${badge.description}`}
              >
                <span className="text-xl leading-none">{badge.emoji}</span>
                <span className="text-white/90 text-sm font-medium">{badge.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}



      {/* Feedback modal */}
      {feedbackOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/80" onClick={() => !feedbackPending && (setFeedbackOpen(false), setPushType(null), setFeedbackText(''))} />
          <div className="relative z-10 w-full max-w-xl mx-auto p-4">
            <div className="card-glow-primary p-4 md:p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-white/90 font-medium">Leave Trust Flow Push</div>
                <button
                  onClick={() => !feedbackPending && (setFeedbackOpen(false), setPushType(null), setFeedbackText(''))}
                  className="text-white/60 hover:text-white transition"
                  aria-label="Close"
                >
                  <CloseIcon className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              
              {/* Rules section */}
              <div className="flex items-start gap-2 px-3 py-2 rounded-lg border bg-amber-900/20 border-amber-700/30 text-amber-300">
                <svg className="h-5 w-5 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                  <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
                <div className="text-sm space-y-1">
                  <div className="font-medium">Push Submission Rules:</div>
                  <ul className="list-disc list-inside space-y-0.5 text-xs">
                    <li><strong>Authenticity:</strong> Provide honest and accurate evaluations based on real interactions and experiences.</li>
                    <li><strong>Responsibility:</strong> You are responsible for your actions. False or malicious pushes may result in account restrictions.</li>
                    <li><strong>Anti-Manipulation:</strong> Pushes are limited to prevent gaming the system. Abuse will be detected and penalized.</li>
                    <li><strong>Appeals:</strong> If you receive a negative push, you can submit an appeal for review by the moderation team.</li>
                  </ul>
                </div>
              </div>
              
              {/* Message field */}
              <div className="space-y-2">
                <textarea
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  placeholder="Explain your push in detail (minimum 100 characters required)"
                  className="input w-full outline-none min-h-[120px] text-base md:text-lg placeholder-primary-text-secondary/50"
                  required
                />
                <div className="text-xs text-white/60">
                  {feedbackText.length}/100 characters (minimum required)
                  {feedbackText.length > 0 && feedbackText.length < 100 && (
                    <span className="text-amber-400 ml-2">Please provide more details</span>
                  )}
                </div>
              </div>
              
              {/* Action buttons */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setPushType('positive');
                    if (feedbackText.trim().length >= 100) {
                      submitFeedback('up');
                    }
                  }}
                  disabled={feedbackPending || feedbackText.trim().length < 100}
                  className={`px-4 py-2 rounded-xl border transition ${
                    pushType === 'positive'
                      ? 'border-emerald-400 text-emerald-400 bg-emerald-400/10'
                      : 'border-emerald-300/50 text-emerald-300/70 hover:bg-emerald-300/10'
                  } ${feedbackPending || feedbackText.trim().length < 100 ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  Positive Push
                </button>
                <button
                  onClick={() => {
                    setPushType('negative');
                    if (feedbackText.trim().length >= 100) {
                      submitFeedback('down');
                    }
                  }}
                  disabled={feedbackPending || feedbackText.trim().length < 100}
                  className={`px-4 py-2 rounded-xl border transition ${
                    pushType === 'negative'
                      ? 'border-rose-400 text-rose-400 bg-rose-400/10'
                      : 'border-rose-300/50 text-rose-300/70 hover:bg-rose-300/10'
                  } ${feedbackPending || feedbackText.trim().length < 100 ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  Negative Push
                </button>
                <div className="ml-auto text-sm text-white/60">
                  {feedbackPending ? 'Submitting...' : 'This affects Trust Flow'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* History modal (owner only) */}
      {historyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/80" onClick={() => setHistoryOpen(false)} />
          <div className="relative z-10 w-full max-w-xl mx-auto p-4">
            <div className="card p-4 md:p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-white/90 font-medium">Change history</div>
                <button onClick={() => setHistoryOpen(false)} className="text-white/60 hover:text-white">✕</button>
              </div>
              {historyItems.length === 0 ? (
                <div className="text-white/60 text-sm">No history yet</div>
              ) : (
                <ul className="divide-y divide-white/10 rounded-xl border border-white/10 overflow-hidden">
                  {historyItems.map((it, idx) => (
                    <HistoryRow key={idx} item={it} />
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Trust Flow Info Modal */}
      <TrustFlowInfoModal
        isOpen={trustFlowInfoOpen}
        onClose={() => setTrustFlowInfoOpen(false)}
        isAdmin={isAdmin ?? false}
      />

      {/* Share modal (owner only) */}
      {shareModalOpen && profile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/80" onClick={() => setShareModalOpen(false)} />
          <div className="relative z-10 w-full max-w-md mx-auto p-4">
            <div className="card p-4 md:p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-white/90 font-medium">Share Profile</div>
                <button onClick={() => setShareModalOpen(false)} className="text-white/60 hover:text-white">✕</button>
              </div>
              <div className="text-white/70 text-sm">
                Share your profile on social networks
              </div>
              <div className="grid grid-cols-2 gap-3">
                {(() => {
                  const profileUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/u/${encodeURIComponent(profile.username || profile.user_id)}`;
                  const swText = loadingSW || totalSW === null 
                    ? 'SW: Loading...' 
                    : `SW: ${totalSW.toLocaleString()}`;
                  const tfText = `TF: ${trustFlow.toFixed(1)}`;
                  const shareText = `Check out my profile on Sigmet.app!\n${swText}\n${tfText}\n\n${profileUrl}`;
                  const shareTextEncoded = encodeURIComponent(shareText);
                  const urlEncoded = encodeURIComponent(profileUrl);

                  const shareToFacebook = () => {
                    window.open(`https://www.facebook.com/sharer/sharer.php?u=${urlEncoded}`, '_blank', 'width=600,height=400');
                  };

                  const shareToX = () => {
                    window.open(`https://twitter.com/intent/tweet?text=${shareTextEncoded}`, '_blank', 'width=600,height=400');
                  };

                  const shareToInstagram = async () => {
                    // Instagram doesn't have a direct share API, so we copy to clipboard
                    try {
                      await navigator.clipboard.writeText(shareText);
                      alert('Profile link copied to clipboard! You can paste it in Instagram.');
                    } catch (err) {
                      console.error('Failed to copy:', err);
                      alert('Failed to copy to clipboard. Please copy manually.');
                    }
                  };

                  const shareToTelegram = () => {
                    window.open(`https://t.me/share/url?url=${urlEncoded}&text=${encodeURIComponent(`Check out my profile on Sigmet.app!\n${swText}\n${tfText}`)}`, '_blank', 'width=600,height=400');
                  };

                  return (
                    <>
                      <button
                        onClick={shareToFacebook}
                        className="flex flex-col items-center gap-2 p-4 rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 transition"
                      >
                        <svg className="w-8 h-8 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                        </svg>
                        <span className="text-white/90 text-sm font-medium">Facebook</span>
                      </button>
                      <button
                        onClick={shareToX}
                        className="flex flex-col items-center gap-2 p-4 rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 transition"
                      >
                        <svg className="w-8 h-8 text-gray-300" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                        </svg>
                        <span className="text-white/90 text-sm font-medium">X.com</span>
                      </button>
                      <button
                        onClick={shareToInstagram}
                        className="flex flex-col items-center gap-2 p-4 rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 transition"
                      >
                        <svg className="w-8 h-8 text-pink-500" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                        </svg>
                        <span className="text-white/90 text-sm font-medium">Instagram</span>
                      </button>
                      <button
                        onClick={shareToTelegram}
                        className="flex flex-col items-center gap-2 p-4 rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 transition"
                      >
                        <svg className="w-8 h-8 text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.559z"/>
                        </svg>
                        <span className="text-white/90 text-sm font-medium">Telegram</span>
                      </button>
                    </>
                  );
                })()}
              </div>
              <div className="pt-3 border-t border-white/10">
                <div className="text-white/60 text-xs">
                  <div className="font-medium mb-1">What will be shared:</div>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Profile URL</li>
                    <li>Social network: Sigmet.app</li>
                    <li>SW rating: {loadingSW || totalSW === null ? 'Loading...' : totalSW.toLocaleString()}</li>
                    <li>TF rating: {trustFlow.toFixed(1)}</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Posts */}
      <div className={`space-y-4 ${!loadingProfile && profile ? 'animate-fade-in-up' : ''}`}>
        {!loadingProfile && profile && (
          <h2 className="text-lg text-white/90 animate-fade-in px-4 md:px-0">Posts</h2>
        )}
        {!loadingProfile && profile && (
          <div className="w-full">
            <PostFeed
              filterUserId={profile.user_id}
              showFilters={false}
              showComposer={false}
              backToProfileUsername={profile.username || slug}
              className=""
              enableLazyLoad={true}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function RecentSocialItem({ event }: { event: { kind: 'in' | 'out'; otherUserId: string; created_at?: string } }) {
  const [profile, setProfile] = useState<{ username: string | null; avatar_url: string | null } | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('username, avatar_url')
          .eq('user_id', event.otherUserId)
          .maybeSingle();
        setProfile((data as any) || { username: null, avatar_url: null });
      } catch {
        setProfile({ username: null, avatar_url: null });
      }
    })();
  }, [event.otherUserId]);
  const u = profile?.username || event.otherUserId.slice(0, 8);
  const avatar = resolveAvatarUrl(profile?.avatar_url) ??
    "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24'><rect width='100%' height='100%' fill='%23222'/></svg>";
  return (
    <li className="flex items-center gap-3 px-3 py-2 text-sm">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={avatar} alt="avatar" className="h-6 w-6 rounded-full object-cover border border-white/10" />
      {event.kind === 'in' ? (
        <span className="text-white/80">New follower: <Link href={`/u/${encodeURIComponent(u)}`} className="hover:underline">@{u}</Link></span>
      ) : (
        <span className="text-white/80">You followed <Link href={`/u/${encodeURIComponent(u)}`} className="hover:underline">@{u}</Link></span>
      )}
      <span className="ml-auto text-white/40">{event.created_at ? new Date(event.created_at).toLocaleString() : ''}</span>
    </li>
  );
}

function HistoryRow({ 
  item 
}: { 
  item: {
    type: 'feedback' | 'profile_change';
    author_id: string | null;
    value?: number;
    field_name?: string;
    old_value?: string | null;
    new_value?: string | null;
    comment: string | null;
    created_at?: string;
    tfDetails?: {
      weight: number;
      repeatCount: number;
      effectiveWeight: number;
      contribution: number;
      pushType: 'positive' | 'negative';
    };
  };
}) {
  const [user, setUser] = useState<{ username: string | null; avatar_url: string | null } | null>(null);
  useEffect(() => {
    (async () => {
      if (!item.author_id) { setUser({ username: null, avatar_url: null }); return; }
      try {
        const { data } = await supabase
          .from('profiles')
          .select('username, avatar_url')
          .eq('user_id', item.author_id)
          .maybeSingle();
        setUser((data as any) || { username: null, avatar_url: null });
      } catch {
        setUser({ username: null, avatar_url: null });
      }
    })();
  }, [item.author_id]);
  const u = user?.username || (item.author_id ? item.author_id.slice(0, 8) : 'Anon');
  const avatar = resolveAvatarUrl(user?.avatar_url) ??
    "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24'><rect width='100%' height='100%' fill='%23222'/></svg>";
  
  const getFieldLabel = (field: string) => {
    const labels: Record<string, string> = {
      username: 'Username',
      full_name: 'Full Name',
      bio: 'Bio',
      country: 'Country',
      website_url: 'Website',
      avatar_url: 'Avatar',
      directions_selected: 'Directions',
    };
    return labels[field] || field;
  };

  if (item.type === 'feedback') {
    const positive = (item.value || 0) > 0;
    const showTfDetails = item.tfDetails !== undefined;
    return (
      <li className="flex items-start gap-3 px-3 py-2 text-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={avatar} alt="avatar" className="h-6 w-6 rounded-full object-cover border border-white/10 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-white/80">
            <Link href={`/u/${encodeURIComponent(u)}`} className="hover:underline">@{u}</Link>
            {' '}
            {positive ? <span className="text-emerald-300">UP</span> : <span className="text-rose-300">Down</span>}
          </span>
          {item.comment && (
            <div className="text-white/60 text-xs mt-1 whitespace-pre-wrap break-words">{item.comment}</div>
          )}
          {showTfDetails && item.tfDetails && (
            <div className="text-white/50 text-xs mt-2 space-y-1 bg-white/5 rounded-lg p-2 border border-white/10">
              <div className="font-medium text-white/70 mb-1">TF Details:</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <div>
                  <span className="text-white/60">Weight:</span>
                  <span className="ml-2 text-white/80">{item.tfDetails.weight.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-white/60">Repeat Count:</span>
                  <span className="ml-2 text-white/80">{item.tfDetails.repeatCount}</span>
                </div>
                <div>
                  <span className="text-white/60">Effective Weight:</span>
                  <span className="ml-2 text-white/80">{item.tfDetails.effectiveWeight.toFixed(4)}</span>
                </div>
                <div>
                  <span className="text-white/60">Contribution:</span>
                  <span className={`ml-2 font-medium ${
                    item.tfDetails.contribution >= 0 ? 'text-emerald-300' : 'text-rose-300'
                  }`}>
                    {item.tfDetails.contribution >= 0 ? '+' : ''}{item.tfDetails.contribution.toFixed(4)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
        <span className="ml-auto text-white/40 text-xs flex-shrink-0">
          {item.created_at ? new Date(item.created_at).toLocaleString() : ''}
        </span>
      </li>
    );
  } else {
    // Profile change
    return (
      <li className="flex items-start gap-3 px-3 py-2 text-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={avatar} alt="avatar" className="h-6 w-6 rounded-full object-cover border border-white/10 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-white/80">
            <Link href={`/u/${encodeURIComponent(u)}`} className="hover:underline">@{u}</Link>
            {' '}changed <span className="text-blue-300">{getFieldLabel(item.field_name || '')}</span>
          </span>
          <div className="text-white/60 text-xs mt-1 space-y-1">
            {item.old_value && (
              <div>
                <span className="text-rose-300">-</span> {item.old_value.length > 100 
                  ? item.old_value.substring(0, 100) + '...' 
                  : item.old_value}
              </div>
            )}
            {item.new_value && (
              <div>
                <span className="text-emerald-300">+</span> {item.new_value.length > 100 
                  ? item.new_value.substring(0, 100) + '...' 
                  : item.new_value}
              </div>
            )}
            {item.comment && (
              <div className="text-white/50 italic mt-1">{item.comment}</div>
            )}
          </div>
        </div>
        <span className="ml-auto text-white/40 text-xs flex-shrink-0">
          {item.created_at ? new Date(item.created_at).toLocaleString() : ''}
        </span>
      </li>
    );
  }
}

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import Button from '@/components/Button';
import { getPresenceMap } from '@/lib/dm/presence';
import type { RealtimeChannel } from '@supabase/supabase-js';
import PostCard from '@/components/PostCard';
import { resolveDirectionEmoji } from '@/lib/directions';
import { useTheme } from '@/components/ThemeProvider';

type Profile = {
  user_id: string;
  username: string | null;
  full_name: string | null;
  bio: string | null;
  country: string | null;
  website_url?: string | null;
  avatar_url: string | null;
  directions_selected: string[] | null;
  show_online_status?: boolean | null;
  created_at?: string;
};

type Post = {
  id: number;
  user_id: string | null;
  body: string | null;
  image_url: string | null;
  video_url: string | null;
  created_at: string;
};

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

  const [posts, setPosts] = useState<Post[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [iFollow, setIFollow] = useState<boolean>(false);
  const [followsMe, setFollowsMe] = useState<boolean>(false);
  const [updatingFollow, setUpdatingFollow] = useState(false);
  const [followersCount, setFollowersCount] = useState<number>(0);
  const [followingCount, setFollowingCount] = useState<number>(0);
  const [referralsCount, setReferralsCount] = useState<number>(0);
  const [recentSocial, setRecentSocial] = useState<
    { kind: 'in' | 'out'; otherUserId: string; created_at?: string }[]
  >([]);
  // Trust Flow state (basic default 80%)
  const [trustScore, setTrustScore] = useState<number>(80);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackPending, setFeedbackPending] = useState(false);
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
    }>
  >([]);
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [presenceChannel, setPresenceChannel] = useState<RealtimeChannel | null>(null);

  // comment stats for posts
  const [commentCounts, setCommentCounts] = useState<Record<number, number>>({});
  const [viewsByPostId, setViewsByPostId] = useState<Record<number, number>>({});

  // avatar upload (own profile)
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  // Badges state
  const [displayedBadges, setDisplayedBadges] = useState<
    Array<{ id: string; name: string; emoji: string; description: string }>
  >([]);

  const isMe = useMemo(() => {
    if (!viewerId || !profile) return false;
    return viewerId === profile.user_id;
  }, [viewerId, profile]);

  useEffect(() => {
    // resolve viewer id
    supabase.auth.getUser().then(({ data }) => setViewerId(data.user?.id ?? null));
  }, []);

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
    });

    if (!showStatus) {
      // User has privacy setting - show as "Private online"
      console.log('[Online Status] Privacy setting enabled - showing "Private online"');
      setIsOnline(null);
      return;
    }

    // Subscribe to presence channel for this user
    const channelName = `presence:${profile.user_id}`;
    console.log('[Online Status] Subscribing to channel:', channelName);
    const channel = supabase.channel(channelName);
    
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        console.log('[Online Status] Presence sync event:', { state });
        const hasOnline = Object.keys(state).length > 0 && 
          Object.values(state).some((presences: any[]) => 
            presences.some((p: any) => p.online === true)
          );
        console.log('[Online Status] Sync result - hasOnline:', hasOnline);
        setIsOnline(hasOnline);
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        console.log('[Online Status] Presence join event:', { key, newPresences });
        const isUserOnline = newPresences.some((p: any) => p.online === true);
        if (isUserOnline) {
          console.log('[Online Status] User joined as online');
          setIsOnline(true);
        }
      })
      .on('presence', { event: 'leave' }, () => {
        console.log('[Online Status] Presence leave event');
        // Check if any presence remains
        const state = channel.presenceState();
        const hasOnline = Object.keys(state).length > 0 && 
          Object.values(state).some((presences: any[]) => 
            presences.some((p: any) => p.online === true)
          );
        console.log('[Online Status] Leave result - hasOnline:', hasOnline);
        setIsOnline(hasOnline);
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
        const hasOnline = Object.keys(state).length > 0 && 
          Object.values(state).some((presences: any[]) => 
            presences.some((p: any) => p.online === true)
          );
        console.log('[Online Status] Initial check result - hasOnline:', hasOnline);
        setIsOnline(hasOnline);
      } catch (error) {
        console.error('[Online Status] Initial check error:', error);
        setIsOnline(false);
      }
    })();

    return () => {
      channel.unsubscribe();
      setPresenceChannel(null);
    };
  }, [profile?.user_id, profile?.show_online_status]);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      setLoadingProfile(true);
      // If slug looks like a UUID, resolve by id and redirect to username
      const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(slug);
      if (uuidLike) {
        const { data } = await supabase
          .from('profiles')
          .select('user_id, username')
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
        .select('user_id, username, full_name, bio, country, website_url, avatar_url, directions_selected, show_online_status, created_at')
        .eq('username', slug)
        .maybeSingle();
      setProfile(((data as unknown) as Profile) || null);
      setLoadingProfile(false);
    })();
  }, [slug, router]);

  useEffect(() => {
    if (!profile?.user_id) return;
    (async () => {
      setLoadingPosts(true);
      const { data } = await supabase
        .from('posts')
        .select('id, user_id, body, image_url, video_url, created_at')
        .eq('user_id', profile.user_id)
        .order('created_at', { ascending: false })
        .limit(50);
      setPosts((data as Post[]) || []);
      setLoadingPosts(false);
    })();
  }, [profile?.user_id]);

  // Load Trust Flow score based on feedback logs
  useEffect(() => {
    if (!profile?.user_id) return;
    (async () => {
      try {
        const { data } = await supabase
          .from('trust_feedback')
          .select('value')
          .eq('target_user_id', profile.user_id);
        const sum = ((data as any[]) || []).reduce((acc, r) => acc + (Number(r.value) || 0), 0);
        const rating = Math.max(0, Math.min(120, 80 + sum * 2));
        setTrustScore(rating);
      } catch {
        setTrustScore(80);
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

  // Load engagement stats for visible posts
  useEffect(() => {
    if (posts.length === 0) return;
    (async () => {
      try {
        const ids = posts.map((p) => p.id);
        // comments
        try {
          const { data } = await supabase.from('comments').select('post_id').in('post_id', ids);
          const counts: Record<number, number> = {};
          for (const row of ((data as any[]) || [])) {
            const pid = row.post_id as number;
            counts[pid] = (counts[pid] || 0) + 1;
          }
          setCommentCounts(counts);
        } catch {
          // ignore
        }


        // views (if present on posts rows)
        const vmap: Record<number, number> = {};
        for (const p of posts) vmap[p.id] = (p as any).views ?? 0;
        setViewsByPostId(vmap);
      } catch {
        // ignore all
      }
    })();
  }, [posts]);

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
      } catch {
        setFollowersCount(0);
        setFollowingCount(0);
        setReferralsCount(0);
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

  function trustBarStyleFor(value: number): React.CSSProperties {
    const v = Math.max(0, Math.min(value, 120));
    let background = 'linear-gradient(90deg,#00ffc8,#7affc0)'; // brand
    if (value < 60) background = 'linear-gradient(90deg,#ff9aa2,#ff6677)';
    if (value > 100) background = 'linear-gradient(90deg,#60a5fa,#c084fc)';
    return { width: `${Math.min(v, 100)}%`, background };
  }

  async function submitFeedback(kind: 'up' | 'down') {
    if (!profile?.user_id) return;
    setFeedbackPending(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const me = auth.user?.id || null;
      
      // Prevent users from giving feedback to themselves
      if (me === profile.user_id) {
        setFeedbackPending(false);
        setFeedbackOpen(false);
        setFeedbackText('');
        return;
      }
      
      // Best-effort insert; table may not exist in all envs
      try {
        await supabase.from('trust_feedback').insert({
          target_user_id: profile.user_id,
          author_id: me,
          comment: feedbackText || null,
          value: kind === 'up' ? 1 : -1,
        });
      } catch {}
      setFeedbackOpen(false);
      setFeedbackText('');
      // recompute from DB
      try {
        const { data } = await supabase
          .from('trust_feedback')
          .select('value')
          .eq('target_user_id', profile.user_id);
        const sum = ((data as any[]) || []).reduce((acc, r) => acc + (Number(r.value) || 0), 0);
        const rating = Math.max(0, Math.min(120, 80 + sum * 2));
        setTrustScore(rating);
      } catch {}
    } finally {
      setFeedbackPending(false);
    }
  }

  async function openHistory() {
    if (!isMe || !profile?.user_id) return;
    setHistoryOpen(true);
    try {
      // Load both feedback and profile changes
      const [feedbackRes, changesRes] = await Promise.all([
        supabase
          .from('trust_feedback')
          .select('author_id, value, comment, created_at')
          .eq('target_user_id', profile.user_id)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('profile_changes')
          .select('editor_id, field_name, old_value, new_value, comment, created_at')
          .eq('target_user_id', profile.user_id)
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

      const feedbackItems = ((feedbackRes.data as any[]) || []).map((r) => ({
        type: 'feedback' as const,
        author_id: (r.author_id as string) || null,
        value: Number(r.value) || 0,
        comment: (r.comment as string) || null,
        created_at: r.created_at as string | undefined,
      }));

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
    } catch {
      setHistoryItems([]);
    }
  }

  // Directions from growth-directions API
  const [availableDirections, setAvailableDirections] = useState<Array<{ id: string; slug: string; title: string; emoji: string; isPrimary: boolean }>>([]);
  const [loadingDirections, setLoadingDirections] = useState(true);
  
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
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Profile header */}
      <div className="card p-4 md:p-6">
        {loadingProfile ? (
          <div className="text-white/70">Loading profile…</div>
        ) : !profile ? (
          <div className="text-white/70">Profile not found</div>
        ) : (
          <div className="flex items-start gap-4">
            <div className="relative flex flex-col items-center">
              <img
                src={profile.avatar_url || AVATAR_FALLBACK}
                alt="avatar"
                className="h-40 w-40 rounded-full object-cover border border-white/10"
              />
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
                    className="absolute -bottom-1 -right-1 h-7 px-2 rounded-full text-xs border border-white/20 bg-white/10 hover:bg-white/20 backdrop-blur"
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
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-semibold text-white truncate">
                    {profile.full_name || profile.username || profile.user_id.slice(0, 8)}
                  </h1>
                  {(() => {
                    const showStatus = profile.show_online_status !== false;
                    if (!showStatus) {
                      return (
                        <span className="px-2 py-1 rounded-full text-xs border border-white/20 bg-white/10 text-white/80">
                          Private online
                        </span>
                      );
                    }
                    if (isOnline === true) {
                      return (
                        <span className="px-2 py-1 rounded-full text-xs border border-emerald-500/50 bg-emerald-500/20 text-emerald-300">
                          Online
                        </span>
                      );
                    }
                    if (isOnline === false) {
                      return (
                        <span className="px-2 py-1 rounded-full text-xs border border-white/20 bg-white/10 text-white/60">
                          Offline
                        </span>
                      );
                    }
                    return null;
                  })()}
                </div>
                {isMe ? (
                  <div className="ml-auto">
                    <Link href="/profile" className="px-3 py-1.5 rounded-lg text-sm border border-white/20 text-white/80 hover:bg-white/10">
                      Edit
                    </Link>
                  </div>
                ) : (
                  <div className="ml-auto flex gap-2">
                    <Button variant="secondary">Connections</Button>
                    <Button variant={iFollow ? 'secondary' : 'primary'} onClick={toggleFollow} disabled={updatingFollow}>
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
                <div className="rounded-2xl border border-white/15 bg-white/5 p-3">
                  <div className="flex items-center justify-between text-white/80 text-sm mb-2">
                    <div className="font-medium">Social Weight</div>
                    <div className="px-2 py-0.5 rounded-full border border-white/20 text-white/80">75/100</div>
                  </div>
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full w-[75%]" style={{ background: 'linear-gradient(90deg,#00ffc8,#7affc0)' }}></div>
                  </div>
                  <div className="mt-2 text-xs text-white/60">In development, coming soon</div>
                </div>

                {/* Trust Flow */}
                <div className="rounded-2xl border border-white/15 bg-white/5 p-3">
                  <div className="flex items-center justify-between text-white/80 text-sm mb-2">
                    <div className="font-medium">Trust Flow</div>
                    <div className="px-2 py-0.5 rounded-full border border-white/20 text-white/80">{trustScore}%</div>
                  </div>
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full" style={trustBarStyleFor(trustScore)} />
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
                        ? 'border-telegram-blue/50 bg-gradient-to-r from-telegram-blue/15 to-telegram-blue-light/15' 
                        : 'border-telegram-blue/40 bg-gradient-to-r from-telegram-blue/20 to-telegram-blue-light/20'
                    }`}>
                      <div className={`text-xs font-medium mb-1 uppercase tracking-wider ${
                        isLight ? 'text-telegram-text-secondary' : 'text-white/60'
                      }`}>
                        Focus on:
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-2xl leading-none">{primaryDirection.emoji}</span>
                        <span className={`text-base font-semibold ${
                          isLight ? 'text-telegram-text' : 'text-white/90'
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

      {/* Info and Stats blocks side by side */}
      {!loadingProfile && profile && (
        <div className="grid md:grid-cols-2 gap-6">
          {/* Info block - Bio */}
          <div className="card p-4 md:p-6">
            <div className="grid gap-4 text-white/90">
              <div className="space-y-2 w-1/2">
                <div className="text-white/60 text-sm">Bio</div>
                <div>{profile.bio || '-'}</div>
              </div>
              <div className="space-y-2">
                <div className="text-white/60 text-sm">Country - City</div>
                <div>
                  {profile.country ? (
                    (() => {
                      const city = String(profile.country).split(",")[0].trim();
                      return (
                        <Link href={`/city/${encodeURIComponent(city)}`} className="hover:underline">
                          {profile.country}
                        </Link>
                      );
                    })()
                  ) : (
                    '-'
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-white/60 text-sm">Website / Social</div>
                <div>
                  {profile.website_url ? (
                    <a href={profile.website_url} target="_blank" rel="noopener noreferrer" className="text-white hover:underline break-all">
                      {profile.website_url}
                    </a>
                  ) : (
                    '-'
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-white/60 text-sm">Joined</div>
                <div>{profile.created_at ? new Date(profile.created_at).toLocaleDateString() : '-'}</div>
              </div>
            </div>
          </div>

          {/* Stats block - Following, Followers, Referrals */}
          <div className="card p-4 md:p-6">
            <div className="grid grid-cols-3 gap-4">
              <div className={`p-4 rounded-xl border-2 ${
                isLight 
                  ? 'border-telegram-blue/30 bg-gradient-to-br from-telegram-blue/10 to-telegram-blue-light/10' 
                  : 'border-telegram-blue/40 bg-gradient-to-br from-telegram-blue/15 to-telegram-blue-light/15'
              } shadow-lg`}>
                <div className={`text-xs font-medium mb-2 uppercase tracking-wider ${
                  isLight ? 'text-telegram-text-secondary' : 'text-white/60'
                }`}>
                  Following
                </div>
                <div className={`text-3xl font-bold ${
                  isLight 
                    ? 'bg-gradient-to-r from-telegram-blue to-telegram-blue-light bg-clip-text text-transparent' 
                    : 'bg-gradient-to-r from-telegram-blue-light to-telegram-blue bg-clip-text text-transparent'
                }`}>
                  {followingCount}
                </div>
              </div>
              <div className={`p-4 rounded-xl border-2 ${
                isLight 
                  ? 'border-telegram-blue/30 bg-gradient-to-br from-telegram-blue/10 to-telegram-blue-light/10' 
                  : 'border-telegram-blue/40 bg-gradient-to-br from-telegram-blue/15 to-telegram-blue-light/15'
              } shadow-lg`}>
                <div className={`text-xs font-medium mb-2 uppercase tracking-wider ${
                  isLight ? 'text-telegram-text-secondary' : 'text-white/60'
                }`}>
                  Followers
                </div>
                <div className={`text-3xl font-bold ${
                  isLight 
                    ? 'bg-gradient-to-r from-telegram-blue to-telegram-blue-light bg-clip-text text-transparent' 
                    : 'bg-gradient-to-r from-telegram-blue-light to-telegram-blue bg-clip-text text-transparent'
                }`}>
                  {followersCount}
                </div>
              </div>
              <div className={`p-4 rounded-xl border-2 ${
                isLight 
                  ? 'border-telegram-blue/30 bg-gradient-to-br from-telegram-blue/10 to-telegram-blue-light/10' 
                  : 'border-telegram-blue/40 bg-gradient-to-br from-telegram-blue/15 to-telegram-blue-light/15'
              } shadow-lg`}>
                <div className={`text-xs font-medium mb-2 uppercase tracking-wider ${
                  isLight ? 'text-telegram-text-secondary' : 'text-white/60'
                }`}>
                  Referrals
                </div>
                <div className={`text-3xl font-bold ${
                  isLight 
                    ? 'bg-gradient-to-r from-telegram-blue to-telegram-blue-light bg-clip-text text-transparent' 
                    : 'bg-gradient-to-r from-telegram-blue-light to-telegram-blue bg-clip-text text-transparent'
                }`}>
                  {referralsCount}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Badges block */}
      {!loadingProfile && profile && displayedBadges.length > 0 && (
        <div className="card p-4 md:p-6">
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
          <div className="absolute inset-0 bg-black/80" onClick={() => !feedbackPending && setFeedbackOpen(false)} />
          <div className="relative z-10 w-full max-w-md mx-auto p-4">
            <div className="card p-4 md:p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-white/90 font-medium">Leave opinion</div>
                <button onClick={() => !feedbackPending && setFeedbackOpen(false)} className="text-white/60 hover:text-white">✕</button>
              </div>
              <textarea
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="Write why you vote up or down (optional)"
                className="w-full bg-transparent border border-white/10 rounded-2xl p-3 outline-none text-white min-h-[120px]"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={() => submitFeedback('up')}
                  disabled={feedbackPending}
                  className="px-3 py-2 rounded-xl border border-emerald-300 text-emerald-300 hover:bg-emerald-300/10"
                >
                  UP
                </button>
                <button
                  onClick={() => submitFeedback('down')}
                  disabled={feedbackPending}
                  className="px-3 py-2 rounded-xl border border-rose-300 text-rose-300 hover:bg-rose-300/10"
                >
                  Down
                </button>
                <div className="ml-auto text-sm text-white/60">This helps adjust Trust Flow</div>
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

      {/* Posts */}
      <div className="space-y-4">
        <h2 className="text-lg text-white/90">Posts</h2>
        {loadingPosts ? (
          <div className="text-white/70">Loading posts…</div>
        ) : posts.length === 0 ? (
          <div className="text-white/70">No posts yet</div>
        ) : (
          <div className="space-y-4">
            {posts.map((p) => {
              const profileData = profile ? { username: profile.username || profile.user_id.slice(0, 8), avatar_url: profile.avatar_url } : null;
              const avatar = profileData?.avatar_url || AVATAR_FALLBACK;
              const username = profileData?.username || (p.user_id ? p.user_id.slice(0, 8) : "Unknown");
              const commentCount = commentCounts[p.id] ?? 0;

              // Format date like in feed
              const formatPostDate = (dateString: string): string => {
                const date = new Date(dateString);
                if (Number.isNaN(date.getTime())) return dateString;
                
                const datePart = new Intl.DateTimeFormat('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                }).format(date);
                
                const timePart = new Intl.DateTimeFormat('en-US', {
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true,
                }).format(date);
                
                return `${datePart}, ${timePart}`;
              };

              const Eye = () => (
                <svg viewBox="0 0 24 24" className="h-5 w-5">
                  <path
                    d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                  <circle
                    cx="12"
                    cy="12"
                    r="3"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                </svg>
              );

              return (
                <PostCard
                  key={p.id}
                  post={{
                    id: String(p.id),
                    author: username,
                    content: p.body ?? '',
                    createdAt: p.created_at,
                    commentsCount: commentCount,
                  }}
                  disableNavigation={true}
                  className={`telegram-card-feature md:p-6 space-y-2 relative transition-transform duration-200 ease-out`}
                  renderContent={() => (
                    <div className="relative z-10 space-y-2">
                      {/* header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0 flex-1 pr-2">
                          <img
                            src={avatar}
                            alt="avatar"
                            className="h-9 w-9 rounded-full object-cover border border-white/10 shrink-0"
                          />
                          <div className="flex flex-col min-w-0">
                            <Link
                              href={`/u/${profile?.username || profile?.user_id}`}
                              onClick={(e) => e.stopPropagation()}
                              className={`text-sm truncate hover:underline ${isLight ? "text-telegram-text" : "text-telegram-text"}`}
                              data-prevent-card-navigation="true"
                            >
                              {username}
                            </Link>
                          </div>
                        </div>
                        <div className={`relative flex items-center gap-2 text-xs shrink-0 ${isLight ? "text-telegram-text-secondary" : "text-telegram-text-secondary"}`}>
                          <span className="whitespace-nowrap">{formatPostDate(p.created_at)}</span>
                        </div>
                      </div>

                      {/* content */}
                      <div
                        className="relative cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/post/${p.id}`);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            router.push(`/post/${p.id}`);
                          }
                        }}
                        tabIndex={0}
                        role="button"
                        aria-label="Open post"
                      >
                        {p.body && <p className={`leading-relaxed break-words ${isLight ? "text-telegram-text" : "text-telegram-text"}`}>{p.body}</p>}
                        {p.image_url && (
                          <div className="mt-3 flex justify-center">
                            <img
                              src={p.image_url}
                              loading="lazy"
                              className={`max-w-full max-h-[500px] w-auto h-auto rounded-2xl border object-contain ${isLight ? "border-telegram-blue/20" : "border-telegram-blue/30"}`}
                              alt="post image"
                            />
                          </div>
                        )}
                        {p.video_url && (
                          <div className="mt-3 flex justify-center">
                            <video
                              controls
                              preload="metadata"
                              className={`max-w-full max-h-[500px] w-auto h-auto rounded-2xl border ${isLight ? "border-telegram-blue/20" : "border-telegram-blue/30"}`}
                            >
                              <source src={p.video_url} />
                            </video>
                          </div>
                        )}
                      </div>

                      {/* footer */}
                      <div className={`flex items-center gap-5 ${isLight ? "text-telegram-text-secondary" : "text-telegram-text-secondary"}`}>
                        <div className="flex items-center gap-1" title="Views">
                          <Eye />
                          <span className="text-sm">{viewsByPostId[p.id] ?? 0}</span>
                        </div>
                        <div className={`ml-auto text-sm ${isLight ? "text-telegram-text-secondary" : "text-telegram-text-secondary"}`}>
                          Comments: {commentCount}
                        </div>
                      </div>
                    </div>
                  )}
                />
              );
            })}
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
  const avatar = profile?.avatar_url ||
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
  const avatar = user?.avatar_url ||
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

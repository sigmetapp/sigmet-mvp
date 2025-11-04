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
import PostReactions, { ReactionType } from '@/components/PostReactions';
import PostCommentsBadge from '@/components/PostCommentsBadge';
import PostActionMenu from '@/components/PostActionMenu';
import { Paperclip } from 'lucide-react';

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
};

type Post = {
  id: number;
  user_id: string | null;
  body: string | null;
  image_url: string | null;
  video_url: string | null;
  created_at: string;
  views?: number;
  category?: string | null;
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
  const [connectionsCount, setConnectionsCount] = useState<number>(0);
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
  
  // Post reactions state
  const [reactionsByPostId, setReactionsByPostId] = useState<
    Record<number, Record<ReactionType, number>>
  >({});
  const [selectedReactionsByPostId, setSelectedReactionsByPostId] = useState<
    Record<number, ReactionType | null>
  >({});
  
  // Growth statuses from growth-directions (proud, grateful, drained)
  const [growthStatusesByPostId, setGrowthStatusesByPostId] = useState<
    Record<number, Array<'proud' | 'grateful' | 'drained'>>
  >({});
  
  // Track viewed posts to avoid duplicate view increments
  const viewedOnce = useRef<Set<number>>(new Set());
  
  // Open comments state
  const [openComments, setOpenComments] = useState<Record<number, boolean>>({});
  const [commentInput, setCommentInput] = useState<Record<number, string>>({});
  const [commentFile, setCommentFile] = useState<Record<number, File | null>>({});
  
  // Edit post state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editBody, setEditBody] = useState<string>("");

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
        .select('user_id, username, full_name, bio, country, website_url, facebook_url, instagram_url, twitter_url, avatar_url, directions_selected, show_online_status, created_at')
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
        .select('id, user_id, body, image_url, video_url, created_at, views, category')
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

  // Load reactions for posts
  useEffect(() => {
    if (posts.length === 0 || !viewerId) return;
    (async () => {
      try {
        const ids = posts.map((p) => p.id);
        const { data } = await supabase
          .from("post_reactions")
          .select("post_id, kind, user_id")
          .in("post_id", ids);

        const counts: Record<number, Record<ReactionType, number>> = {};
        const selected: Record<number, ReactionType | null> = {};

        for (const post of posts) {
          counts[post.id] = {
            inspire: 0,
            respect: 0,
            relate: 0,
            support: 0,
            celebrate: 0,
          };
          selected[post.id] = null;
        }

        if (data) {
          for (const r of data as any[]) {
            const pid = r.post_id as number;
            const kind = r.kind as string;
            const userId = r.user_id as string;

            const reactionMap: Record<string, ReactionType> = {
              inspire: 'inspire',
              respect: 'respect',
              relate: 'relate',
              support: 'support',
              celebrate: 'celebrate',
            };

            const reactionType = reactionMap[kind];
            if (reactionType && counts[pid]) {
              counts[pid][reactionType] = (counts[pid][reactionType] || 0) + 1;
              if (viewerId && userId === viewerId) {
                selected[pid] = reactionType;
              }
            }
          }
        }

        setReactionsByPostId(counts);
        setSelectedReactionsByPostId(selected);
      } catch (error) {
        console.error('Error loading reactions:', error);
        const counts: Record<number, Record<ReactionType, number>> = {};
        const selected: Record<number, ReactionType | null> = {};
        for (const post of posts) {
          counts[post.id] = {
            inspire: 0,
            respect: 0,
            relate: 0,
            support: 0,
            celebrate: 0,
          };
          selected[post.id] = null;
        }
        setReactionsByPostId(counts);
        setSelectedReactionsByPostId(selected);
      }
    })();
  }, [viewerId, posts]);

  // Load growth statuses (proud, grateful, drained) for posts
  useEffect(() => {
    if (posts.length === 0) return;
    (async () => {
      try {
        const ids = posts.map((p) => p.id);
        const { data } = await supabase
          .from('post_reactions')
          .select('post_id, kind')
          .in('post_id', ids)
          .in('kind', ['proud', 'grateful', 'drained']);

        const statusesByPost: Record<number, Array<'proud' | 'grateful' | 'drained'>> = {};
        
        for (const post of posts) {
          statusesByPost[post.id] = [];
        }

        if (data) {
          for (const r of data as any[]) {
            const pid = r.post_id as number;
            const kind = r.kind as string;
            if ((kind === 'proud' || kind === 'grateful' || kind === 'drained') && statusesByPost[pid] !== undefined) {
              const status = kind as 'proud' | 'grateful' | 'drained';
              if (!statusesByPost[pid].includes(status)) {
                statusesByPost[pid].push(status);
              }
            }
          }
        }

        setGrowthStatusesByPostId(statusesByPost);
      } catch (error) {
        console.error('Error loading growth statuses:', error);
        const statusesByPost: Record<number, Array<'proud' | 'grateful' | 'drained'>> = {};
        for (const post of posts) {
          statusesByPost[post.id] = [];
        }
        setGrowthStatusesByPostId(statusesByPost);
      }
    })();
  }, [posts]);

  // Track views via RPC
  async function addViewOnce(postId: number) {
    if (viewedOnce.current.has(postId)) return;
    viewedOnce.current.add(postId);
    setViewsByPostId((prev) => ({
      ...prev,
      [postId]: (prev[postId] ?? 0) + 1,
    }));
    try {
      const { error } = await supabase.rpc("increment_post_views", {
        p_id: postId,
      });
      if (error) throw error;
    } catch {
      const current = viewsByPostId[postId] ?? 0;
      await supabase
        .from("posts")
        .update({ views: current + 1 })
        .eq("id", postId);
    }
  }

  // Upload comment media
  async function uploadCommentToStorage(file: File) {
    const ext = file.name.split(".").pop() || "bin";
    const path = `media/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const bucket = supabase.storage.from("comments");
    const { error } = await bucket.upload(path, file, {
      upsert: false,
      contentType: file.type,
    });
    if (error) throw error;
    const { data } = bucket.getPublicUrl(path);
    return data.publicUrl as string;
  }

  // Add comment
  async function addComment(postId: number) {
    if (!viewerId) return alert("Sign in required");
    const text = (commentInput[postId] || "").trim();
    const file = commentFile[postId] || null;
    if (!text && !file) return;
    try {
      let media_url: string | null = null;
      if (file) {
        media_url = await uploadCommentToStorage(file);
      }
      const { data, error } = await supabase
        .from("comments")
        .insert({ post_id: postId, user_id: viewerId, body: text || null, media_url, parent_id: null })
        .select("*")
        .single();
      if (error) throw error;
      if (data) {
        setCommentCounts((prev) => ({ ...prev, [postId]: (prev[postId] || 0) + 1 }));
        setCommentInput((prev) => ({ ...prev, [postId]: "" }));
        setCommentFile((prev) => ({ ...prev, [postId]: null }));
      }
    } catch (e: any) {
      alert(e.message || "Failed to add comment");
    }
  }

  // Edit/delete post
  async function deletePost(p: Post) {
    const { error } = await supabase.from("posts").delete().eq("id", p.id);
    if (error) return alert(error.message);
    setPosts((prev) => prev.filter((x) => x.id !== p.id));
  }

  async function saveEdit(p: Post) {
    const { data, error } = await supabase
      .from("posts")
      .update({ body: editBody })
      .eq("id", p.id)
      .select("*")
      .single();
    if (!error && data) {
      setPosts((prev) =>
        prev.map((x) => (x.id === p.id ? (data as Post) : x))
      );
      setEditingId(null);
    }
  }

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
          {/* Info block - Bio, Location, Website, Joined */}
          <div className="card p-4 md:p-6">
            <div className="space-y-4">
              {/* Bio */}
              {profile.bio && (
                <div className="flex items-start gap-3">
                  <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${
                    isLight 
                      ? 'bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/30' 
                      : 'bg-gradient-to-br from-purple-500/15 to-pink-500/15 border border-purple-500/30'
                  }`}>
                    <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-xs font-medium mb-1 uppercase tracking-wider ${
                      isLight ? 'text-telegram-text-secondary' : 'text-white/60'
                    }`}>
                      Bio
                    </div>
                    <div className={`text-sm leading-relaxed ${isLight ? 'text-telegram-text' : 'text-white/90'}`}>
                      {profile.bio}
                    </div>
                  </div>
                </div>
              )}

              {/* Location */}
              {profile.country && (
                <div className="flex items-start gap-3">
                  <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${
                    isLight 
                      ? 'bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/30' 
                      : 'bg-gradient-to-br from-blue-500/15 to-cyan-500/15 border border-blue-500/30'
                  }`}>
                    <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-xs font-medium mb-1 uppercase tracking-wider ${
                      isLight ? 'text-telegram-text-secondary' : 'text-white/60'
                    }`}>
                      Country - City
                    </div>
                    <div className={`text-sm ${isLight ? 'text-telegram-text' : 'text-white/90'}`}>
                      {(() => {
                        const city = String(profile.country).split(",")[0].trim();
                        return (
                          <Link href={`/city/${encodeURIComponent(city)}`} className="hover:underline inline-flex items-center gap-1">
                            <span>{profile.country}</span>
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </Link>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              )}

              {/* Website */}
              {profile.website_url && (
                <div className="flex items-start gap-3">
                  <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${
                    isLight 
                      ? 'bg-gradient-to-br from-teal-500/20 to-emerald-500/20 border border-teal-500/30' 
                      : 'bg-gradient-to-br from-teal-500/15 to-emerald-500/15 border border-teal-500/30'
                  }`}>
                    <svg className="w-5 h-5 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-xs font-medium mb-1 uppercase tracking-wider ${
                      isLight ? 'text-telegram-text-secondary' : 'text-white/60'
                    }`}>
                      Website / Social
                    </div>
                    <div className={`text-sm ${isLight ? 'text-telegram-text' : 'text-white/90'}`}>
                      <a 
                        href={profile.website_url} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="hover:underline inline-flex items-center gap-1 break-all"
                      >
                        <span className="truncate">{profile.website_url}</span>
                        <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {/* Joined */}
              {profile.created_at && (
                <div className="flex items-start gap-3">
                  <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${
                    isLight 
                      ? 'bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30' 
                      : 'bg-gradient-to-br from-amber-500/15 to-orange-500/15 border border-amber-500/30'
                  }`}>
                    <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-xs font-medium mb-1 uppercase tracking-wider ${
                      isLight ? 'text-telegram-text-secondary' : 'text-white/60'
                    }`}>
                      Joined
                    </div>
                    <div className={`text-sm ${isLight ? 'text-telegram-text' : 'text-white/90'}`}>
                      {new Date(profile.created_at).toLocaleDateString('en-GB', { 
                        day: '2-digit', 
                        month: '2-digit', 
                        year: 'numeric' 
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Stats block - Connections, Following, Followers, Referrals */}
          <div className="card p-4 md:p-6">
            <div className="space-y-3">
              {/* Connections */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${
                    isLight 
                      ? 'bg-gradient-to-br from-violet-500/20 to-purple-500/20 border border-violet-500/30' 
                      : 'bg-gradient-to-br from-violet-500/15 to-purple-500/15 border border-violet-500/30'
                  }`}>
                    <svg className="w-5 h-5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-xs font-medium mb-0.5 uppercase tracking-wider ${
                      isLight ? 'text-telegram-text-secondary' : 'text-white/60'
                    }`}>
                      Connections
                    </div>
                    <div className={`text-sm ${isLight ? 'text-telegram-text-secondary' : 'text-white/70'}`}>
                      Mutual connections
                    </div>
                  </div>
                </div>
                <div className={`text-2xl font-bold ${
                  isLight 
                    ? 'bg-gradient-to-r from-violet-500 to-purple-500 bg-clip-text text-transparent' 
                    : 'bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent'
                }`}>
                  {connectionsCount}
                </div>
              </div>

              {/* Following */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${
                    isLight 
                      ? 'bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30' 
                      : 'bg-gradient-to-br from-indigo-500/15 to-purple-500/15 border border-indigo-500/30'
                  }`}>
                    <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-xs font-medium mb-0.5 uppercase tracking-wider ${
                      isLight ? 'text-telegram-text-secondary' : 'text-white/60'
                    }`}>
                      Following
                    </div>
                    <div className={`text-sm ${isLight ? 'text-telegram-text-secondary' : 'text-white/70'}`}>
                      People you follow
                    </div>
                  </div>
                </div>
                <div className={`text-2xl font-bold ${
                  isLight 
                    ? 'bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent' 
                    : 'bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent'
                }`}>
                  {followingCount}
                </div>
              </div>

              {/* Followers */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${
                    isLight 
                      ? 'bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/30' 
                      : 'bg-gradient-to-br from-blue-500/15 to-cyan-500/15 border border-blue-500/30'
                  }`}>
                    <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-xs font-medium mb-0.5 uppercase tracking-wider ${
                      isLight ? 'text-telegram-text-secondary' : 'text-white/60'
                    }`}>
                      Followers
                    </div>
                    <div className={`text-sm ${isLight ? 'text-telegram-text-secondary' : 'text-white/70'}`}>
                      People following you
                    </div>
                  </div>
                </div>
                <div className={`text-2xl font-bold ${
                  isLight 
                    ? 'bg-gradient-to-r from-blue-500 to-cyan-500 bg-clip-text text-transparent' 
                    : 'bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent'
                }`}>
                  {followersCount}
                </div>
              </div>

              {/* Referrals */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${
                    isLight 
                      ? 'bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30' 
                      : 'bg-gradient-to-br from-emerald-500/15 to-teal-500/15 border border-emerald-500/30'
                  }`}>
                    <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-xs font-medium mb-0.5 uppercase tracking-wider ${
                      isLight ? 'text-telegram-text-secondary' : 'text-white/60'
                    }`}>
                      Referrals
                    </div>
                    <div className={`text-sm ${isLight ? 'text-telegram-text-secondary' : 'text-white/70'}`}>
                      Invited users
                    </div>
                  </div>
                </div>
                <div className={`text-2xl font-bold ${
                  isLight 
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 bg-clip-text text-transparent' 
                    : 'bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent'
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
                  className={`telegram-card-feature md:p-6 space-y-2 relative transition-transform duration-200 ease-out ${
                    (() => {
                      const hasCategory = p.category && p.category.trim() !== '';
                      const categoryDirection = hasCategory && availableDirections.find((dir) => {
                        const categoryLower = p.category?.toLowerCase() || '';
                        const dirTitleLower = dir.title.toLowerCase();
                        const dirSlugLower = dir.slug.toLowerCase();
                        return categoryLower.includes(dirTitleLower) || 
                               categoryLower.includes(dirSlugLower) ||
                               dirTitleLower.includes(categoryLower) ||
                               dirSlugLower.includes(categoryLower);
                      });
                      return hasCategory && categoryDirection
                        ? 'ring-2 ring-telegram-blue border-2 border-telegram-blue/60 shadow-lg bg-gradient-to-br from-telegram-blue/5 to-telegram-blue-light/5'
                        : '';
                    })()
                  }`}
                  onMouseEnter={() => addViewOnce(p.id)}
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
                            {(p.category || (growthStatusesByPostId[p.id] && growthStatusesByPostId[p.id].length > 0)) && (
                              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                {p.category && (() => {
                                  const hasCategory = p.category && p.category.trim() !== '';
                                  const categoryDirection = hasCategory && availableDirections.find((dir) => {
                                    const categoryLower = p.category?.toLowerCase() || '';
                                    const dirTitleLower = dir.title.toLowerCase();
                                    const dirSlugLower = dir.slug.toLowerCase();
                                    return categoryLower.includes(dirTitleLower) || 
                                           categoryLower.includes(dirSlugLower) ||
                                           dirTitleLower.includes(categoryLower) ||
                                           dirSlugLower.includes(categoryLower);
                                  });
                                  return (
                                    <div className={`text-xs px-2 py-1 rounded-md font-medium ${
                                      hasCategory && categoryDirection
                                        ? isLight
                                          ? 'bg-telegram-blue/25 text-telegram-blue border border-telegram-blue/40 shadow-sm'
                                          : 'bg-telegram-blue/35 text-telegram-blue-light border border-telegram-blue/60 shadow-sm'
                                        : isLight
                                        ? 'text-telegram-text-secondary bg-telegram-bg-secondary/50'
                                        : 'text-telegram-text-secondary bg-white/5'
                                    }`}>
                                      {categoryDirection ? `${categoryDirection.emoji} ${p.category}` : p.category}
                                    </div>
                                  );
                                })()}
                                {growthStatusesByPostId[p.id] && growthStatusesByPostId[p.id].length > 0 && growthStatusesByPostId[p.id].map((status) => {
                                  const statusConfig = {
                                    proud: { emoji: String.fromCodePoint(0x1F7E2), label: 'Proud', color: isLight ? 'bg-green-500/20 text-green-600 border-green-500/30' : 'bg-green-500/25 text-green-400 border-green-500/40' },
                                    grateful: { emoji: String.fromCodePoint(0x1FA75), label: 'Grateful', color: isLight ? 'bg-yellow-500/20 text-yellow-600 border-yellow-500/30' : 'bg-yellow-500/25 text-yellow-400 border-yellow-500/40' },
                                    drained: { emoji: String.fromCodePoint(0x26AB), label: 'Drained', color: isLight ? 'bg-gray-500/20 text-gray-600 border-gray-500/30' : 'bg-gray-500/25 text-gray-400 border-gray-500/40' },
                                  };
                                  const config = statusConfig[status];
                                  return (
                                    <div
                                      key={status}
                                      className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium inline-flex items-center gap-1 border ${config.color}`}
                                      title={config.label}
                                    >
                                      <span>{config.emoji}</span>
                                      <span>{config.label}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className={`relative flex items-center gap-2 text-xs shrink-0 ${isLight ? "text-telegram-text-secondary" : "text-telegram-text-secondary"}`}>
                          <span className="whitespace-nowrap">{formatPostDate(p.created_at)}</span>
                          {viewerId === p.user_id && editingId !== p.id && (
                            <div onClick={(e) => e.stopPropagation()} data-prevent-card-navigation="true">
                              <PostActionMenu
                                onEdit={() => {
                                  setEditingId(p.id);
                                  setEditBody(p.body || "");
                                }}
                                onDelete={() => deletePost(p)}
                                className="ml-2"
                              />
                            </div>
                          )}
                        </div>
                      </div>

                      {/* content */}
                      {editingId === p.id ? (
                        <div className="space-y-3">
                          <textarea
                            value={editBody}
                            onChange={(e) => setEditBody(e.target.value)}
                            className={`input w-full rounded-2xl p-3 ${isLight ? "placeholder-telegram-text-secondary/60" : "placeholder-telegram-text-secondary/50"}`}
                          />
                          <div className="flex gap-2">
                            <Button onClick={() => saveEdit(p)} variant="primary">Save</Button>
                            <Button onClick={() => setEditingId(null)} variant="secondary">Cancel</Button>
                          </div>
                        </div>
                      ) : (
                        <div
                          className="relative cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/post/${p.id}?from=profile&username=${encodeURIComponent(slug)}`);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              e.stopPropagation();
                              router.push(`/post/${p.id}?from=profile&username=${encodeURIComponent(slug)}`);
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
                      )}

                      {/* footer */}
                      <div className={`flex items-center gap-5 ${isLight ? "text-telegram-text-secondary" : "text-telegram-text-secondary"}`}>
                        <div className="flex items-center gap-1" title="Views">
                          <Eye />
                          <span className="text-sm">{viewsByPostId[p.id] ?? 0}</span>
                        </div>

                        <div onClick={(e) => e.stopPropagation()} data-prevent-card-navigation="true">
                          <PostReactions
                            postId={p.id}
                            initialCounts={reactionsByPostId[p.id] || {
                              inspire: 0,
                              respect: 0,
                              relate: 0,
                              support: 0,
                              celebrate: 0,
                            }}
                            initialSelected={selectedReactionsByPostId[p.id] || null}
                            onReactionChange={async (reaction, counts) => {
                              if (!viewerId) {
                                alert("Sign in required");
                                return;
                              }

                              try {
                                const previousReaction = selectedReactionsByPostId[p.id];

                                if (previousReaction) {
                                  const { error: deleteError } = await supabase
                                    .from("post_reactions")
                                    .delete()
                                    .eq("post_id", p.id)
                                    .eq("user_id", viewerId)
                                    .eq("kind", previousReaction);
                                  if (deleteError) {
                                    console.error("Error deleting reaction:", deleteError);
                                    throw deleteError;
                                  }
                                }

                                if (reaction) {
                                  const { error: insertError } = await supabase
                                    .from("post_reactions")
                                    .insert({
                                      post_id: p.id,
                                      user_id: viewerId,
                                      kind: reaction,
                                    });
                                  if (insertError) {
                                    console.error("Error inserting reaction:", insertError);
                                    throw insertError;
                                  }
                                }

                                const { data } = await supabase
                                  .from("post_reactions")
                                  .select("post_id, kind, user_id")
                                  .eq("post_id", p.id);

                                const newCounts: Record<ReactionType, number> = {
                                  inspire: 0,
                                  respect: 0,
                                  relate: 0,
                                  support: 0,
                                  celebrate: 0,
                                };

                                if (data) {
                                  for (const r of data as any[]) {
                                    const kind = r.kind as string;
                                    const reactionMap: Record<string, ReactionType> = {
                                      inspire: 'inspire',
                                      respect: 'respect',
                                      relate: 'relate',
                                      support: 'support',
                                      celebrate: 'celebrate',
                                    };
                                    const reactionType = reactionMap[kind];
                                    if (reactionType) {
                                      newCounts[reactionType] = (newCounts[reactionType] || 0) + 1;
                                    }
                                  }
                                }

                                setReactionsByPostId((prev) => ({
                                  ...prev,
                                  [p.id]: newCounts,
                                }));
                                setSelectedReactionsByPostId((prev) => ({
                                  ...prev,
                                  [p.id]: reaction,
                                }));
                              } catch (error: any) {
                                console.error("Error updating reaction:", error);
                                alert(`Failed to update reaction: ${error?.message || "Unknown error"}`);
                              }
                            }}
                          />
                        </div>

                        <PostCommentsBadge
                          count={commentCount}
                          size="md"
                          onOpen={() => {
                            const willOpen = !openComments[p.id];
                            setOpenComments((prev) => ({ ...prev, [p.id]: willOpen }));
                          }}
                          onFocusComposer={() => {
                            const composer = document.getElementById(`comment-composer-${p.id}`);
                            if (composer) {
                              composer.focus();
                              composer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                            }
                          }}
                          className="ml-auto"
                        />
                      </div>

                      {/* Quick comment form only - no history */}
                      {openComments[p.id] && (
                        <div className="mt-3">
                          <div className="flex gap-2 items-center">
                            <input
                              id={`comment-composer-${p.id}`}
                              value={commentInput[p.id] || ""}
                              onChange={(e) =>
                                setCommentInput((prev) => ({
                                  ...prev,
                                  [p.id]: e.target.value,
                                }))
                              }
                              placeholder="Write a comment?"
                              className={`input py-2 focus:ring-0 flex-1 ${isLight ? "placeholder-telegram-text-secondary/60" : "placeholder-telegram-text-secondary/50"}`}
                            />
                            <input
                              id={`cfile-${p.id}`}
                              type="file"
                              accept="image/*,video/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0] || null;
                                setCommentFile((prev) => ({ ...prev, [p.id]: file }));
                              }}
                            />
                            <label
                              htmlFor={`cfile-${p.id}`}
                              className={`px-3 py-2 rounded-xl border text-sm cursor-pointer transition flex items-center justify-center gap-2 ${
                                isLight
                                  ? "border-telegram-blue/30 text-telegram-blue hover:bg-telegram-blue/10"
                                  : "border-telegram-blue/30 text-telegram-blue-light hover:bg-telegram-blue/15"
                              }`}
                            >
                              <Paperclip className="h-4 w-4" aria-hidden="true" />
                              <span className="sr-only">Attach file</span>
                            </label>
                            {commentFile[p.id] && (
                              <span className={`text-xs truncate max-w-[120px] ${isLight ? "text-telegram-text-secondary" : "text-telegram-text-secondary"}`}>{commentFile[p.id]?.name}</span>
                            )}
                            <button onClick={() => addComment(p.id)} className="btn btn-primary">
                              Send
                            </button>
                          </div>
                        </div>
                      )}
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

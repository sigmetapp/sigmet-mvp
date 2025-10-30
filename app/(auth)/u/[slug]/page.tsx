'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import Button from '@/components/Button';

type Profile = {
  user_id: string;
  username: string | null;
  full_name: string | null;
  bio: string | null;
  country: string | null;
  website_url?: string | null;
  avatar_url: string | null;
  directions_selected: string[] | null;
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
  likes_count?: number;
};

export default function PublicProfilePage() {
  const AVATAR_FALLBACK =
    "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='100%' height='100%' fill='%23222'/><circle cx='32' cy='24' r='14' fill='%23555'/><rect x='12' y='44' width='40' height='12' rx='6' fill='%23555'/></svg>";
  const params = useParams<{ slug: string }>();
  const slug = params?.slug as string;
  const router = useRouter();

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
  const [recentActivities, setRecentActivities] = useState<
    { kind: 'in' | 'out'; otherId: string; otherName: string; created_at: string }[]
  >([]);

  // avatar edit (only for own page)
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const isMe = useMemo(() => {
    if (!viewerId || !profile) return false;
    return viewerId === profile.user_id;
  }, [viewerId, profile]);

  useEffect(() => {
    // resolve viewer id
    supabase.auth.getUser().then(({ data }) => setViewerId(data.user?.id ?? null));
  }, []);

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
        .select('user_id, username, full_name, bio, country, website_url, avatar_url, directions_selected, created_at')
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
        .select('id, user_id, body, image_url, video_url, created_at, views, likes_count')
        .eq('user_id', profile.user_id)
        .order('created_at', { ascending: false })
        .limit(50);
      setPosts((data as Post[]) || []);
      setLoadingPosts(false);
    })();
  }, [profile?.user_id]);

  // --- Reactions and comments state (for posts rendering)
  type ReactionKind = 'growth' | 'value' | 'with_you';
  const REACTION_META: Record<ReactionKind, { label: string; emoji: string }> = {
    growth: { label: 'Growth', emoji: '🌱' },
    value: { label: 'Value', emoji: '💎' },
    with_you: { label: 'With You', emoji: '🤝' },
  };
  const [reactionsByPostId, setReactionsByPostId] = useState<
    Record<number, { growth: number; value: number; with_you: number }>
  >({});
  const [myReactionsByPostId, setMyReactionsByPostId] = useState<
    Record<number, Set<ReactionKind>>
  >({});
  const [reactionBursts, setReactionBursts] = useState<Record<string, number>>({});
  const [openComments, setOpenComments] = useState<Record<number, boolean>>({});
  const [commentInput, setCommentInput] = useState<Record<number, string>>({});
  const [replyInput, setReplyInput] = useState<Record<number, string>>({});
  const [replyOpen, setReplyOpen] = useState<Record<number, boolean>>({});
  const [commentFile, setCommentFile] = useState<Record<number, File | null>>({});
  type Comment = {
    id: number;
    post_id: number;
    user_id: string | null;
    body: string | null;
    media_url?: string | null;
    parent_id?: number | null;
    created_at: string;
  };
  const [comments, setComments] = useState<Record<number, Comment[]>>({});
  const [commentCounts, setCommentCounts] = useState<Record<number, number>>({});
  const [commentScores, setCommentScores] = useState<Record<number, number>>({});
  const [myCommentVotes, setMyCommentVotes] = useState<Record<number, -1 | 0 | 1>>({});
  const viewedOnce = useRef<Set<number>>(new Set());

  // Preload reactions for posts
  useEffect(() => {
    if (posts.length === 0) return;
    (async () => {
      try {
        const ids = posts.map((p) => p.id);
        const { data, error } = await supabase
          .from('post_reactions')
          .select('post_id, kind, user_id')
          .in('post_id', ids);
        if (error || !data) return;
        const counts: Record<number, { growth: number; value: number; with_you: number }> = {};
        const mine: Record<number, Set<ReactionKind>> = {};
        for (const r of data as any[]) {
          const pid = r.post_id as number;
          const kind = (r.kind as string) as ReactionKind;
          if (!counts[pid]) counts[pid] = { growth: 0, value: 0, with_you: 0 };
          if (kind in counts[pid]) (counts[pid] as any)[kind] += 1;
          if (r.user_id && r.user_id === viewerId) {
            if (!mine[pid]) mine[pid] = new Set();
            mine[pid].add(kind);
          }
        }
        setReactionsByPostId(counts);
        setMyReactionsByPostId(mine);
      } catch {
        // ignore
      }
    })();
  }, [posts, viewerId]);

  // Preload comment counts for posts
  useEffect(() => {
    if (posts.length === 0) return;
    (async () => {
      try {
        const ids = posts.map((p) => p.id);
        const { data } = await supabase
          .from('comments')
          .select('post_id')
          .in('post_id', ids);
        const counts: Record<number, number> = {};
        for (const row of (data as any[]) || []) {
          const pid = row.post_id as number;
          counts[pid] = (counts[pid] || 0) + 1;
        }
        setCommentCounts(counts);
      } catch {
        // ignore
      }
    })();
  }, [posts]);

  // Add a view once per hover
  async function addViewOnce(postId: number) {
    if (viewedOnce.current.has(postId)) return;
    viewedOnce.current.add(postId);
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, views: (p.views ?? 0) + 1 } : p)));
    try {
      const { error } = await supabase.rpc('increment_post_views', { p_id: postId });
      if (error) throw error;
    } catch {
      const current = posts.find((p) => p.id === postId)?.views ?? 0;
      await supabase.from('posts').update({ views: current + 1 }).eq('id', postId);
    }
  }

  async function toggleReaction(postId: number, kind: ReactionKind) {
    if (!viewerId) return alert('Sign in required');
    const mySet = myReactionsByPostId[postId] || new Set<ReactionKind>();
    const has = mySet.has(kind);
    try {
      if (!has) {
        const { error } = await supabase
          .from('post_reactions')
          .insert({ post_id: postId, user_id: viewerId, kind });
        if (error) throw error;
        setMyReactionsByPostId((prev) => {
          const next = { ...prev } as any;
          const s = new Set(next[postId] || []);
          s.add(kind);
          next[postId] = s;
          return next;
        });
        setReactionsByPostId((prev) => {
          const base = prev[postId] || { growth: 0, value: 0, with_you: 0 };
          return { ...prev, [postId]: { ...base, [kind]: (base as any)[kind] + 1 } } as any;
        });
        const key = `${postId}:${kind}`;
        setReactionBursts((prev) => ({ ...prev, [key]: Date.now() }));
        setTimeout(() => {
          setReactionBursts((prev) => {
            const next = { ...prev } as any;
            delete next[key];
            return next;
          });
        }, 500);
      } else {
        const { error } = await supabase
          .from('post_reactions')
          .delete()
          .eq('post_id', postId)
          .eq('user_id', viewerId)
          .eq('kind', kind);
        if (error) throw error;
        setMyReactionsByPostId((prev) => {
          const next = { ...prev } as any;
          const s = new Set(next[postId] || []);
          s.delete(kind);
          next[postId] = s;
          return next;
        });
        setReactionsByPostId((prev) => {
          const base = prev[postId] || { growth: 0, value: 0, with_you: 0 };
          return { ...prev, [postId]: { ...base, [kind]: Math.max(0, (base as any)[kind] - 1) } } as any;
        });
      }
    } catch (e) {
      // ignore
    }
  }

  async function uploadCommentToStorage(file: File) {
    const ext = file.name.split('.').pop() || 'bin';
    const path = `media/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const bucket = supabase.storage.from('comments');
    const { error } = await bucket.upload(path, file, { upsert: false, contentType: file.type });
    if (error) throw error;
    const { data } = bucket.getPublicUrl(path);
    return data.publicUrl as string;
  }

  async function loadComments(postId: number) {
    const { data, error, count } = await supabase
      .from('comments')
      .select('*', { count: 'exact' })
      .eq('post_id', postId)
      .order('created_at', { ascending: true });
    if (!error && data) {
      setComments((prev) => ({ ...prev, [postId]: data as any }));
      setCommentCounts((prev) => ({ ...prev, [postId]: count ?? (data as any).length }));
      // votes preload
      try {
        const cids = (data as any[]).map((c) => c.id as number);
        const { data: votes } = await supabase
          .from('comment_votes')
          .select('comment_id, user_id, value')
          .in('comment_id', cids);
        if (votes) {
          const scoreMap: Record<number, number> = {};
          const myMap: Record<number, -1 | 0 | 1> = {};
          for (const v of votes as any[]) {
            const cid = v.comment_id as number;
            const val = Number(v.value) as -1 | 1;
            scoreMap[cid] = (scoreMap[cid] || 0) + val;
            if (v.user_id === viewerId) myMap[cid] = val;
          }
          setCommentScores((prev) => ({ ...prev, ...scoreMap }));
          setMyCommentVotes((prev) => ({ ...prev, ...myMap }));
        }
      } catch {}
    }
  }

  async function addComment(postId: number, parentId?: number | null) {
    if (!viewerId) return alert('Sign in required');
    const text = (commentInput[postId] || '').trim();
    const file = commentFile[postId] || null;
    if (!text && !file) return;
    try {
      let media_url: string | null = null;
      if (file) media_url = await uploadCommentToStorage(file);
      const { data, error } = await supabase
        .from('comments')
        .insert({ post_id: postId, user_id: viewerId, body: text || null, media_url, parent_id: parentId || null })
        .select('*')
        .single();
      if (error) throw error;
      if (data) {
        setComments((prev) => ({ ...prev, [postId]: [...(prev[postId] || []), data as any] }));
        setCommentCounts((prev) => ({ ...prev, [postId]: (prev[postId] || 0) + 1 }));
        setCommentInput((prev) => ({ ...prev, [postId]: '' }));
        setCommentFile((prev) => ({ ...prev, [postId]: null }));
      }
    } catch (e: any) {
      alert(e.message || 'Failed to add comment');
    }
  }

  async function voteComment(commentId: number, value: -1 | 1) {
    if (!viewerId) return alert('Sign in required');
    const current = myCommentVotes[commentId] || 0;
    const next = current === value ? 0 : value;
    try {
      if (next === 0) {
        await supabase.from('comment_votes').delete().eq('comment_id', commentId).eq('user_id', viewerId);
      } else if (current === 0) {
        await supabase.from('comment_votes').insert({ comment_id: commentId, user_id: viewerId, value: next });
      } else {
        await supabase.from('comment_votes').update({ value: next }).eq('comment_id', commentId).eq('user_id', viewerId);
      }
      setMyCommentVotes((prev) => ({ ...prev, [commentId]: next }));
      setCommentScores((prev) => ({ ...prev, [commentId]: (prev[commentId] || 0) + (next - (current || 0)) }));
    } catch {}
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
      } catch {
        setFollowersCount(0);
        setFollowingCount(0);
        setReferralsCount(0);
      }
    })();
  }, [profile?.user_id]);

  // Load recent social activities (follows in/out)
  useEffect(() => {
    (async () => {
      if (!profile?.user_id) { setRecentActivities([]); return; }
      try {
        const { data, error } = await supabase
          .from('follows')
          .select('follower_id, followee_id, created_at')
          .or(`follower_id.eq.${profile.user_id},followee_id.eq.${profile.user_id}`)
          .order('created_at', { ascending: false })
          .limit(5);
        if (error || !data) { setRecentActivities([]); return; }
        const rows = data as any[];
        const otherIds = Array.from(new Set(rows.map((r) => (r.follower_id === profile.user_id ? r.followee_id : r.follower_id)).filter(Boolean)));
        let nameMap: Record<string, string> = {};
        if (otherIds.length > 0) {
          const { data: profs } = await supabase
            .from('profiles')
            .select('user_id, username, full_name')
            .in('user_id', otherIds);
          for (const p of ((profs as any[]) || [])) {
            const name = (p.full_name as string) || (p.username as string) || (p.user_id as string).slice(0, 8);
            nameMap[p.user_id as string] = name;
          }
        }
        const items = rows.map((r) => {
          const isOut = r.follower_id === profile.user_id;
          const otherId = isOut ? (r.followee_id as string) : (r.follower_id as string);
          return {
            kind: isOut ? ('out' as const) : ('in' as const),
            otherId,
            otherName: nameMap[otherId] || (otherId ? otherId.slice(0, 8) : '—'),
            created_at: String(r.created_at || new Date().toISOString()),
          };
        });
        setRecentActivities(items);
      } catch {
        setRecentActivities([]);
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

  const GROWTH_AREAS = useMemo(
    () => [
      { id: 'health', emoji: '💚', title: 'Health' },
      { id: 'thinking', emoji: '🧠', title: 'Thinking' },
      { id: 'learning', emoji: '📚', title: 'Learning' },
      { id: 'career', emoji: '🧩', title: 'Career' },
      { id: 'finance', emoji: '💰', title: 'Finance' },
      { id: 'relationships', emoji: '🤝', title: 'Relationships' },
      { id: 'creativity', emoji: '🎨', title: 'Creativity' },
      { id: 'sport', emoji: '🏃‍♂️', title: 'Sport' },
      { id: 'habits', emoji: '⏱️', title: 'Habits' },
      { id: 'emotions', emoji: '🌿', title: 'Emotions' },
      { id: 'meaning', emoji: '✨', title: 'Meaning' },
      { id: 'community', emoji: '🏙️', title: 'Community' },
    ],
    []
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Profile header */}
      <div className="card card-glow p-4 md:p-6 relative">
        {/* Top-right Edit link to settings */}
        {(!loadingProfile && profile && isMe) && (
          <Link href="/profile" className="absolute top-3 right-3 text-sm text-white/80 hover:text-white underline">
            Edit
          </Link>
        )}
        {loadingProfile ? (
          <div className="text-white/70">Loading profile…</div>
        ) : !profile ? (
          <div className="text-white/70">Profile not found</div>
        ) : (
          <div className="flex items-start gap-5">
            <div className="relative">
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
                    onChange={async (e) => {
                      const file = e.target.files?.[0] || null;
                      if (!file) return;
                      setAvatarUploading(true);
                      try {
                        const { data: auth } = await supabase.auth.getUser();
                        const uid = auth.user?.id;
                        if (!uid) throw new Error('No auth');
                        const path = `${uid}/avatar.png`;
                        const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
                        if (upErr) throw upErr;
                        const { data } = supabase.storage.from('avatars').getPublicUrl(path);
                        // save to profile
                        await supabase.from('profiles').upsert({ user_id: uid, avatar_url: data.publicUrl }, { onConflict: 'user_id' });
                        setProfile((p) => (p ? { ...p, avatar_url: data.publicUrl } : p));
                      } catch (e) {
                        // noop
                      } finally {
                        setAvatarUploading(false);
                      }
                    }}
                  />
                  <button
                    className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs border border-white/20 bg-black/60 backdrop-blur hover:bg-black/70"
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={avatarUploading}
                    title="Edit avatar"
                  >
                    {avatarUploading ? 'Saving…' : 'Edit'}
                  </button>
                </>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-semibold text-white truncate">
                  {profile.full_name || profile.username || profile.user_id.slice(0, 8)}
                </h1>
                {!isMe && (
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
                {profile.country && <span>• {profile.country}</span>}
              </div>
              {!isMe && (
                <div className="mt-2 text-white/70 text-xs flex items-center gap-2">
                  {followsMe && <span className="px-2 py-0.5 rounded-full border border-white/20">follows you</span>}
                  {iFollow && <span className="px-2 py-0.5 rounded-full border border-white/20">you follow</span>}
                </div>
              )}
              {/* SW indicator */}
              <div className="mt-4">
                <div className="p-3 rounded-2xl border border-white/20 bg-gradient-to-br from-white/5 to-white/0 card-glow">
                  <div className="flex items-center justify-between text-white/80 text-sm mb-2">
                    <div>Social Weight</div>
                    <div>75/100</div>
                  </div>
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full w-[75%] bg-[linear-gradient(90deg,#00ffc8,#7affc0)]"></div>
                  </div>
                  <div className="mt-2 text-xs text-white/60">This metric is in development and will be available soon</div>
                </div>
              </div>

              {/* Selected directions: icons */}
              {!!profile.directions_selected?.length && (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {profile.directions_selected.slice(0, 3).map((id) => {
                    const meta = GROWTH_AREAS.find((a) => a.id === id);
                    const label = meta ? `${meta.emoji} ${meta.title}` : id;
                    return (
                      <span key={id} className="px-3 py-1.5 rounded-full text-sm border border-white/20 text-white/90 bg-white/5">
                        {label}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Info block */}
      {!loadingProfile && profile && (
        <div className="card card-glow p-4 md:p-6">
          <div className="grid md:grid-cols-2 gap-4 text-white/90">
            <div className="space-y-2">
              <div className="text-white/60 text-sm">Bio</div>
              <div>{profile.bio || '—'}</div>
            </div>
            {(() => {
              const raw = String(profile.country || '').trim();
              const parts = raw.split(',');
              const city = (parts[0] || '').trim();
              const country = (parts.slice(1).join(',') || '').trim();
              return (
                <>
                  <div className="space-y-2">
                    <div className="text-white/60 text-sm">City</div>
                    <div>
                      {city ? (
                        <Link href={`/u?city=${encodeURIComponent(city)}`} className="text-white hover:underline">{city}</Link>
                      ) : (
                        '—'
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-white/60 text-sm">Country</div>
                    <div>
                      {country || (!city && raw) ? (
                        <Link href={`/u?country=${encodeURIComponent(country || raw)}`} className="text-white hover:underline">{country || raw}</Link>
                      ) : (
                        '—'
                      )}
                    </div>
                  </div>
                </>
              );
            })()}
            <div className="space-y-2">
              <div className="text-white/60 text-sm">Website / Social</div>
              <div>
                {profile.website_url ? (
                  <a href={profile.website_url} target="_blank" rel="noopener noreferrer" className="text-white hover:underline break-all">
                    {profile.website_url}
                  </a>
                ) : (
                  '—'
                )}
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-white/60 text-sm">Joined</div>
              <div>{profile.created_at ? new Date(profile.created_at).toLocaleDateString() : '—'}</div>
            </div>
          </div>
        </div>
      )}

      {/* Social block */}
      {!loadingProfile && profile && (
        <div className="card card-glow p-4 md:p-6">
          <div className="flex flex-col md:flex-row md:items-start gap-6">
            <div className="flex flex-wrap items-center gap-6">
              <div>
                <div className="text-white/60 text-sm">Following</div>
                <div className="text-white text-lg font-medium">{followingCount}</div>
              </div>
              <div>
                <div className="text-white/60 text-sm">Followers</div>
                <div className="text-white text-lg font-medium">{followersCount}</div>
              </div>
              <div>
                <div className="text-white/60 text-sm">Referrals</div>
                <div className="text-white text-lg font-medium">{referralsCount}</div>
              </div>
            </div>
            <div className="flex-1 min-w-[200px]">
              <div className="text-white/70 text-sm mb-2">Recent activity</div>
              {recentActivities.length === 0 ? (
                <div className="text-white/50 text-sm">No recent activity</div>
              ) : (
                <ul className="space-y-1">
                  {recentActivities.map((a, idx) => (
                    <li key={idx} className="text-white/80 text-sm flex items-center justify-between">
                      <span>
                        {a.kind === 'in' ? (
                          <>New follower: <span className="text-white">{a.otherName}</span></>
                        ) : (
                          <>You followed <span className="text-white">{a.otherName}</span></>
                        )}
                      </span>
                      <span className="text-white/40 text-xs">{new Date(a.created_at).toLocaleString()}</span>
                    </li>
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
        ) : isMe ? (
          // Own page: show stats for posts
          posts.map((p) => {
            const rc = reactionsByPostId[p.id] || { growth: 0, value: 0, with_you: 0 };
            const reactionsTotal = rc.growth + rc.value + rc.with_you;
            const commentsTotal = commentCounts[p.id] ?? 0;
            return (
              <div key={p.id} className="card p-4 md:p-5 space-y-3">
                <div className="text-xs text-white/60">{new Date(p.created_at).toLocaleString()}</div>
                {p.body && <div className="text-white/90 whitespace-pre-wrap">{p.body}</div>}
                {p.image_url && <img src={p.image_url} alt="" className="rounded-2xl border border-white/10" />}
                {p.video_url && (
                  <video controls className="w-full rounded-2xl border border-white/10">
                    <source src={p.video_url} />
                  </video>
                )}
                <div className="pt-2 flex items-center gap-5 text-white/80">
                  <div className="text-sm">Views: <span className="text-white">{p.views ?? 0}</span></div>
                  <div className="text-sm">Reactions: <span className="text-white">{reactionsTotal}</span></div>
                  <div className="text-sm">Comments: <span className="text-white">{commentsTotal}</span></div>
                </div>
              </div>
            );
          })
        ) : (
          // Other user's page: render feed-like UI
          posts.map((p) => (
            <div
              key={p.id}
              className="card card-glow p-4 md:p-6 space-y-4 transition-shadow hover:shadow-[0_12px_60px_rgba(0,0,0,0.45)]"
              onMouseEnter={() => addViewOnce(p.id)}
            >
              {/* header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={profile?.avatar_url || AVATAR_FALLBACK}
                    alt="avatar"
                    className="h-9 w-9 rounded-full object-cover border border-white/10 shrink-0"
                  />
                  <div className="flex flex-col min-w-0">
                    <div className="text-sm text-white truncate">{profile?.username || profile?.full_name || profile?.user_id.slice(0, 8)}</div>
                  </div>
                </div>
                <div className="text-xs text-white/60">{new Date(p.created_at).toLocaleString()}</div>
              </div>

              {/* content */}
              <>
                {p.body && <p className="leading-relaxed text-white">{p.body}</p>}
                {p.image_url && <img src={p.image_url} loading="lazy" className="rounded-2xl border border-white/10" alt="post image" />}
                {p.video_url && (
                  <video controls preload="metadata" className="w-full rounded-2xl border border-white/10">
                    <source src={p.video_url} />
                  </video>
                )}
              </>

              {/* footer */}
              <div className="flex items-center gap-5 text-white/80">
                <div className="flex items-center gap-1" title="Views">
                  <svg viewBox="0 0 24 24" className="h-5 w-5"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" stroke="currentColor" strokeWidth="1.5" /><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" /></svg>
                  <span className="text-sm">{p.views ?? 0}</span>
                </div>
                <div className="flex items-center gap-2">
                  {(['growth', 'value', 'with_you'] as ReactionKind[]).map((k) => {
                    const active = myReactionsByPostId[p.id]?.has(k);
                    const counts = reactionsByPostId[p.id] || { growth: 0, value: 0, with_you: 0 };
                    const color =
                      k === 'growth'
                        ? active
                          ? 'bg-emerald-300 text-black border-emerald-300'
                          : 'hover:bg-emerald-300/15 border-emerald-300/30'
                        : k === 'value'
                        ? active
                          ? 'bg-cyan-300 text-black border-cyan-300'
                          : 'hover:bg-cyan-300/15 border-cyan-300/30'
                        : active
                        ? 'bg-violet-300 text-black border-violet-300'
                        : 'hover:bg-violet-300/15 border-violet-300/30';
                    return (
                      <button
                        key={k}
                        onClick={() => toggleReaction(p.id, k)}
                        className={`relative overflow-hidden px-2.5 py-1 rounded-lg text-sm border transition will-change-transform active:scale-95 ${color}`}
                        title={REACTION_META[k].label}
                      >
                        <span className="mr-1">{REACTION_META[k].emoji}</span>
                        <span>{REACTION_META[k].label}</span>
                        <span className="ml-1 text-white/70">{(counts as any)[k] ?? 0}</span>
                        {reactionBursts[`${p.id}:${k}`] && (
                          <span className={`pointer-events-none absolute inset-0 animate-ping rounded-lg opacity-40 ${
                            k === 'growth' ? 'bg-emerald-300' : k === 'value' ? 'bg-cyan-300' : 'bg-violet-300'
                          }`} />
                        )}
                      </button>
                    );
                  })}
                </div>
                <button
                  className="ml-auto text-sm underline hover:no-underline"
                  onClick={async () => {
                    const willOpen = !openComments[p.id];
                    setOpenComments((prev) => ({ ...prev, [p.id]: willOpen }));
                    if (willOpen && !(comments[p.id]?.length > 0)) {
                      await loadComments(p.id);
                    }
                  }}
                >
                  Comments ({commentCounts[p.id] ?? 0})
                </button>
              </div>

              {/* comments */}
              {openComments[p.id] && (
                <div className="space-y-2">
                  {(comments[p.id] || []).map((c) => (
                    <div key={c.id} className="rounded-xl bg-white/5 border border-white/10 p-2 text-sm">
                      <div className="text-xs text-white/60 flex items-center justify-between">
                        <span>{c.user_id ? c.user_id.slice(0, 8) : 'Anon'}</span>
                        <span>{new Date(c.created_at).toLocaleString()}</span>
                      </div>
                      {c.body && <div className="mt-1 whitespace-pre-wrap">{c.body}</div>}
                      {c.media_url && (
                        c.media_url.match(/\.(mp4|webm|ogg)(\?|$)/i) ? (
                          <video controls preload="metadata" className="mt-2 w-full rounded-xl border border-white/10">
                            <source src={c.media_url} />
                          </video>
                        ) : (
                          <img src={c.media_url} loading="lazy" className="mt-2 rounded-xl border border-white/10 max-h-80 object-contain" alt="comment media" />
                        )
                      )}
                      <div className="mt-2 flex items-center gap-2 text-xs">
                        <button
                          onClick={() => voteComment(c.id, 1)}
                          className={`px-2 py-1 rounded-lg border ${myCommentVotes[c.id] === 1 ? 'bg-emerald-300 text-black border-emerald-300' : 'border-white/20 hover:bg-white/10'}`}
                        >
                          +
                        </button>
                        <div className="min-w-[2ch] text-center text-white/80">{commentScores[c.id] || 0}</div>
                        <button
                          onClick={() => voteComment(c.id, -1)}
                          className={`px-2 py-1 rounded-lg border ${myCommentVotes[c.id] === -1 ? 'bg-rose-300 text-black border-rose-300' : 'border-white/20 hover:bg-white/10'}`}
                        >
                          -
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="flex gap-2 items-center">
                    <input
                      value={commentInput[p.id] || ''}
                      onChange={(e) => setCommentInput((prev) => ({ ...prev, [p.id]: e.target.value }))}
                      placeholder="Write a comment…"
                      className="input bg-transparent border border-white/10 py-2 focus:ring-0"
                    />
                    <input
                      id={`cfile-${p.id}`}
                      type="file"
                      accept="image/*,video/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0] || null;
                        setCommentFile((prev) => ({ ...prev, [p.id]: f }));
                      }}
                    />
                    <label htmlFor={`cfile-${p.id}`} className="px-3 py-2 rounded-xl border border-white/20 text-white/80 hover:bg-white/10 text-sm cursor-pointer">
                      📎
                    </label>
                    {commentFile[p.id] && (
                      <span className="text-xs text-white/60 truncate max-w-[120px]">{commentFile[p.id]?.name}</span>
                    )}
                    <button onClick={() => addComment(p.id)} className="btn btn-primary">Send</button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

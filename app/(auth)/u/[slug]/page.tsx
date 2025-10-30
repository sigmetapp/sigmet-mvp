'use client';

import { useEffect, useMemo, useState } from 'react';
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
        .select('id, user_id, body, image_url, video_url, created_at')
        .eq('user_id', profile.user_id)
        .order('created_at', { ascending: false })
        .limit(50);
      setPosts((data as Post[]) || []);
      setLoadingPosts(false);
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
      } catch {
        setFollowersCount(0);
        setFollowingCount(0);
        setReferralsCount(0);
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
      <div className="card p-4 md:p-6">
        {loadingProfile ? (
          <div className="text-white/70">Loading profile…</div>
        ) : !profile ? (
          <div className="text-white/70">Profile not found</div>
        ) : (
          <div className="flex items-start gap-4">
            <img
              src={profile.avatar_url || AVATAR_FALLBACK}
              alt="avatar"
              className="h-16 w-16 rounded-full object-cover border border-white/10"
            />
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
                <div className="flex items-center justify-between text-white/80 text-sm mb-1">
                  <div>Social Weight</div>
                  <div>75/100</div>
                </div>
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full w-[75%] bg-white/70"></div>
                </div>
              </div>

              {/* Selected directions: icons */}
              {!!profile.directions_selected?.length && (
                <div className="mt-4 flex items-center gap-3">
                  {profile.directions_selected.slice(0, 3).map((id) => {
                    const meta = GROWTH_AREAS.find((a) => a.id === id);
                    return (
                      <span key={id} className="text-2xl" aria-label={meta?.title || id} title={meta?.title || id}>
                        {meta?.emoji || '⭐'}
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
        <div className="card p-4 md:p-6">
          <div className="grid md:grid-cols-2 gap-4 text-white/90">
            <div className="space-y-2">
              <div className="text-white/60 text-sm">Bio</div>
              <div>{profile.bio || '—'}</div>
            </div>
            <div className="space-y-2">
              <div className="text-white/60 text-sm">City / Country</div>
              <div>{profile.country || '—'}</div>
            </div>
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
        <div className="card p-4 md:p-6">
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
          posts.map((p) => (
            <div key={p.id} className="card p-4 md:p-5 space-y-3">
              <div className="text-xs text-white/60">
                {new Date(p.created_at).toLocaleString()}
              </div>
              {p.body && <div className="text-white/90 whitespace-pre-wrap">{p.body}</div>}
              {p.image_url && (
                <img src={p.image_url} alt="" className="rounded-2xl border border-white/10" />
              )}
              {p.video_url && (
                <video controls className="w-full rounded-2xl border border-white/10">
                  <source src={p.video_url} />
                </video>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

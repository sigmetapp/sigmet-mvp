"use client";

import { useEffect, useMemo, useState, useCallback, memo } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import Button from "@/components/Button";
import { RequireAuth } from "@/components/RequireAuth";
import AvatarWithBadge from "@/components/AvatarWithBadge";
import Skeleton from "@/components/Skeleton";
import { resolveAvatarUrl } from "@/lib/utils";

type SimpleProfile = {
  user_id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
};

type Connection = {
  userId: string;
  connectionsCount: number;
};

type ConnectionsData = {
  connections: Connection[];
  profiles: Record<string, SimpleProfile>;
  swScores: Record<string, number>;
  trustFlowScores: Record<string, number>;
  myFollowing: string[];
  myFollowers: string[];
  followersProfiles: Record<string, SimpleProfile>;
  followingProfiles: Record<string, SimpleProfile>;
  followersSWScores: Record<string, number>;
  followersTrustFlowScores: Record<string, number>;
  followingSWScores: Record<string, number>;
  followingTrustFlowScores: Record<string, number>;
  recommendedPeople: Array<{
    userId: string;
    reason: 'connection' | 'mutual_follow';
  }>;
  recommendedProfiles: Record<string, SimpleProfile>;
  recommendedSWScores: Record<string, number>;
};

// Memoized connection item component
const ConnectionItem = memo(function ConnectionItem({
  connection,
  profile,
  swScore,
  trustFlow,
  AVATAR_FALLBACK,
}: {
  connection: Connection;
  profile?: SimpleProfile;
  swScore: number;
  trustFlow: number;
  AVATAR_FALLBACK: string;
}) {
  const displayName = profile?.full_name || profile?.username || connection.userId.slice(0, 8);
  const username = profile?.username || connection.userId.slice(0, 8);
  const avatar = resolveAvatarUrl(profile?.avatar_url) ?? AVATAR_FALLBACK;
  const profileUrl = username ? `/u/${username}` : `/u/${connection.userId}`;
  const dmUrl = `/dms?partnerId=${encodeURIComponent(connection.userId)}`;

  return (
    <div className="flex items-center gap-2 p-2 rounded-lg border border-white/10 hover:bg-white/5 transition-colors">
      <AvatarWithBadge
        avatarUrl={avatar}
        swScore={swScore}
        size="sm"
        alt={displayName}
        href={profileUrl}
      />
      <div className="min-w-0 flex-1">
        <Link href={profileUrl} className="block hover:underline">
          <div className="text-white font-medium truncate text-sm">{displayName}</div>
          <div className="text-white/60 text-xs truncate">@{username}</div>
        </Link>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="text-right space-y-0.5">
          <div className="text-white/80 text-xs font-medium">
            {connection.connectionsCount} {connection.connectionsCount === 1 ? 'connection' : 'connections'}
          </div>
          <div className="flex items-center gap-2 text-xs">
            {swScore > 0 && (
              <div className="text-white/60">
                SW: {swScore}
              </div>
            )}
            <div className="text-white/60">
              TF: {trustFlow}
            </div>
          </div>
        </div>
        <Link href={dmUrl}>
          <Button variant="primary" size="sm">
            Write
          </Button>
        </Link>
      </div>
    </div>
  );
});

// Memoized follower/following item component
const FollowItem = memo(function FollowItem({
  userId,
  profile,
  isFollowing,
  isUpdating,
  swScore,
  trustFlow,
  onToggleFollow,
  AVATAR_FALLBACK,
  meId,
}: {
  userId: string;
  profile?: SimpleProfile;
  isFollowing: boolean;
  isUpdating: boolean;
  swScore: number;
  trustFlow: number;
  onToggleFollow: (userId: string, isFollowing: boolean) => void;
  AVATAR_FALLBACK: string;
  meId: string;
}) {
  const displayName = profile?.full_name || profile?.username || userId.slice(0, 8);
  const username = profile?.username || userId.slice(0, 8);
  const avatar = resolveAvatarUrl(profile?.avatar_url) ?? AVATAR_FALLBACK;
  const profileUrl = username ? `/u/${username}` : `/u/${userId}`;

  return (
    <div className="flex items-center gap-2 p-2 rounded-lg hover:bg-white/5 transition-colors">
      <AvatarWithBadge
        avatarUrl={avatar}
        swScore={swScore}
        size="sm"
        alt={displayName}
        href={profileUrl}
      />
      <Link href={profileUrl} className="min-w-0 flex-1 hover:underline">
        <div className="text-white font-medium truncate text-sm">{displayName}</div>
        <div className="text-white/60 text-xs truncate">@{username}</div>
        <div className="flex items-center gap-2 text-xs mt-0.5">
          {swScore > 0 && (
            <div className="text-white/60">
              SW: {swScore}
            </div>
          )}
          <div className="text-white/60">
            TF: {trustFlow}
          </div>
        </div>
      </Link>
      {meId !== userId && (
        <Button
          variant={isFollowing ? 'secondary' : 'primary'}
          size="sm"
          onClick={(e) => {
            e.preventDefault();
            onToggleFollow(userId, isFollowing);
          }}
          disabled={isUpdating}
        >
          {isFollowing ? 'Unfollow' : 'Follow'}
        </Button>
      )}
    </div>
  );
});

// Memoized recommended item component
const RecommendedItem = memo(function RecommendedItem({
  rec,
  profile,
  swScore,
  AVATAR_FALLBACK,
}: {
  rec: { userId: string; reason: 'connection' | 'mutual_follow' };
  profile?: SimpleProfile;
  swScore: number;
  AVATAR_FALLBACK: string;
}) {
  const displayName = profile?.full_name || profile?.username || rec.userId.slice(0, 8);
  const username = profile?.username || rec.userId.slice(0, 8);
  const avatar = resolveAvatarUrl(profile?.avatar_url) ?? AVATAR_FALLBACK;
  const profileUrl = username ? `/u/${username}` : `/u/${rec.userId}`;
  const dmUrl = `/dms?partnerId=${encodeURIComponent(rec.userId)}`;
  const reasonText = rec.reason === 'connection' 
    ? 'Connected through your connections' 
    : 'Mutual follow';

  return (
    <div className="flex items-center gap-2 p-2 rounded-lg border border-white/10 hover:bg-white/5 transition-colors">
      <AvatarWithBadge
        avatarUrl={avatar}
        swScore={swScore}
        size="sm"
        alt={displayName}
        href={profileUrl}
      />
      <div className="min-w-0 flex-1">
        <Link href={profileUrl} className="block hover:underline">
          <div className="text-white font-medium truncate text-sm">{displayName}</div>
          <div className="text-white/60 text-xs truncate">@{username}</div>
          <div className="text-white/50 text-xs mt-0.5">{reasonText}</div>
        </Link>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Link href={dmUrl}>
          <Button variant="primary" size="sm">
            Write
          </Button>
        </Link>
      </div>
    </div>
  );
});

// Skeleton loader for connection items
const ConnectionSkeleton = memo(function ConnectionSkeleton() {
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg border border-white/10">
      <Skeleton variant="circular" width={40} height={40} />
      <div className="min-w-0 flex-1 space-y-1.5">
        <Skeleton width="60%" height={14} />
        <Skeleton width="40%" height={12} />
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="text-right space-y-1">
          <Skeleton width={80} height={12} />
          <Skeleton width={60} height={10} />
        </div>
        <Skeleton width={60} height={28} />
      </div>
    </div>
  );
});

// Skeleton loader for follow items
const FollowSkeleton = memo(function FollowSkeleton() {
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg">
      <Skeleton variant="circular" width={36} height={36} />
      <div className="min-w-0 flex-1 space-y-1.5">
        <Skeleton width="50%" height={14} />
        <Skeleton width="40%" height={12} />
        <Skeleton width="30%" height={10} />
      </div>
      <Skeleton width={80} height={28} />
    </div>
  );
});

export default function ConnectionsPage() {
  return (
    <RequireAuth>
      <ConnectionsInner />
    </RequireAuth>
  );
}

function ConnectionsInner() {
  const AVATAR_FALLBACK =
    "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='100%' height='100%' fill='%23222'/><circle cx='32' cy='24' r='14' fill='%23555'/><rect x='12' y='44' width='40' height='12' rx='6' fill='%23555'/></svg>";
  
  const [meId, setMeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ConnectionsData | null>(null);
  const [updatingFollows, setUpdatingFollows] = useState<Record<string, boolean>>({});

  const title = useMemo(() => "Connections", []);

  // Load user ID
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;
      setMeId(uid);
    })();
  }, []);

  // Load connections data from API
  useEffect(() => {
    if (!meId) return;

    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          if (!cancelled) setLoading(false);
          return;
        }

        const response = await fetch('/api/connections/list', {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          let errorMessage = 'Failed to load connections';
          try {
            const errorJson = JSON.parse(errorText);
            errorMessage = errorJson.error || errorMessage;
          } catch {
            // Use default error message
          }
          throw new Error(errorMessage);
        }

        const result: ConnectionsData = await response.json();
        if (!cancelled) {
          setData(result);
        }
      } catch (error) {
        console.error('Error loading connections:', error);
        if (!cancelled) {
          setData(null);
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
  }, [meId]);

  const toggleFollow = useCallback(async (userId: string, isFollowing: boolean) => {
    if (!meId || !userId || meId === userId) return;
    
    setUpdatingFollows(prev => ({ ...prev, [userId]: true }));
    try {
      if (!isFollowing) {
        const { error } = await supabase.from('follows').insert({ follower_id: meId, followee_id: userId });
        if (!error && data) {
          setData({
            ...data,
            myFollowing: [...data.myFollowing, userId],
          });
        }
      } else {
        const { error } = await supabase
          .from('follows')
          .delete()
          .eq('follower_id', meId)
          .eq('followee_id', userId);
        if (!error && data) {
          setData({
            ...data,
            myFollowing: data.myFollowing.filter(id => id !== userId),
          });
        }
      }
    } finally {
      setUpdatingFollows(prev => ({ ...prev, [userId]: false }));
    }
  }, [meId, data]);

  // Memoized sets for quick lookups
  const myFollowingSet = useMemo(() => {
    return new Set(data?.myFollowing || []);
  }, [data?.myFollowing]);

  const myFollowersSet = useMemo(() => {
    return new Set(data?.myFollowers || []);
  }, [data?.myFollowers]);

  return (
    <div className="max-w-7xl mx-auto px-0 md:px-4 py-4 md:p-4 space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white mb-1">{title}</h1>
          <p className="text-white/70 text-sm">People you've tagged and who tagged you in posts. Each tag counts as 1 connection.</p>
        </div>
      </div>

      {/* Connections Block */}
      <div className="card p-3 md:p-4 space-y-2">
        <div className="text-white/80 font-medium text-lg">Connections</div>
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <ConnectionSkeleton key={i} />
            ))}
          </div>
        ) : !data || data.connections.length === 0 ? (
          <div className="text-white/60 text-sm">No connections yet. Tag people in posts to create connections.</div>
        ) : (
          <div className="space-y-2">
            {data.connections.map((c) => (
              <ConnectionItem
                key={c.userId}
                connection={c}
                profile={data.profiles[c.userId]}
                swScore={data.swScores[c.userId] || 0}
                trustFlow={data.trustFlowScores[c.userId] ?? 80}
                AVATAR_FALLBACK={AVATAR_FALLBACK}
              />
            ))}
          </div>
        )}
      </div>

      {/* Followers/Following Blocks */}
      {meId && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="card p-3 md:p-4 space-y-2">
            <div className="text-white/80 font-medium text-lg">Followers</div>
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <FollowSkeleton key={i} />
                ))}
              </div>
            ) : !data || myFollowersSet.size === 0 ? (
              <div className="text-white/60 text-sm">No followers yet.</div>
            ) : (
              <div className="space-y-2">
                {Array.from(myFollowersSet).map((uid) => (
                  <FollowItem
                    key={uid}
                    userId={uid}
                    profile={data?.followersProfiles[uid]}
                    isFollowing={myFollowingSet.has(uid)}
                    isUpdating={updatingFollows[uid] || false}
                    swScore={data?.followersSWScores[uid] || 0}
                    trustFlow={data?.followersTrustFlowScores[uid] ?? 80}
                    onToggleFollow={toggleFollow}
                    AVATAR_FALLBACK={AVATAR_FALLBACK}
                    meId={meId}
                  />
                ))}
              </div>
            )}
          </div>
          <div className="card p-3 md:p-4 space-y-2">
            <div className="text-white/80 font-medium text-lg">Following</div>
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <FollowSkeleton key={i} />
                ))}
              </div>
            ) : !data || myFollowingSet.size === 0 ? (
              <div className="text-white/60 text-sm">You are not following anyone yet.</div>
            ) : (
              <div className="space-y-2">
                {Array.from(myFollowingSet).map((uid) => (
                  <FollowItem
                    key={uid}
                    userId={uid}
                    profile={data?.followingProfiles[uid]}
                    isFollowing={true}
                    isUpdating={updatingFollows[uid] || false}
                    swScore={data?.followingSWScores[uid] || 0}
                    trustFlow={data?.followingTrustFlowScores[uid] ?? 80}
                    onToggleFollow={toggleFollow}
                    AVATAR_FALLBACK={AVATAR_FALLBACK}
                    meId={meId}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recommended People Block */}
      {meId && (
        <div className="card p-3 md:p-4 space-y-2">
          <div>
            <div className="text-white/80 font-medium text-lg">Recommended People</div>
            <div className="text-white/50 text-xs mt-1">
              People connected through your connections or mutual follows
            </div>
          </div>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <ConnectionSkeleton key={i} />
              ))}
            </div>
          ) : !data || data.recommendedPeople.length === 0 ? (
            <div className="text-white/60 text-sm">No recommendations available yet.</div>
          ) : (
            <div className="space-y-2">
              {data.recommendedPeople.map((rec) => (
                <RecommendedItem
                  key={rec.userId}
                  rec={rec}
                  profile={data.recommendedProfiles[rec.userId]}
                  swScore={data.recommendedSWScores[rec.userId] || 0}
                  AVATAR_FALLBACK={AVATAR_FALLBACK}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

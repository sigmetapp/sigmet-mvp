"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import Button from "@/components/Button";
import { RequireAuth } from "@/components/RequireAuth";

type SimpleProfile = {
  user_id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
};

type PostRow = {
  id: number;
  user_id: string | null;
  body: string | null;
  created_at: string;
};

type Connection = {
  userId: string;
  connectionsCount: number; // number of mutual mentions (connections) - posts where both users tagged each other
};

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
  const [meUsername, setMeUsername] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [profiles, setProfiles] = useState<Record<string, SimpleProfile>>({});

  const [myFollowing, setMyFollowing] = useState<Set<string>>(new Set());
  const [myFollowers, setMyFollowers] = useState<Set<string>>(new Set());
  const [swScores, setSwScores] = useState<Record<string, number>>({});
  const [trustFlowScores, setTrustFlowScores] = useState<Record<string, number>>({});
  const [followersProfiles, setFollowersProfiles] = useState<Record<string, SimpleProfile>>({});
  const [followingProfiles, setFollowingProfiles] = useState<Record<string, SimpleProfile>>({});
  const [followersSWScores, setFollowersSWScores] = useState<Record<string, number>>({});
  const [followersTrustFlowScores, setFollowersTrustFlowScores] = useState<Record<string, number>>({});
  const [followingSWScores, setFollowingSWScores] = useState<Record<string, number>>({});
  const [followingTrustFlowScores, setFollowingTrustFlowScores] = useState<Record<string, number>>({});
  const [updatingFollows, setUpdatingFollows] = useState<Record<string, boolean>>({});
  
  // Recommended people
  const [recommendedPeople, setRecommendedPeople] = useState<Array<{
    userId: string;
    reason: 'connection' | 'mutual_follow';
  }>>([]);
  const [recommendedProfiles, setRecommendedProfiles] = useState<Record<string, SimpleProfile>>({});

  const title = useMemo(() => "Connections", []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;
      setMeId(uid);
      if (!uid) return;
      // Load my username
      const { data: prof } = await supabase
        .from("profiles")
        .select("user_id, username")
        .eq("user_id", uid)
        .maybeSingle();
      setMeUsername((prof as any)?.username ?? null);
    })();
  }, []);

  useEffect(() => {
    if (!meId || !meUsername) return;
    (async () => {
      setLoading(true);
      try {
        // Load all posts to check for mutual mentions
        const { data: allPosts } = await supabase
          .from("posts")
          .select("id, user_id, body, created_at")
          .order("created_at", { ascending: false })
          .limit(1000);

        if (!allPosts || allPosts.length === 0) {
          setConnections([]);
          setProfiles({});
          setLoading(false);
          return;
        }

        // Build my mention patterns
        const myMentionPatterns: string[] = [];
        if (meUsername && meUsername.trim() !== "") {
          myMentionPatterns.push(`@${meUsername.toLowerCase()}`);
          myMentionPatterns.push(`/u/${meUsername.toLowerCase()}`);
        }
        if (meId) {
          myMentionPatterns.push(`/u/${meId}`);
        }

        // Map: userId -> set of post IDs where they mentioned me
        const theyMentionedMe: Record<string, Set<number>> = {};
        
        // Map: userId -> set of post IDs where I mentioned them
        const iMentionedThem: Record<string, Set<number>> = {};

        // Helper function to check if text contains a mention (whole word match)
        const hasMention = (text: string, patterns: string[]): boolean => {
          const lowerText = text.toLowerCase();
          for (const pattern of patterns) {
            // Check for @username pattern (must be followed by space, newline, or end of string)
            if (pattern.startsWith('@')) {
              const regex = new RegExp(`@${pattern.substring(1)}(\\s|$|\\n)`, 'i');
              if (regex.test(lowerText)) return true;
            }
            // Check for /u/username or /u/userid pattern
            if (pattern.startsWith('/u/')) {
              const regex = new RegExp(`/u/${pattern.substring(3)}(\\s|$|\\n)`, 'i');
              if (regex.test(lowerText)) return true;
            }
          }
          return false;
        };

        // First pass: find posts where others mentioned me
        for (const post of allPosts) {
          const authorId = post.user_id;
          if (!authorId || authorId === meId) continue;

          const body = post.body || "";
          
          if (hasMention(body, myMentionPatterns)) {
            if (!theyMentionedMe[authorId]) {
              theyMentionedMe[authorId] = new Set();
            }
            theyMentionedMe[authorId].add(post.id);
          }
        }

        // Second pass: find posts where I mentioned others
        // Load all usernames for comparison
        const allUserIds = new Set<string>();
        Object.keys(theyMentionedMe).forEach((uid) => allUserIds.add(uid));

        if (allUserIds.size > 0) {
          const { data: userProfiles } = await supabase
            .from("profiles")
            .select("user_id, username")
            .in("user_id", Array.from(allUserIds));

          const usernameToUserId: Record<string, string> = {};
          if (userProfiles) {
            for (const profile of userProfiles as any[]) {
              const uid = profile.user_id as string;
              const username = (profile.username || "").toLowerCase();
              if (username) {
                usernameToUserId[`@${username}`] = uid;
                usernameToUserId[`/u/${username}`] = uid;
              }
            }
          }

          // Find my posts that mention others
          for (const post of allPosts) {
            if (post.user_id !== meId) continue;

            const body = post.body || "";
            
            // Check for mentions of other users (whole word match)
            for (const [pattern, uid] of Object.entries(usernameToUserId)) {
              const lowerPattern = pattern.toLowerCase();
              let found = false;
              
              // Check for @username pattern
              if (lowerPattern.startsWith('@')) {
                const username = lowerPattern.substring(1);
                const regex = new RegExp(`@${username}(\\s|$|\\n)`, 'i');
                if (regex.test(body)) found = true;
              }
              // Check for /u/username pattern
              if (lowerPattern.startsWith('/u/')) {
                const username = lowerPattern.substring(3);
                const regex = new RegExp(`/u/${username}(\\s|$|\\n)`, 'i');
                if (regex.test(body)) found = true;
              }
              
              if (found) {
                if (!iMentionedThem[uid]) {
                  iMentionedThem[uid] = new Set();
                }
                iMentionedThem[uid].add(post.id);
              }
            }
          }
        }

        // Calculate connections: mutual mentions
        // A connection is when: user A tagged me in their post AND I tagged user A in my post
        // Count connections as pairs: each post where they mention me + each post where I mention them = 1 connection per pair
        const connections: Connection[] = [];
        
        for (const userId of Object.keys(theyMentionedMe)) {
          const theirPosts = theyMentionedMe[userId];
          const myPosts = iMentionedThem[userId] || new Set();

          // Count connections: each post where they mentioned me AND each post where I mentioned them
          // This represents mutual tagging - if they tagged me in N posts and I tagged them in M posts,
          // we have min(N, M) connections (each pair represents a mutual connection)
          // But actually, we want to count all mutual pairs, so:
          // If they tagged me 3 times and I tagged them 2 times, that's 2 connections (the minimum)
          // This represents the number of mutual mentions
          let mutualCount = 0;

          if (theirPosts.size > 0 && myPosts.size > 0) {
            // Count as the minimum of both - represents actual mutual connections
            // Each connection requires both: they tagged me AND I tagged them
            mutualCount = Math.min(theirPosts.size, myPosts.size);
          }

          if (mutualCount > 0) {
            connections.push({
              userId,
              connectionsCount: mutualCount,
            });
          }
        }

        // Sort by connections count (descending)
        connections.sort((a, b) => b.connectionsCount - a.connectionsCount);
        setConnections(connections);

        // Load profiles for these users
        const ids = connections.map((c) => c.userId);
        if (ids.length > 0) {
          const { data: profs } = await supabase
            .from("profiles")
            .select("user_id, username, full_name, avatar_url")
            .in("user_id", ids);
          const map: Record<string, SimpleProfile> = {};
          for (const p of (profs as any[]) || []) {
            map[p.user_id as string] = {
              user_id: p.user_id as string,
              username: (p.username as string | null) ?? null,
              full_name: (p.full_name as string | null) ?? null,
              avatar_url: (p.avatar_url as string | null) ?? null,
            };
          }
          setProfiles(map);

          // Load SW scores for connections
          try {
            const { data: swData } = await supabase
              .from("sw_scores")
              .select("user_id, total")
              .in("user_id", ids);
            const swMap: Record<string, number> = {};
            if (swData) {
              for (const row of swData as any[]) {
                swMap[row.user_id as string] = (row.total as number) || 0;
              }
            }
            setSwScores(swMap);
          } catch {
            // SW scores table may not exist
            setSwScores({});
          }

          // Load Trust Flow scores for connections
          try {
            const { data: trustData } = await supabase
              .from("trust_feedback")
              .select("target_user_id, value")
              .in("target_user_id", ids);
            const trustMap: Record<string, number> = {};
            if (trustData) {
              const trustSums: Record<string, number> = {};
              for (const row of trustData as any[]) {
                const userId = row.target_user_id as string;
                trustSums[userId] = (trustSums[userId] || 0) + (Number(row.value) || 0);
              }
              for (const userId of ids) {
                const sum = trustSums[userId] || 0;
                trustMap[userId] = Math.max(0, Math.min(120, 80 + sum * 2));
              }
            } else {
              // Set default 80 for all if no data
              for (const userId of ids) {
                trustMap[userId] = 80;
              }
            }
            setTrustFlowScores(trustMap);
          } catch {
            // Trust Flow table may not exist, set defaults
            const defaultTrust: Record<string, number> = {};
            for (const userId of ids) {
              defaultTrust[userId] = 80;
            }
            setTrustFlowScores(defaultTrust);
          }
        } else {
          setProfiles({});
          setSwScores({});
          setTrustFlowScores({});
        }

        // Load follows (followers and following for me)
        try {
          const [{ data: followingRows }, { data: followerRows }] = await Promise.all([
            supabase.from("follows").select("followee_id").eq("follower_id", meId),
            supabase.from("follows").select("follower_id").eq("followee_id", meId),
          ]);
          const followingSet = new Set(((followingRows as any[]) || []).map((r) => r.followee_id as string));
          const followersSet = new Set(((followerRows as any[]) || []).map((r) => r.follower_id as string));
          
          setMyFollowing(followingSet);
          setMyFollowers(followersSet);

          // Load profiles for followers and following
          const allFollowUserIds = Array.from(new Set([...followingSet, ...followersSet]));
          if (allFollowUserIds.length > 0) {
            const { data: followProfs } = await supabase
              .from("profiles")
              .select("user_id, username, full_name, avatar_url")
              .in("user_id", allFollowUserIds);

            const followersMap: Record<string, SimpleProfile> = {};
            const followingMap: Record<string, SimpleProfile> = {};

            if (followProfs) {
              for (const p of followProfs as any[]) {
                const profile: SimpleProfile = {
                  user_id: p.user_id as string,
                  username: (p.username as string | null) ?? null,
                  full_name: (p.full_name as string | null) ?? null,
                  avatar_url: (p.avatar_url as string | null) ?? null,
                };
                if (followersSet.has(p.user_id as string)) {
                  followersMap[p.user_id as string] = profile;
                }
                if (followingSet.has(p.user_id as string)) {
                  followingMap[p.user_id as string] = profile;
                }
              }
            }

            setFollowersProfiles(followersMap);
            setFollowingProfiles(followingMap);

            // Load SW scores for followers and following
            try {
              const { data: swData } = await supabase
                .from("sw_scores")
                .select("user_id, total")
                .in("user_id", allFollowUserIds);
              const swMap: Record<string, number> = {};
              if (swData) {
                for (const row of swData as any[]) {
                  swMap[row.user_id as string] = (row.total as number) || 0;
                }
              }
              // Separate for followers and following
              const followersSW: Record<string, number> = {};
              const followingSW: Record<string, number> = {};
              for (const userId of allFollowUserIds) {
                const score = swMap[userId] || 0;
                if (followersSet.has(userId)) {
                  followersSW[userId] = score;
                }
                if (followingSet.has(userId)) {
                  followingSW[userId] = score;
                }
              }
              setFollowersSWScores(followersSW);
              setFollowingSWScores(followingSW);
            } catch {
              setFollowersSWScores({});
              setFollowingSWScores({});
            }

            // Load Trust Flow scores for followers and following
            try {
              const { data: trustData } = await supabase
                .from("trust_feedback")
                .select("target_user_id, value")
                .in("target_user_id", allFollowUserIds);
              const trustMap: Record<string, number> = {};
              if (trustData) {
                const trustSums: Record<string, number> = {};
                for (const row of trustData as any[]) {
                  const userId = row.target_user_id as string;
                  trustSums[userId] = (trustSums[userId] || 0) + (Number(row.value) || 0);
                }
                for (const userId of allFollowUserIds) {
                  const sum = trustSums[userId] || 0;
                  trustMap[userId] = Math.max(0, Math.min(120, 80 + sum * 2));
                }
              } else {
                // Set default 80 for all if no data
                for (const userId of allFollowUserIds) {
                  trustMap[userId] = 80;
                }
              }
              // Separate for followers and following
              const followersTrust: Record<string, number> = {};
              const followingTrust: Record<string, number> = {};
              for (const userId of allFollowUserIds) {
                const score = trustMap[userId] ?? 80;
                if (followersSet.has(userId)) {
                  followersTrust[userId] = score;
                }
                if (followingSet.has(userId)) {
                  followingTrust[userId] = score;
                }
              }
              setFollowersTrustFlowScores(followersTrust);
              setFollowingTrustFlowScores(followingTrust);
            } catch {
              // Trust Flow table may not exist, set defaults
              const defaultFollowersTrust: Record<string, number> = {};
              const defaultFollowingTrust: Record<string, number> = {};
              for (const userId of allFollowUserIds) {
                if (followersSet.has(userId)) {
                  defaultFollowersTrust[userId] = 80;
                }
                if (followingSet.has(userId)) {
                  defaultFollowingTrust[userId] = 80;
                }
              }
              setFollowersTrustFlowScores(defaultFollowersTrust);
              setFollowingTrustFlowScores(defaultFollowingTrust);
            }
          }
        } catch {
          // follows table may not exist in some envs
          setMyFollowing(new Set());
          setMyFollowers(new Set());
          setFollowersProfiles({});
          setFollowingProfiles({});
          setFollowersSWScores({});
          setFollowersTrustFlowScores({});
          setFollowingSWScores({});
          setFollowingTrustFlowScores({});
        }

        // Calculate recommended people
        const recommended: Array<{ userId: string; reason: 'connection' | 'mutual_follow' }> = [];
        const recommendedSet = new Set<string>();

        // 1. Find 2nd degree connections (people connected through your connections)
        const connectionUserIds = connections.map(c => c.userId);
        if (connectionUserIds.length > 0 && allPosts.length > 0) {
          const connectionUserIdsSet = new Set(connectionUserIds);
          
          // Load all profiles at once to avoid database calls in loop
          const { data: allProfilesData } = await supabase
            .from("profiles")
            .select("user_id, username");
          
          const allProfilesMap: Record<string, string> = {};
          if (allProfilesData) {
            for (const p of allProfilesData as any[]) {
              const username = (p.username || "").toLowerCase();
              if (username) {
                allProfilesMap[p.user_id as string] = username;
              }
            }
          }
          
          // For each connection, find their connections
          for (const connectionUserId of connectionUserIds) {
            const connectionProfile = profiles[connectionUserId];
            if (!connectionProfile?.username) continue;
            
            const theirUsername = connectionProfile.username.toLowerCase();
            const theirMentionPatterns: string[] = [];
            theirMentionPatterns.push(`@${theirUsername}`);
            theirMentionPatterns.push(`/u/${theirUsername}`);
            theirMentionPatterns.push(`/u/${connectionUserId}`);

            // Find posts where others mentioned this connection
            const theyMentionedConnection: Record<string, Set<number>> = {};
            const connectionMentionedThem: Record<string, Set<number>> = {};

            for (const post of allPosts) {
              const authorId = post.user_id;
              if (!authorId || authorId === meId || authorId === connectionUserId) continue;

              const body = post.body || "";
              if (hasMention(body, theirMentionPatterns)) {
                if (!theyMentionedConnection[authorId]) {
                  theyMentionedConnection[authorId] = new Set();
                }
                theyMentionedConnection[authorId].add(post.id);
              }
            }

            // Find posts where this connection mentioned others
            for (const post of allPosts) {
              if (post.user_id !== connectionUserId) continue;
              const body = post.body || "";
              
              // Check for mentions of other users using the pre-loaded profiles map
              for (const userId of Object.keys(theyMentionedConnection)) {
                const otherUsername = allProfilesMap[userId];
                if (otherUsername) {
                  const patterns = [`@${otherUsername}`, `/u/${otherUsername}`, `/u/${userId}`];
                  if (hasMention(body, patterns)) {
                    if (!connectionMentionedThem[userId]) {
                      connectionMentionedThem[userId] = new Set();
                    }
                    connectionMentionedThem[userId].add(post.id);
                  }
                }
              }
            }

            // Find mutual connections for this connection
            for (const userId of Object.keys(theyMentionedConnection)) {
              if (userId === meId || connectionUserIdsSet.has(userId) || recommendedSet.has(userId)) continue;
              
              const theirPosts = theyMentionedConnection[userId];
              const connectionPosts = connectionMentionedThem[userId] || new Set();
              
              if (theirPosts.size > 0 && connectionPosts.size > 0) {
                recommended.push({ userId, reason: 'connection' });
                recommendedSet.add(userId);
              }
            }
          }
        }

        // 2. Find mutual follows (people who follow you AND you follow them)
        const mutualFollows = Array.from(myFollowers).filter(uid => myFollowing.has(uid));
        for (const uid of mutualFollows) {
          if (!recommendedSet.has(uid) && !connectionUserIds.includes(uid)) {
            recommended.push({ userId: uid, reason: 'mutual_follow' });
            recommendedSet.add(uid);
          }
        }

        setRecommendedPeople(recommended);

        // Load profiles for recommended people
        if (recommended.length > 0) {
          const recommendedIds = recommended.map(r => r.userId);
          const { data: recProfs } = await supabase
            .from("profiles")
            .select("user_id, username, full_name, avatar_url")
            .in("user_id", recommendedIds);
          
          const recMap: Record<string, SimpleProfile> = {};
          if (recProfs) {
            for (const p of recProfs as any[]) {
              recMap[p.user_id as string] = {
                user_id: p.user_id as string,
                username: (p.username as string | null) ?? null,
                full_name: (p.full_name as string | null) ?? null,
                avatar_url: (p.avatar_url as string | null) ?? null,
              };
            }
          }
          setRecommendedProfiles(recMap);
        } else {
          setRecommendedProfiles({});
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [meId, meUsername]);

  const toggleFollow = async (userId: string, isFollowing: boolean) => {
    if (!meId || !userId || meId === userId) return;
    
    setUpdatingFollows(prev => ({ ...prev, [userId]: true }));
    try {
      if (!isFollowing) {
        const { error } = await supabase.from('follows').insert({ follower_id: meId, followee_id: userId });
        if (!error) {
          setMyFollowing(prev => new Set([...prev, userId]));
        }
      } else {
        const { error } = await supabase
          .from('follows')
          .delete()
          .eq('follower_id', meId)
          .eq('followee_id', userId);
        if (!error) {
          setMyFollowing(prev => {
            const newSet = new Set(prev);
            newSet.delete(userId);
            return newSet;
          });
        }
      }
    } finally {
      setUpdatingFollows(prev => ({ ...prev, [userId]: false }));
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 md:p-6 space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white mb-1">{title}</h1>
          <p className="text-white/70 text-sm">People you've tagged and who tagged you in posts. Connections are based on mutual mentions.</p>
        </div>
      </div>

      {/* Connections Block */}
      <div className="card p-4 md:p-6 space-y-4">
        <div className="text-white/80 font-medium text-lg">Connections</div>
        {loading ? (
          <div className="text-white/70 text-sm">Loading…</div>
        ) : connections.length === 0 ? (
          <div className="text-white/60 text-sm">No connections yet. Tag each other in posts to create connections.</div>
        ) : (
          <div className="space-y-3">
            {connections.map((c) => {
              const p = profiles[c.userId];
              const displayName = p?.full_name || p?.username || c.userId.slice(0, 8);
              const username = p?.username || c.userId.slice(0, 8);
              const avatar = p?.avatar_url || AVATAR_FALLBACK;
              const connectionsCount = c.connectionsCount;
              const swScore = swScores[c.userId] || 0;
              const trustFlow = trustFlowScores[c.userId] ?? 80;
              const profileUrl = username ? `/u/${username}` : `/u/${c.userId}`;
              const dmUrl = `/dms?partnerId=${encodeURIComponent(c.userId)}`;

              return (
                <div key={c.userId} className="flex items-center gap-3 p-3 rounded-lg border border-white/10 hover:bg-white/5 transition-colors">
                  <Link href={profileUrl} className="flex-shrink-0">
                    <img
                      src={avatar}
                      alt={displayName}
                      className="h-12 w-12 rounded-full object-cover border border-white/10 hover:border-telegram-blue/50 transition-colors"
                    />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link href={profileUrl} className="block hover:underline">
                      <div className="text-white font-medium truncate">{displayName}</div>
                      <div className="text-white/60 text-sm truncate">@{username}</div>
                    </Link>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-right space-y-1">
                      <div className="text-white/80 text-sm font-medium">
                        {connectionsCount} {connectionsCount === 1 ? 'connection' : 'connections'}
                      </div>
                      <div className="flex items-center gap-3 text-xs">
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
            })}
          </div>
        )}
      </div>

      {/* Followers/Following Blocks */}
      {meId && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="card p-4 md:p-6 space-y-4">
            <div className="text-white/80 font-medium text-lg">Followers</div>
            {myFollowers.size === 0 ? (
              <div className="text-white/60 text-sm">No followers yet.</div>
            ) : (
              <div className="space-y-3">
                {Array.from(myFollowers).map((uid) => {
                  const p = followersProfiles[uid];
                  const displayName = p?.full_name || p?.username || uid.slice(0, 8);
                  const username = p?.username || uid.slice(0, 8);
                  const avatar = p?.avatar_url || AVATAR_FALLBACK;
                  const profileUrl = username ? `/u/${username}` : `/u/${uid}`;
                  const isFollowing = myFollowing.has(uid);
                  const isUpdating = updatingFollows[uid] || false;
                  const swScore = followersSWScores[uid] || 0;
                  const trustFlow = followersTrustFlowScores[uid] ?? 80;

                  return (
                    <div key={uid} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors">
                      <Link href={profileUrl} className="flex-shrink-0">
                        <img
                          src={avatar}
                          alt={displayName}
                          className="h-10 w-10 rounded-full object-cover border border-white/10 hover:border-telegram-blue/50 transition-colors"
                        />
                      </Link>
                      <Link href={profileUrl} className="min-w-0 flex-1 hover:underline">
                        <div className="text-white font-medium truncate">{displayName}</div>
                        <div className="text-white/60 text-sm truncate">@{username}</div>
                        <div className="flex items-center gap-3 text-xs mt-1">
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
                      {meId !== uid && (
                        <Button
                          variant={isFollowing ? 'secondary' : 'primary'}
                          size="sm"
                          onClick={(e) => {
                            e.preventDefault();
                            toggleFollow(uid, isFollowing);
                          }}
                          disabled={isUpdating}
                        >
                          {isFollowing ? 'Unfollow' : 'Follow'}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="card p-4 md:p-6 space-y-4">
            <div className="text-white/80 font-medium text-lg">Following</div>
            {myFollowing.size === 0 ? (
              <div className="text-white/60 text-sm">You are not following anyone yet.</div>
            ) : (
              <div className="space-y-3">
                {Array.from(myFollowing).map((uid) => {
                  const p = followingProfiles[uid];
                  const displayName = p?.full_name || p?.username || uid.slice(0, 8);
                  const username = p?.username || uid.slice(0, 8);
                  const avatar = p?.avatar_url || AVATAR_FALLBACK;
                  const profileUrl = username ? `/u/${username}` : `/u/${uid}`;
                  const isFollowing = true; // Always true in this list
                  const isUpdating = updatingFollows[uid] || false;
                  const swScore = followingSWScores[uid] || 0;
                  const trustFlow = followingTrustFlowScores[uid] ?? 80;

                  return (
                    <div key={uid} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors">
                      <Link href={profileUrl} className="flex-shrink-0">
                        <img
                          src={avatar}
                          alt={displayName}
                          className="h-10 w-10 rounded-full object-cover border border-white/10 hover:border-telegram-blue/50 transition-colors"
                        />
                      </Link>
                      <Link href={profileUrl} className="min-w-0 flex-1 hover:underline">
                        <div className="text-white font-medium truncate">{displayName}</div>
                        <div className="text-white/60 text-sm truncate">@{username}</div>
                        <div className="flex items-center gap-3 text-xs mt-1">
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
                      {meId !== uid && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={(e) => {
                            e.preventDefault();
                            toggleFollow(uid, isFollowing);
                          }}
                          disabled={isUpdating}
                        >
                          Unfollow
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recommended People Block */}
      {meId && (
        <div className="card p-4 md:p-6 space-y-4">
          <div className="text-white/80 font-medium text-lg">Recommended People</div>
          {loading ? (
            <div className="text-white/70 text-sm">Loading…</div>
          ) : recommendedPeople.length === 0 ? (
            <div className="text-white/60 text-sm">No recommendations available yet.</div>
          ) : (
            <div className="space-y-3">
              {recommendedPeople.map((rec) => {
                const p = recommendedProfiles[rec.userId];
                const displayName = p?.full_name || p?.username || rec.userId.slice(0, 8);
                const username = p?.username || rec.userId.slice(0, 8);
                const avatar = p?.avatar_url || AVATAR_FALLBACK;
                const profileUrl = username ? `/u/${username}` : `/u/${rec.userId}`;
                const dmUrl = `/dms?partnerId=${encodeURIComponent(rec.userId)}`;
                const reasonText = rec.reason === 'connection' 
                  ? 'Connected through your connections' 
                  : 'Mutual follow';

                return (
                  <div key={rec.userId} className="flex items-center gap-3 p-3 rounded-lg border border-white/10 hover:bg-white/5 transition-colors">
                    <Link href={profileUrl} className="flex-shrink-0">
                      <img
                        src={avatar}
                        alt={displayName}
                        className="h-12 w-12 rounded-full object-cover border border-white/10 hover:border-telegram-blue/50 transition-colors"
                      />
                    </Link>
                    <div className="min-w-0 flex-1">
                      <Link href={profileUrl} className="block hover:underline">
                        <div className="text-white font-medium truncate">{displayName}</div>
                        <div className="text-white/60 text-sm truncate">@{username}</div>
                        <div className="text-white/50 text-xs mt-1">{reasonText}</div>
                      </Link>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <Link href={dmUrl}>
                        <Button variant="primary" size="sm">
                          Write
                        </Button>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

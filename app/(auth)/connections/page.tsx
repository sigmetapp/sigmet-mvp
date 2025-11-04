"use client";

import { useEffect, useMemo, useState } from "react";
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
  const [updatingFollow, setUpdatingFollow] = useState<Record<string, boolean>>({});

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
        } else {
          setProfiles({});
        }

        // Load follows (followers and following for me)
        try {
          const [{ data: followingRows }, { data: followerRows }] = await Promise.all([
            supabase.from("follows").select("followee_id").eq("follower_id", meId),
            supabase.from("follows").select("follower_id").eq("followee_id", meId),
          ]);
          setMyFollowing(new Set(((followingRows as any[]) || []).map((r) => r.followee_id as string)));
          setMyFollowers(new Set(((followerRows as any[]) || []).map((r) => r.follower_id as string)));
        } catch {
          // follows table may not exist in some envs
          setMyFollowing(new Set());
          setMyFollowers(new Set());
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [meId, meUsername]);

  async function toggleFollow(targetUserId: string) {
    if (!meId || meId === targetUserId) return;
    const isFollowing = myFollowing.has(targetUserId);
    setUpdatingFollow((prev) => ({ ...prev, [targetUserId]: true }));
    try {
      if (!isFollowing) {
        const { error } = await supabase
          .from("follows")
          .insert({ follower_id: meId, followee_id: targetUserId });
        if (!error) setMyFollowing((prev) => new Set(prev).add(targetUserId));
      } else {
        const { error } = await supabase
          .from("follows")
          .delete()
          .eq("follower_id", meId)
          .eq("followee_id", targetUserId);
        if (!error)
          setMyFollowing((prev) => {
            const next = new Set(prev);
            next.delete(targetUserId);
            return next;
          });
      }
    } catch {
      // ignore
    } finally {
      setUpdatingFollow((prev) => ({ ...prev, [targetUserId]: false }));
    }
  }

  const maxConnections = useMemo(() => {
    return connections.reduce((m, c) => Math.max(m, c.connectionsCount), 0) || 1;
  }, [connections]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 md:p-6 space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white mb-1">{title}</h1>
          <p className="text-white/70 text-sm">People you've tagged and who tagged you in posts. Connections are based on mutual mentions.</p>
        </div>
      </div>

      {loading ? (
        <div className="text-white/70">Loading…</div>
      ) : connections.length === 0 ? (
        <div className="text-white/70">No connections yet.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {connections.map((c) => {
            const p = profiles[c.userId];
            const displayName = p?.full_name || p?.username || c.userId.slice(0, 8);
            const username = p?.username || c.userId.slice(0, 8);
            const avatar = p?.avatar_url || AVATAR_FALLBACK;
            const connectionsCount = c.connectionsCount;
            const percent = Math.max(8, Math.round((connectionsCount / maxConnections) * 100));
            const iFollow = myFollowing.has(c.userId);
            const followsMe = myFollowers.has(c.userId);
            return (
              <div key={c.userId} className="card p-4 space-y-3 border border-white/10">
                <div className="flex items-center gap-3">
                  <img src={avatar} alt="avatar" className="h-10 w-10 rounded-full object-cover border border-white/10" />
                  <div className="min-w-0 flex-1">
                    <div className="text-white truncate font-medium">{displayName}</div>
                    <div className="text-white/60 text-sm truncate">@{username}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-white/80 text-sm font-medium">
                      {connectionsCount} {connectionsCount === 1 ? 'connection' : 'connections'}
                    </div>
                    <Button
                      variant={iFollow ? "secondary" : "primary"}
                      size="sm"
                      onClick={() => toggleFollow(c.userId)}
                      disabled={!!updatingFollow[c.userId]}
                    >
                      {iFollow ? "Following" : "Follow"}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-white/70 text-xs">Connections strength</div>
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-2 bg-[linear-gradient(90deg,#7affc0,#00ffc8)]"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <div className="text-white/70 text-xs flex items-center gap-2">
                    <span>{connectionsCount} mutual {connectionsCount === 1 ? 'mention' : 'mentions'} in posts</span>
                    {followsMe && <span className="px-2 py-0.5 rounded-full border border-white/20">follows you</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Followers/Following quick glance */}
      {meId && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="card p-4">
            <div className="text-white/80 font-medium mb-2">Followers</div>
            {myFollowers.size === 0 ? (
              <div className="text-white/60 text-sm">No followers yet.</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {Array.from(myFollowers).slice(0, 12).map((uid) => {
                  const p = profiles[uid];
                  const avatar = p?.avatar_url || AVATAR_FALLBACK;
                  return <img key={uid} src={avatar} alt="" className="h-8 w-8 rounded-full border border-white/10" />;
                })}
              </div>
            )}
          </div>
          <div className="card p-4">
            <div className="text-white/80 font-medium mb-2">Following</div>
            {myFollowing.size === 0 ? (
              <div className="text-white/60 text-sm">You are not following anyone yet.</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {Array.from(myFollowing).slice(0, 12).map((uid) => {
                  const p = profiles[uid];
                  const avatar = p?.avatar_url || AVATAR_FALLBACK;
                  return <img key={uid} src={avatar} alt="" className="h-8 w-8 rounded-full border border-white/10" />;
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

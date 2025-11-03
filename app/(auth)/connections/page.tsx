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
  mentionsInPosts: number; // number of times this user mentioned me in posts
  mentionsInProfile: boolean; // whether their profile mentions me (proxy for relationship status)
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
    if (!meId) return;
    (async () => {
      setLoading(true);
      try {
        // Load latest posts and scan for mentions of me
        const { data: posts } = await supabase
          .from("posts")
          .select("id, user_id, body, created_at")
          .order("created_at", { ascending: false })
          .limit(500);

        const mentionNeedles: string[] = [];
        if (meUsername && meUsername.trim() !== "") {
          mentionNeedles.push(`@${meUsername}`);
          mentionNeedles.push(`/u/${meUsername}`);
        }
        // Fallback to id mention by URL (rare)
        if (meId) mentionNeedles.push(`/u/${meId}`);

        const byUser: Record<string, Connection> = {};
        for (const p of (posts as PostRow[] | null) || []) {
          const author = p.user_id || null;
          if (!author || author === meId) continue;
          const body = (p.body || "").toLowerCase();
          let hits = 0;
          for (const needle of mentionNeedles) {
            if (!needle) continue;
            const n = needle.toLowerCase();
            // count occurrences
            let idx = 0;
            while (true) {
              const found = body.indexOf(n, idx);
              if (found === -1) break;
              hits += 1;
              idx = found + n.length;
            }
          }
          if (hits > 0) {
            if (!byUser[author]) byUser[author] = { userId: author, mentionsInPosts: 0, mentionsInProfile: false };
            byUser[author].mentionsInPosts += hits;
          }
        }

        // Also find profiles that reference me (proxy for relationship status)
        if (meUsername && meUsername.trim() !== "") {
          try {
            const { data: profRefs } = await supabase
              .from("profiles")
              .select("user_id")
              .ilike("bio", `%@${meUsername}%`)
              .limit(2000);
            for (const row of (profRefs as any[]) || []) {
              const uid = row.user_id as string;
              if (uid === meId) continue;
              if (!byUser[uid]) byUser[uid] = { userId: uid, mentionsInPosts: 0, mentionsInProfile: true };
              else byUser[uid].mentionsInProfile = true;
            }
          } catch {
            // ignore if column missing
          }
        }

        const list = Object.values(byUser).sort((a, b) => {
          const as = a.mentionsInPosts + (a.mentionsInProfile ? 1 : 0);
          const bs = b.mentionsInPosts + (b.mentionsInProfile ? 1 : 0);
          return bs - as;
        });
        setConnections(list);

        // Load profiles for these users
        const ids = list.map((c) => c.userId);
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

  const maxStrength = useMemo(() => {
    return connections.reduce((m, c) => Math.max(m, c.mentionsInPosts + (c.mentionsInProfile ? 1 : 0)), 0) || 1;
  }, [connections]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 md:p-6 space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white mb-1">{title}</h1>
          <p className="text-white/70 text-sm">People who referenced your profile in posts or profile.</p>
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
            const strength = c.mentionsInPosts + (c.mentionsInProfile ? 1 : 0);
            const percent = Math.max(8, Math.round((strength / maxStrength) * 100));
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
                  <Button
                    variant={iFollow ? "secondary" : "primary"}
                    size="sm"
                    onClick={() => toggleFollow(c.userId)}
                    disabled={!!updatingFollow[c.userId]}
                  >
                    {iFollow ? "Following" : "Follow"}
                  </Button>
                </div>

                <div className="space-y-2">
                  <div className="text-white/70 text-xs">Connection strength</div>
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-2 bg-[linear-gradient(90deg,#7affc0,#00ffc8)]"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <div className="text-white/70 text-xs flex items-center gap-2">
                    <span>{c.mentionsInPosts} mentions in posts</span>
                    {c.mentionsInProfile && <span className="px-2 py-0.5 rounded-full border border-white/20">listed in profile</span>}
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

import type { NextApiRequest, NextApiResponse } from "next";
import { getAuthedClient } from "@/lib/dm/supabaseServer";

// Helper function to escape regex special characters
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Helper function to check if text contains a mention (whole word match)
function hasMention(text: string, patterns: string[]): boolean {
  const lowerText = text.toLowerCase();
  for (const pattern of patterns) {
    // Check for @username pattern (must be followed by space, newline, or end of string)
    if (pattern.startsWith("@")) {
      const username = escapeRegex(pattern.substring(1));
      const regex = new RegExp(`@${username}(\\s|$|\\n)`, "i");
      if (regex.test(lowerText)) return true;
    }
    // Check for /u/username or /u/userid pattern
    if (pattern.startsWith("/u/")) {
      const slug = escapeRegex(pattern.substring(3));
      const regex = new RegExp(`/u/${slug}(\\s|$|\\n)`, "i");
      if (regex.test(lowerText)) return true;
    }
  }
  return false;
}

const BASE_TRUST_FLOW = 5.0;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Get authenticated user
    let client, user;
    try {
      const authResult = await getAuthedClient(req);
      client = authResult.client;
      user = authResult.user;
    } catch (authError: any) {
      if (authError.status === 401) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      throw authError;
    }
    const meId = user.id;

    // Load user profile to get username
    const { data: profile } = await client
      .from("profiles")
      .select("user_id, username")
      .eq("user_id", meId)
      .maybeSingle();

    if (!profile) {
      return res.status(404).json({ error: "Profile not found" });
    }

    const meUsername = (profile as any)?.username ?? null;
    if (!meUsername) {
      return res.json({
        connections: [],
        profiles: {},
        swScores: {},
        trustFlowScores: {},
        myFollowing: [],
        myFollowers: [],
        followersProfiles: {},
        followingProfiles: {},
        followersSWScores: {},
        followersTrustFlowScores: {},
        followingSWScores: {},
        followingTrustFlowScores: {},
        recommendedPeople: [],
        recommendedProfiles: {},
        recommendedSWScores: {},
      });
    }

    // Load all posts in parallel with other initial data
    const [postsResult, followsResult] = await Promise.all([
      client
        .from("posts")
        .select("id, user_id, body, created_at")
        .order("created_at", { ascending: false })
        .limit(1000),
      Promise.all([
        client.from("follows").select("followee_id").eq("follower_id", meId),
        client.from("follows").select("follower_id").eq("followee_id", meId),
      ]),
    ]);

    const allPosts = postsResult.data || [];
    const [followingRows, followerRows] = followsResult;
    const followingSet = new Set(
      ((followingRows.data as any[]) || []).map((r) => r.followee_id as string),
    );
    const followersSet = new Set(
      ((followerRows.data as any[]) || []).map((r) => r.follower_id as string),
    );

    if (allPosts.length === 0) {
      return res.json({
        connections: [],
        profiles: {},
        swScores: {},
        trustFlowScores: {},
        myFollowing: Array.from(followingSet),
        myFollowers: Array.from(followersSet),
        followersProfiles: {},
        followingProfiles: {},
        followersSWScores: {},
        followersTrustFlowScores: {},
        followingSWScores: {},
        followingTrustFlowScores: {},
        recommendedPeople: [],
        recommendedProfiles: {},
        recommendedSWScores: {},
      });
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
    const allUserIds = new Set<string>();
    Object.keys(theyMentionedMe).forEach((uid) => allUserIds.add(uid));

    if (allUserIds.size > 0) {
      const { data: userProfiles } = await client
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
          if (lowerPattern.startsWith("@")) {
            const username = lowerPattern.substring(1);
            const regex = new RegExp(
              `@${escapeRegex(username)}(\\s|$|\\n)`,
              "i",
            );
            if (regex.test(body)) found = true;
          }
          // Check for /u/username pattern
          if (lowerPattern.startsWith("/u/")) {
            const username = lowerPattern.substring(3);
            const regex = new RegExp(
              `/u/${escapeRegex(username)}(\\s|$|\\n)`,
              "i",
            );
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

    // Calculate connections
    const connections: Array<{ userId: string; connectionsCount: number }> = [];

    // Combine all users who mentioned me or whom I mentioned
    const allConnectedUsers = new Set<string>();
    Object.keys(theyMentionedMe).forEach((uid) => allConnectedUsers.add(uid));
    Object.keys(iMentionedThem).forEach((uid) => allConnectedUsers.add(uid));

    for (const userId of allConnectedUsers) {
      const theirPosts = theyMentionedMe[userId] || new Set();
      const myPosts = iMentionedThem[userId] || new Set();

      // Count connections: sum of all tags
      const connectionsCount = theirPosts.size + myPosts.size;

      if (connectionsCount > 0) {
        connections.push({
          userId,
          connectionsCount,
        });
      }
    }

    // Sort by connections count (descending)
    connections.sort((a, b) => b.connectionsCount - a.connectionsCount);

    // Get all user IDs we need data for
    const connectionIds = connections.map((c) => c.userId);
    const allFollowUserIds = Array.from(
      new Set([...followingSet, ...followersSet]),
    );

    // Load all profiles, SW scores, and Trust Flow scores in parallel
    const [connectionProfilesResult, followProfilesResult, allProfilesResult] =
      await Promise.all([
        connectionIds.length > 0
          ? client
              .from("profiles")
              .select("user_id, username, full_name, avatar_url")
              .in("user_id", connectionIds)
          : Promise.resolve({ data: [] }),
        allFollowUserIds.length > 0
          ? client
              .from("profiles")
              .select("user_id, username, full_name, avatar_url")
              .in("user_id", allFollowUserIds)
          : Promise.resolve({ data: [] }),
        client.from("profiles").select("user_id, username"),
      ]);

    // Process connection profiles
    const profiles: Record<string, any> = {};
    for (const p of (connectionProfilesResult.data as any[]) || []) {
      profiles[p.user_id as string] = {
        user_id: p.user_id as string,
        username: (p.username as string | null) ?? null,
        full_name: (p.full_name as string | null) ?? null,
        avatar_url: (p.avatar_url as string | null) ?? null,
      };
    }

    // Process follow profiles
    const followersProfiles: Record<string, any> = {};
    const followingProfiles: Record<string, any> = {};
    if (followProfilesResult.data) {
      for (const p of followProfilesResult.data as any[]) {
        const profile: any = {
          user_id: p.user_id as string,
          username: (p.username as string | null) ?? null,
          full_name: (p.full_name as string | null) ?? null,
          avatar_url: (p.avatar_url as string | null) ?? null,
        };
        if (followersSet.has(p.user_id as string)) {
          followersProfiles[p.user_id as string] = profile;
        }
        if (followingSet.has(p.user_id as string)) {
          followingProfiles[p.user_id as string] = profile;
        }
      }
    }

    // Build all profiles map for recommendations
    const allProfilesMap: Record<string, string> = {};
    if (allProfilesResult.data) {
      for (const p of allProfilesResult.data as any[]) {
        const username = (p.username || "").toLowerCase();
        if (username) {
          allProfilesMap[p.user_id as string] = username;
        }
      }
    }

    // Load SW scores and Trust Flow scores in parallel
    const allUserIdsForScores = Array.from(
      new Set([...connectionIds, ...allFollowUserIds]),
    );
    const [swScoresResult, trustFlowResult] = await Promise.all([
      allUserIdsForScores.length > 0
        ? client
            .from("sw_scores")
            .select("user_id, total")
            .in("user_id", allUserIdsForScores)
        : Promise.resolve({ data: [] }),
      allUserIdsForScores.length > 0
        ? client
            .from("profiles")
            .select("user_id, trust_flow")
            .in("user_id", allUserIdsForScores)
        : Promise.resolve({ data: [] }),
    ]);

    // Process SW scores
    const swScores: Record<string, number> = {};
    const swScoresMap: Record<string, number> = {};
    if (swScoresResult.data) {
      for (const row of swScoresResult.data as any[]) {
        swScoresMap[row.user_id as string] = (row.total as number) || 0;
      }
    }
    for (const userId of connectionIds) {
      swScores[userId] = swScoresMap[userId] || 0;
    }

    const followersSWScores: Record<string, number> = {};
    const followingSWScores: Record<string, number> = {};
    for (const userId of allFollowUserIds) {
      const score = swScoresMap[userId] || 0;
      if (followersSet.has(userId)) {
        followersSWScores[userId] = score;
      }
      if (followingSet.has(userId)) {
        followingSWScores[userId] = score;
      }
    }

    // Process Trust Flow scores
    const trustFlowScores: Record<string, number> = {};
    const trustFlowMap: Record<string, number> = {};
    if (trustFlowResult.data) {
      for (const row of trustFlowResult.data as any[]) {
        const userId = row.user_id as string;
        if (!userId) continue;
        const rawValue = row.trust_flow;
        const numericValue = Number(rawValue);
        trustFlowMap[userId] = Number.isFinite(numericValue)
          ? numericValue
          : BASE_TRUST_FLOW;
      }
    }
    for (const userId of allUserIdsForScores) {
      if (!(userId in trustFlowMap)) {
        trustFlowMap[userId] = BASE_TRUST_FLOW;
      }
    }
    for (const userId of connectionIds) {
      trustFlowScores[userId] = trustFlowMap[userId] ?? BASE_TRUST_FLOW;
    }

    const followersTrustFlowScores: Record<string, number> = {};
    const followingTrustFlowScores: Record<string, number> = {};
    for (const userId of allFollowUserIds) {
      const score = trustFlowMap[userId] ?? BASE_TRUST_FLOW;
      if (followersSet.has(userId)) {
        followersTrustFlowScores[userId] = score;
      }
      if (followingSet.has(userId)) {
        followingTrustFlowScores[userId] = score;
      }
    }

    // Calculate recommended people
    const recommended: Array<{
      userId: string;
      reason: "connection" | "mutual_follow";
    }> = [];
    const recommendedSet = new Set<string>();

    // 1. Find 2nd degree connections (people connected through your connections)
    const connectionUserIds = connections.map((c) => c.userId);
    if (connectionUserIds.length > 0 && allPosts.length > 0) {
      const connectionUserIdsSet = new Set(connectionUserIds);

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
          if (!authorId || authorId === meId || authorId === connectionUserId)
            continue;

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
              const patterns = [
                `@${otherUsername}`,
                `/u/${otherUsername}`,
                `/u/${userId}`,
              ];
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
          if (
            userId === meId ||
            connectionUserIdsSet.has(userId) ||
            recommendedSet.has(userId)
          )
            continue;

          const theirPosts = theyMentionedConnection[userId];
          const connectionPosts = connectionMentionedThem[userId] || new Set();

          if (theirPosts.size > 0 && connectionPosts.size > 0) {
            recommended.push({ userId, reason: "connection" });
            recommendedSet.add(userId);
          }
        }
      }
    }

    // 2. Find mutual follows (people who follow you AND you follow them)
    const mutualFollows = Array.from(followersSet).filter((uid) =>
      followingSet.has(uid),
    );
    for (const uid of mutualFollows) {
      if (!recommendedSet.has(uid) && !connectionUserIds.includes(uid)) {
        recommended.push({ userId: uid, reason: "mutual_follow" });
        recommendedSet.add(uid);
      }
    }

    // Load profiles and SW scores for recommended people
    const recommendedIds = recommended.map((r) => r.userId);
    const [recommendedProfilesResult, recommendedSWResult] = await Promise.all([
      recommendedIds.length > 0
        ? client
            .from("profiles")
            .select("user_id, username, full_name, avatar_url")
            .in("user_id", recommendedIds)
        : Promise.resolve({ data: [] }),
      recommendedIds.length > 0
        ? client
            .from("sw_scores")
            .select("user_id, total")
            .in("user_id", recommendedIds)
        : Promise.resolve({ data: [] }),
    ]);

    const recommendedProfiles: Record<string, any> = {};
    if (recommendedProfilesResult.data) {
      for (const p of recommendedProfilesResult.data as any[]) {
        recommendedProfiles[p.user_id as string] = {
          user_id: p.user_id as string,
          username: (p.username as string | null) ?? null,
          full_name: (p.full_name as string | null) ?? null,
          avatar_url: (p.avatar_url as string | null) ?? null,
        };
      }
    }

    const recommendedSWScores: Record<string, number> = {};
    if (recommendedSWResult.data) {
      for (const row of recommendedSWResult.data as any[]) {
        recommendedSWScores[row.user_id as string] = (row.total as number) || 0;
      }
    }

    return res.json({
      connections,
      profiles,
      swScores,
      trustFlowScores,
      myFollowing: Array.from(followingSet),
      myFollowers: Array.from(followersSet),
      followersProfiles,
      followingProfiles,
      followersSWScores,
      followersTrustFlowScores,
      followingSWScores,
      followingTrustFlowScores,
      recommendedPeople: recommended,
      recommendedProfiles,
      recommendedSWScores,
    });
  } catch (error: any) {
    console.error("Error in connections API:", error);
    return res
      .status(500)
      .json({ error: error.message || "Internal server error" });
  }
}

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  // Get current user from session
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  
  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const userId = (req.query.user_id as string) || user.id;

  try {
    const preferredUserColumns = ['user_id', 'author_id'];

    const isUndefinedColumnError = (error: any) => {
      if (!error) return false;
      if (error.code === '42703') return true;
      const message = `${error.message || ''}${error.details || ''}`.toLowerCase();
      return message.includes('column') && message.includes('does not exist');
    };

    const getCountByUserColumns = async (table: string, columns: string[]) => {
      let fallbackCount = 0;

      for (const column of columns) {
        const { count, error } = await supabase
          .from(table)
          .select('id', { count: 'exact', head: true })
          .eq(column, userId);

        if (error) {
          if (isUndefinedColumnError(error)) {
            continue;
          }
          throw error;
        }

        if (typeof count === 'number') {
          if (count > 0) {
            return count;
          }
          fallbackCount = Math.max(fallbackCount, count);
        }
      }

      return fallbackCount;
    };

    const getRowsByUserColumns = async (table: string, columns: string[]) => {
      for (const column of columns) {
        const { data, error } = await supabase
          .from(table)
          .select('id')
          .eq(column, userId);

        if (error) {
          if (isUndefinedColumnError(error)) {
            continue;
          }
          throw error;
        }

        if (data && data.length > 0) {
          return data;
        }
      }

      return [];
    };

    // Get SW weights
    const { data: weights, error: weightsError } = await supabase
      .from('sw_weights')
      .select('*')
      .eq('id', 1)
      .single();

    if (weightsError || !weights) {
      return res.status(500).json({ error: 'Failed to load SW weights' });
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (profileError && profileError.code !== 'PGRST116') {
      return res.status(500).json({ error: profileError.message });
    }

    // Calculate registration points
    const registrationPoints = profile ? weights.registration_points : 0;

    // Calculate profile complete points
    let profileCompletePoints = 0;
    if (profile) {
      const hasUsername = profile.username && profile.username.trim() !== '';
      const hasFullName = profile.full_name && profile.full_name.trim() !== '';
      const hasBio = profile.bio && profile.bio.trim() !== '';
      const hasCountry = profile.country && profile.country.trim() !== '';
      const hasAvatar = profile.avatar_url && profile.avatar_url.trim() !== '';
      
      if (hasUsername && hasFullName && hasBio && hasCountry && hasAvatar) {
        profileCompletePoints = weights.profile_complete_points;
      }
    }

    // Get growth total points from sw_ledger
    const { data: growthLedger, error: ledgerError } = await supabase
      .from('sw_ledger')
      .select('points')
      .eq('user_id', userId);

    const growthTotalPoints = growthLedger
      ? growthLedger.reduce((sum, entry) => sum + (entry.points || 0), 0) * weights.growth_total_points_multiplier
      : 0;

    // Get followers count
    const { count: followersCount, error: followersError } = await supabase
      .from('follows')
      .select('follower_id', { count: 'exact', head: true })
      .eq('followee_id', userId);

    const followersPoints = (followersCount || 0) * weights.follower_points;

    // Get connections count (mutual mentions)
    // Calculate connections based on mutual mentions in posts (same logic as connections page)
    let connectionsCount = 0;
    let firstConnectionsCount = 0;
    let repeatConnectionsCount = 0;

    if (profile && profile.username) {
      // Get all posts to check for mutual mentions
      // Try both 'body' and 'text' fields to handle different schema versions
      const { data: allPosts, error: allPostsError } = await supabase
        .from('posts')
        .select('id, body, text, user_id, author_id')
        .order('created_at', { ascending: false })
        .limit(1000);

      if (allPosts && !allPostsError) {
        const myMentionPatterns: string[] = [];
        if (profile.username && profile.username.trim() !== '') {
          myMentionPatterns.push(`@${profile.username.toLowerCase()}`);
          myMentionPatterns.push(`/u/${profile.username.toLowerCase()}`);
        }
        myMentionPatterns.push(`/u/${userId}`);

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

        // Map: userId -> set of post IDs where they mentioned me
        const theyMentionedMe: Record<string, Set<number>> = {};
        
        // Map: userId -> set of post IDs where I mentioned them
        const iMentionedThem: Record<string, Set<number>> = {};

        // Find users who mentioned this user
        for (const post of allPosts) {
          const postAuthorId = (post as any).user_id || (post as any).author_id;
          if (!postAuthorId || postAuthorId === userId) continue;
          
          const body = (post as any).body || (post as any).text || '';
          if (hasMention(body, myMentionPatterns)) {
            if (!theyMentionedMe[postAuthorId]) {
              theyMentionedMe[postAuthorId] = new Set();
            }
            theyMentionedMe[postAuthorId].add(post.id);
          }
        }

        // Get all usernames for comparison
        const allUserIds = new Set<string>();
        Object.keys(theyMentionedMe).forEach((uid) => allUserIds.add(uid));

        if (allUserIds.size > 0) {
          const { data: userProfiles } = await supabase
            .from('profiles')
            .select('user_id, username')
            .in('user_id', Array.from(allUserIds));

          const usernameToUserId: Record<string, string> = {};
          if (userProfiles) {
            for (const p of userProfiles as any[]) {
              const uid = p.user_id as string;
              const username = (p.username || '').toLowerCase();
              if (username) {
                usernameToUserId[`@${username}`] = uid;
                usernameToUserId[`/u/${username}`] = uid;
              }
            }
          }

          // Find my posts that mention others
          for (const post of allPosts) {
            const postAuthorId = (post as any).user_id || (post as any).author_id;
            if (postAuthorId !== userId) continue;

            const body = (post as any).body || (post as any).text || '';
            
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

          // Calculate mutual connections
          // A connection is when: user A tagged me in their post AND I tagged user A in my post
          // Count connections as the minimum of both mentions
          for (const userId_conn of Object.keys(theyMentionedMe)) {
            const theirPosts = theyMentionedMe[userId_conn] || new Set();
            const myPosts = iMentionedThem[userId_conn] || new Set();

            if (theirPosts.size > 0 && myPosts.size > 0) {
              // Count as the minimum of both - represents actual mutual connections
              const mutualCount = Math.min(theirPosts.size, myPosts.size);
              connectionsCount += mutualCount;
              
              // First connection gets more points, repeat connections get less
              if (mutualCount === 1) {
                firstConnectionsCount++;
              } else {
                firstConnectionsCount++;
                repeatConnectionsCount += (mutualCount - 1);
              }
            }
          }
        }
      }
    }

    const connectionsPoints = (firstConnectionsCount * weights.connection_first_points) + 
                             (repeatConnectionsCount * weights.connection_repeat_points);

    // Get posts count - try both author_id and user_id fields
    const postsCount = await getCountByUserColumns('posts', preferredUserColumns);
    const postsPoints = postsCount * weights.post_points;

    // Get comments count
    const commentsCount = await getCountByUserColumns('comments', preferredUserColumns);
    const commentsPoints = commentsCount * weights.comment_points;

    // Get reactions count (received reactions on user's posts)
    // Try both author_id and user_id fields
    const userPostsForReactions = await getRowsByUserColumns('posts', preferredUserColumns);

    let reactionsCount = 0;
    if (userPostsForReactions.length > 0) {
      const postIds = userPostsForReactions.map((p: any) => p.id);
      const { count, error } = await supabase
        .from('post_reactions')
        .select('post_id', { count: 'exact', head: true })
        .in('post_id', postIds);

      if (error) {
        throw error;
      }

      reactionsCount = count || 0;
    }

    const reactionsPoints = reactionsCount * weights.reaction_points;

    // Calculate total SW
    const totalSW = 
      registrationPoints +
      profileCompletePoints +
      growthTotalPoints +
      followersPoints +
      connectionsPoints +
      postsPoints +
      commentsPoints +
      reactionsPoints;

    // Breakdown
    const breakdown = {
      registration: {
        points: registrationPoints,
        count: profile ? 1 : 0,
        weight: weights.registration_points,
      },
      profileComplete: {
        points: profileCompletePoints,
        count: profileCompletePoints > 0 ? 1 : 0,
        weight: weights.profile_complete_points,
      },
      growth: {
        points: growthTotalPoints,
        count: growthLedger?.length || 0,
        weight: weights.growth_total_points_multiplier,
        description: 'Growth Directions Total Points',
      },
      followers: {
        points: followersPoints,
        count: followersCount || 0,
        weight: weights.follower_points,
      },
      connections: {
        points: connectionsPoints,
        count: connectionsCount,
        firstCount: firstConnectionsCount,
        repeatCount: repeatConnectionsCount,
        firstWeight: weights.connection_first_points,
        repeatWeight: weights.connection_repeat_points,
      },
      posts: {
        points: postsPoints,
        count: postsCount,
        weight: weights.post_points,
      },
      comments: {
        points: commentsPoints,
        count: commentsCount,
        weight: weights.comment_points,
      },
      reactions: {
        points: reactionsPoints,
        count: reactionsCount,
        weight: weights.reaction_points,
      },
    };

    return res.status(200).json({
      totalSW,
      breakdown,
      weights,
    });
  } catch (error: any) {
    console.error('sw/calculate error:', error);
    return res.status(500).json({ error: error.message });
  }
}

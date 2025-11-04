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

  const userId = req.query.user_id as string || user.id;

  try {
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
    // Calculate connections based on mutual mentions in posts
    let connectionsCount = 0;
    let firstConnectionsCount = 0;
    let repeatConnectionsCount = 0;

    if (profile && profile.username) {
      // Get all posts to check for mutual mentions
      const { data: allPosts, error: allPostsError } = await supabase
        .from('posts')
        .select('id, text, author_id')
        .order('created_at', { ascending: false })
        .limit(1000);

      if (allPosts && !allPostsError) {
        const myMentionPatterns: string[] = [];
        if (profile.username && profile.username.trim() !== '') {
          myMentionPatterns.push(`@${profile.username.toLowerCase()}`);
          myMentionPatterns.push(`/u/${profile.username.toLowerCase()}`);
        }
        myMentionPatterns.push(`/u/${userId}`);

        // Helper function to check if text contains a mention
        const hasMention = (text: string, patterns: string[]): boolean => {
          const lowerText = text.toLowerCase();
          for (const pattern of patterns) {
            if (pattern.startsWith('@')) {
              const regex = new RegExp(`@${pattern.substring(1)}(\\s|$|\\n)`, 'i');
              if (regex.test(lowerText)) return true;
            }
            if (pattern.startsWith('/u/')) {
              const regex = new RegExp(`/u/${pattern.substring(3)}(\\s|$|\\n)`, 'i');
              if (regex.test(lowerText)) return true;
            }
          }
          return false;
        };

        // Map: userId -> count of posts where they mentioned me
        const theyMentionedMe: Record<string, number> = {};
        
        // Map: userId -> count of posts where I mentioned them
        const iMentionedThem: Record<string, number> = {};

        // Find users who mentioned this user
        for (const post of allPosts) {
          if (post.author_id === userId) continue;
          const text = post.text || '';
          if (hasMention(text, myMentionPatterns)) {
            theyMentionedMe[post.author_id] = (theyMentionedMe[post.author_id] || 0) + 1;
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
            if (post.author_id !== userId) continue;
            const text = post.text || '';
            
            // Check for mentions of other users
            for (const [pattern, uid] of Object.entries(usernameToUserId)) {
              const lowerPattern = pattern.toLowerCase();
              let found = false;
              
              if (lowerPattern.startsWith('@')) {
                const username = lowerPattern.substring(1);
                const regex = new RegExp(`@${username}(\\s|$|\\n)`, 'i');
                if (regex.test(text)) found = true;
              }
              if (lowerPattern.startsWith('/u/')) {
                const username = lowerPattern.substring(3);
                const regex = new RegExp(`/u/${username}(\\s|$|\\n)`, 'i');
                if (regex.test(text)) found = true;
              }
              
              if (found) {
                iMentionedThem[uid] = (iMentionedThem[uid] || 0) + 1;
              }
            }
          }

          // Calculate mutual connections
          // A connection is when: user A tagged me in their post AND I tagged user A in my post
          // Count connections as the minimum of both mentions
          for (const userId_conn of Object.keys(theyMentionedMe)) {
            const theirPosts = theyMentionedMe[userId_conn] || 0;
            const myPosts = iMentionedThem[userId_conn] || 0;

            if (theirPosts > 0 && myPosts > 0) {
              // Count as the minimum of both - represents actual mutual connections
              const mutualCount = Math.min(theirPosts, myPosts);
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

    // Get posts count
    const { count: postsCount, error: postsCountError } = await supabase
      .from('posts')
      .select('id', { count: 'exact', head: true })
      .eq('author_id', userId);

    const postsPoints = (postsCount || 0) * weights.post_points;

    // Get comments count
    const { count: commentsCount, error: commentsError } = await supabase
      .from('comments')
      .select('id', { count: 'exact', head: true })
      .eq('author_id', userId);

    const commentsPoints = (commentsCount || 0) * weights.comment_points;

    // Get reactions count (received reactions on user's posts)
    const { data: userPostsForReactions, error: userPostsForReactionsError } = await supabase
      .from('posts')
      .select('id')
      .eq('author_id', userId);

    let reactionsPoints = 0;
    if (userPostsForReactions && userPostsForReactions.length > 0) {
      const postIds = userPostsForReactions.map(p => p.id);
      const { count: reactionsCount, error: reactionsError } = await supabase
        .from('post_reactions')
        .select('id', { count: 'exact', head: true })
        .in('post_id', postIds);

      reactionsPoints = (reactionsCount || 0) * weights.reaction_points;
    }

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
        count: postsCount || 0,
        weight: weights.post_points,
      },
      comments: {
        points: commentsPoints,
        count: commentsCount || 0,
        weight: weights.comment_points,
      },
      reactions: {
        points: reactionsPoints,
        count: reactionsPoints / weights.reaction_points,
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

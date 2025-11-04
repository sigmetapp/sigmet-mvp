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

  let userId: string | undefined;
  let user: any = null;

  try {
    const token = authHeader.replace('Bearer ', '');
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !authUser) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    user = authUser;
    userId = (req.query.user_id as string) || user.id;
  } catch (authErr: any) {
    console.error('sw/calculate auth error:', {
      error: authErr,
      message: authErr?.message || '',
      code: authErr?.code || '',
    });
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const preferredUserColumns = ['user_id', 'author_id'];

    const isUndefinedColumnError = (error: any) => {
      if (!error) return false;
      if (error.code === '42703') return true;
      const message = `${error.message || ''}${error.details || ''}`.toLowerCase();
      return message.includes('column') && message.includes('does not exist');
    };

    const isAccessError = (error: any) => {
      if (!error) return false;
      // RLS errors and permission errors
      if (error.code === '42501' || error.code === 'PGRST301') return true;
      // If error exists but has empty fields, it might be an RLS block
      if (error && (!error.message || error.message === '') && 
          (!error.code || error.code === '') && 
          (!error.details || error.details === '')) {
        return true;
      }
      const message = `${error.message || ''}${error.details || ''}`.toLowerCase();
      return message.includes('permission') || 
             message.includes('policy') || 
             message.includes('access denied') ||
             message.includes('row-level security');
    };

    const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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
          // For non-admins, skip access errors instead of throwing
          if (isAccessError(error)) {
            console.warn(`Access error in getCountByUserColumns for table ${table}, column ${column} (skipping):`, {
              message: error?.message || '',
              code: error?.code || '',
              userId,
            });
            continue;
          }
          console.error(`Error in getCountByUserColumns for table ${table}, column ${column}:`, {
            error,
            message: error?.message || '',
            code: error?.code || '',
            details: error?.details || '',
            userId,
          });
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
          // For non-admins, skip access errors instead of throwing
          if (isAccessError(error)) {
            console.warn(`Access error in getRowsByUserColumns for table ${table}, column ${column} (skipping):`, {
              message: error?.message || '',
              code: error?.code || '',
              userId,
            });
            continue;
          }
          console.error(`Error in getRowsByUserColumns for table ${table}, column ${column}:`, {
            error,
            message: error?.message || '',
            code: error?.code || '',
            details: error?.details || '',
            userId,
          });
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
    let growthTotalPoints = 0;
    let growthLedger: any[] = [];
    try {
      const { data, error: ledgerError } = await supabase
        .from('sw_ledger')
        .select('points')
        .eq('user_id', userId);

      if (ledgerError) {
        console.warn('Error fetching growth ledger:', ledgerError);
        growthTotalPoints = 0;
        growthLedger = [];
      } else {
        growthLedger = data || [];
        growthTotalPoints = growthLedger.length > 0
          ? growthLedger.reduce((sum, entry) => sum + (entry.points || 0), 0) * weights.growth_total_points_multiplier
          : 0;
      }
    } catch (ledgerErr) {
      console.warn('Exception fetching growth ledger:', ledgerErr);
      growthTotalPoints = 0;
      growthLedger = [];
    }

    // Get followers count
    let followersCount = 0;
    try {
      const { count, error: followersError } = await supabase
        .from('follows')
        .select('follower_id', { count: 'exact', head: true })
        .eq('followee_id', userId);

      if (followersError) {
        console.warn('Error fetching followers:', followersError);
        followersCount = 0;
      } else {
        followersCount = count || 0;
      }
    } catch (followersErr) {
      console.warn('Exception fetching followers:', followersErr);
      followersCount = 0;
    }

    const followersPoints = followersCount * weights.follower_points;

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

      if (allPostsError) {
        console.error('Error fetching all posts for connections calculation:', {
          error: allPostsError,
          message: allPostsError?.message || '',
          code: allPostsError?.code || '',
          details: allPostsError?.details || '',
          userId,
        });
        // Continue without connections if there's an error
      } else if (allPosts) {
        const myMentionPatterns: string[] = [];
        if (profile.username && profile.username.trim() !== '') {
          myMentionPatterns.push(`@${profile.username.toLowerCase()}`);
          myMentionPatterns.push(`/u/${profile.username.toLowerCase()}`);
        }
        myMentionPatterns.push(`/u/${userId}`);

        // Helper function to check if text contains a mention (whole word match)
          const hasMention = (text: string, patterns: string[]): boolean => {
            for (const pattern of patterns) {
              if (pattern.startsWith('@')) {
                const username = escapeRegex(pattern.substring(1));
                const regex = new RegExp(`@${username}(\\s|$|\\n)`, 'i');
                if (regex.test(text)) return true;
              }
              if (pattern.startsWith('/u/')) {
                const slug = escapeRegex(pattern.substring(3));
                const regex = new RegExp(`/u/${slug}(\\s|$|\\n)`, 'i');
                if (regex.test(text)) return true;
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
          const { data: userProfiles, error: userProfilesError } = await supabase
            .from('profiles')
            .select('user_id, username')
            .in('user_id', Array.from(allUserIds));

          if (userProfilesError) {
            console.error('Error fetching user profiles for connections calculation:', {
              error: userProfilesError,
              message: userProfilesError?.message || '',
              code: userProfilesError?.code || '',
              details: userProfilesError?.details || '',
              userId,
              allUserIdsCount: allUserIds.size,
            });
            // Continue without user profiles - will skip connections calculation
          }

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
                const regex = new RegExp(`@${escapeRegex(username)}(\\s|$|\\n)`, 'i');
                if (regex.test(body)) found = true;
              }
              // Check for /u/username pattern
              if (lowerPattern.startsWith('/u/')) {
                const username = lowerPattern.substring(3);
                const regex = new RegExp(`/u/${escapeRegex(username)}(\\s|$|\\n)`, 'i');
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
        console.error('Error fetching post_reactions:', {
          error,
          message: error?.message || '',
          code: error?.code || '',
          details: error?.details || '',
          userId,
          postIds: postIds.length,
        });
        throw error;
      }

      reactionsCount = count || 0;
    }

    const reactionsPoints = reactionsCount * weights.reaction_points;

      // Get invites count - count accepted invites where user got 70 pts (registration + profile complete)
      let invitesCount = 0;
      let inviteeGrowthTotalPoints = 0;

      try {
        const { data: invites, error: invitesError } = await supabase
          .from('invites')
          .select('id, consumed_by_user_sw, consumed_by_user_id')
          .eq('inviter_user_id', userId)
          .eq('status', 'accepted')
          .eq('consumed_by_user_sw', 70);

        if (invitesError) {
          console.warn('Error fetching invites:', invitesError);
          // Continue without invites if there's an error (e.g., RLS issue)
        } else if (invites) {
          invitesCount = invites.length;

          const inviteeIds = Array.from(
            new Set(
              invites
                .map((invite: any) => invite.consumed_by_user_id)
                .filter((id: string | null | undefined): id is string => Boolean(id))
            )
          );

          if (inviteeIds.length > 0) {
            const { data: inviteeLedgerRows, error: inviteeLedgerError } = await supabase
              .from('sw_ledger')
              .select('user_id, points')
              .in('user_id', inviteeIds);

            if (inviteeLedgerError) {
              console.warn('Error fetching invited users growth ledger:', inviteeLedgerError);
            } else if (inviteeLedgerRows) {
              const inviteeRawGrowthPoints = inviteeLedgerRows.reduce(
                (sum, entry) => sum + (entry.points || 0),
                0
              );
              inviteeGrowthTotalPoints = inviteeRawGrowthPoints * weights.growth_total_points_multiplier;
            }
          }
        }
      } catch (invitesErr) {
        console.warn('Exception fetching invites:', invitesErr);
        // Continue without invites
      }

      const invitePoints = invitesCount * 50; // 50 pts per invite

      // Calculate 5% bonus on invited users' growth points
      const growthBonusPoints = inviteeGrowthTotalPoints * 0.05;

    // Calculate total SW
    const totalSW = 
      registrationPoints +
      profileCompletePoints +
      growthTotalPoints +
      followersPoints +
      connectionsPoints +
      postsPoints +
      commentsPoints +
      reactionsPoints +
      invitePoints +
      growthBonusPoints;

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
      invites: {
        points: invitePoints,
        count: invitesCount,
        weight: 50,
      },
      growthBonus: {
        points: Math.round(growthBonusPoints * 100) / 100, // Round to 2 decimal places
        count: invitesCount,
        weight: 0.05,
        description: '5% bonus on invited users\' growth points',
      },
    };

    return res.status(200).json({
      totalSW,
      breakdown,
      weights,
    });
  } catch (error: any) {
    // Enhanced error logging
    console.error('sw/calculate error:', {
      message: error?.message || '',
      code: error?.code || '',
      details: error?.details || '',
      hint: error?.hint || '',
      status: error?.status || '',
      statusCode: error?.statusCode || '',
      error: error,
      stack: error?.stack || '',
      userId: userId || 'unknown',
      user: user?.id || 'unknown',
      userEmail: user?.email || 'unknown',
      isAdmin: user?.is_admin || false,
    });
    
    const errorMessage = error?.message || error?.code || error?.details || error?.hint || 'Unknown error occurred';
    const errorDetails = error?.details || error?.hint || error?.code || '';
    return res.status(500).json({ 
      error: errorMessage,
      details: errorDetails,
      code: error?.code || '',
      stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined
    });
  }
}

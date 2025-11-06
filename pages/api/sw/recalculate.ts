import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabaseServer';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = supabaseAdmin();

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

  const userId = req.body.user_id as string || user.id;

  // Helper function to check if error is an access error (RLS)
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

  try {
    const preferredUserColumns = ['user_id', 'author_id'];

    const isUndefinedColumnError = (error: any) => {
      if (!error) return false;
      if (error.code === '42703') return true;
      const message = `${error.message || ''}${error.details || ''}`.toLowerCase();
      return message.includes('column') && message.includes('does not exist');
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
          throw error;
        }

        if (data && data.length > 0) {
          return data;
        }
      }

      return [];
    };

    // Call the calculate endpoint logic
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
    try {
      const { data: growthLedger, error: ledgerError } = await supabase
        .from('sw_ledger')
        .select('points')
        .eq('user_id', userId);

      if (ledgerError) {
        console.warn('Error fetching growth ledger:', ledgerError);
        growthTotalPoints = 0;
      } else {
        growthTotalPoints = growthLedger
          ? growthLedger.reduce((sum, entry) => sum + (entry.points || 0), 0) * weights.growth_total_points_multiplier
          : 0;
      }
    } catch (ledgerErr) {
      console.warn('Exception fetching growth ledger:', ledgerErr);
      growthTotalPoints = 0;
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

    // Calculate connections (same logic as calculate endpoint)
    let connectionsCount = 0;
    let firstConnectionsCount = 0;
    let repeatConnectionsCount = 0;

    if (profile && profile.username) {
      const { data: allPosts, error: allPostsError } = await supabase
        .from('posts')
        .select('id, body, text, user_id, author_id')
        .order('created_at', { ascending: false })
        .limit(1000);

      if (allPostsError) {
        // For non-admins, skip access errors instead of throwing
        if (isAccessError(allPostsError)) {
          console.warn('Access error fetching all posts for connections calculation (skipping):', {
            message: allPostsError?.message || '',
            code: allPostsError?.code || '',
            userId,
          });
          // Continue without connections
        }
      } else if (allPosts) {
        const myMentionPatterns: string[] = [];
        if (profile.username && profile.username.trim() !== '') {
          myMentionPatterns.push(`@${profile.username.toLowerCase()}`);
          myMentionPatterns.push(`/u/${profile.username.toLowerCase()}`);
        }
        myMentionPatterns.push(`/u/${userId}`);

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

        const theyMentionedMe: Record<string, Set<number>> = {};
        const iMentionedThem: Record<string, Set<number>> = {};

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

          for (const post of allPosts) {
            const postAuthorId = (post as any).user_id || (post as any).author_id;
            if (postAuthorId !== userId) continue;

            const body = (post as any).body || (post as any).text || '';
            
            for (const [pattern, uid] of Object.entries(usernameToUserId)) {
              const lowerPattern = pattern.toLowerCase();
              let found = false;
              
              if (lowerPattern.startsWith('@')) {
                const username = lowerPattern.substring(1);
                const regex = new RegExp(`@${escapeRegex(username)}(\\s|$|\\n)`, 'i');
                if (regex.test(body)) found = true;
              }
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
          // First connection overall gets more points, repeat connections get less
          for (const userId_conn of Object.keys(theyMentionedMe)) {
            const theirPosts = theyMentionedMe[userId_conn] || new Set();
            const myPosts = iMentionedThem[userId_conn] || new Set();

            if (theirPosts.size > 0 && myPosts.size > 0) {
              // Count as the minimum of both - represents actual mutual connections
              const mutualCount = Math.min(theirPosts.size, myPosts.size);
              connectionsCount += mutualCount;
              
              // For each mutual connection with this user:
              // - The first connection overall is "first"
              // - All subsequent connections are "repeat"
              for (let i = 0; i < mutualCount; i++) {
                if (firstConnectionsCount === 0) {
                  // This is the first connection overall
                  firstConnectionsCount++;
                } else {
                  // This is a repeat connection
                  repeatConnectionsCount++;
                }
              }
            }
          }
        }
      }
    }

    const connectionsPoints = (firstConnectionsCount * weights.connection_first_points) + 
                             (repeatConnectionsCount * weights.connection_repeat_points);

    // Get posts count
    const postsCount = await getCountByUserColumns('posts', preferredUserColumns);
    const postsPoints = postsCount * weights.post_points;

    // Get comments count
    const commentsCount = await getCountByUserColumns('comments', preferredUserColumns);
    const commentsPoints = commentsCount * weights.comment_points;

    // Get reactions count
    const userPostsForReactions = await getRowsByUserColumns('posts', preferredUserColumns);

    let reactionsCount = 0;
    if (userPostsForReactions.length > 0) {
      const postIds = userPostsForReactions.map((p: any) => p.id);
      const { count, error } = await supabase
        .from('post_reactions')
        .select('post_id', { count: 'exact', head: true })
        .in('post_id', postIds);

      if (error) {
        // For non-admins, skip access errors instead of throwing
        if (isAccessError(error)) {
          console.warn('Access error fetching post_reactions (skipping):', {
            message: error?.message || '',
            code: error?.code || '',
            userId,
            postIds: postIds.length,
          });
          reactionsCount = 0;
        } else {
          throw error;
        }
      } else {
        reactionsCount = count || 0;
      }
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

      const invitePointsPerInvite = weights.invite_points ?? 50;
      const invitePoints = invitesCount * invitePointsPerInvite;

      // Calculate bonus on invited users' growth points
      const growthBonusPercentage = weights.growth_bonus_percentage ?? 0.05;
      const growthBonusPoints = inviteeGrowthTotalPoints * growthBonusPercentage;

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

    // Calculate inflation rate (same logic as calculate endpoint)
    let inflationRate = 1.0;
    
    try {
      // Get total number of users
      const { count: totalUsers, error: usersError } = await supabase
        .from('profiles')
        .select('user_id', { count: 'exact', head: true });

      const userCount = totalUsers || 0;
      
      // Calculate days since registration (if profile exists)
      let daysSinceRegistration = 0;
      if (profile && profile.created_at) {
        const registrationDate = new Date(profile.created_at).getTime();
        const now = Date.now();
        daysSinceRegistration = Math.floor((now - registrationDate) / (24 * 60 * 60 * 1000));
      }

      // Inflation formula using parameters from weights
      const dailyInflationRate = weights.daily_inflation_rate ?? 0.001;
      const userGrowthInflationRate = weights.user_growth_inflation_rate ?? 0.0001;
      const minInflationRate = weights.min_inflation_rate ?? 0.5;
      
      // Daily reduction: -dailyInflationRate per day
      const dailyInflation = 1.0 - (daysSinceRegistration * dailyInflationRate);
      // User growth reduction: -userGrowthInflationRate per 100 users
      const userGrowthInflation = 1.0 - ((userCount / 100) * userGrowthInflationRate);
      
      // Combined inflation (multiplicative)
      inflationRate = Math.max(minInflationRate, dailyInflation * userGrowthInflation);
    } catch (inflationErr) {
      console.warn('Error calculating inflation:', inflationErr);
      inflationRate = 1.0; // Default to no inflation on error
    }

    // Apply inflation to total SW
    const inflatedSW = Math.floor(totalSW * inflationRate);

    // Build breakdown for caching
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
        count: 0, // Growth ledger count not available in recalculate
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
        weight: invitePointsPerInvite,
      },
      growthBonus: {
        points: Math.round(growthBonusPoints * 100) / 100,
        count: invitesCount,
        weight: growthBonusPercentage,
        description: `${(growthBonusPercentage * 100).toFixed(0)}% bonus on invited users' growth points`,
      },
    };

    // Update sw_scores table with breakdown and inflation
    try {
      await supabase
        .from('sw_scores')
        .upsert({
          user_id: userId,
          total: inflatedSW,
          breakdown: breakdown,
          inflation_rate: inflationRate,
          inflation_last_updated: new Date().toISOString(),
          last_updated: new Date().toISOString(),
        }, {
          onConflict: 'user_id',
        });
    } catch (error) {
      // Table might not exist, ignore
      console.log('sw_scores table update skipped:', error);
    }

    return res.status(200).json({
      success: true,
      totalSW: inflatedSW,
      originalSW: totalSW,
      inflationRate,
      message: 'SW recalculated successfully',
    });
  } catch (error: any) {
    console.error('sw/recalculate error:', {
      message: error?.message || '',
      code: error?.code || '',
      details: error?.details || '',
      error: error,
      userId: userId || 'unknown',
      user: user?.id || 'unknown',
      userEmail: user?.email || 'unknown',
      isAdmin: user?.is_admin || false,
    });
    
    // If this is an access error (RLS) for non-admins, return a more graceful error
    if (isAccessError(error) && !user?.is_admin) {
      console.warn('Access error for non-admin user:', {
        userId: userId || 'unknown',
        userEmail: user?.email || 'unknown',
      });
      return res.status(403).json({ 
        error: 'Access denied: insufficient permissions to recalculate SW score',
        code: error?.code || 'ACCESS_DENIED',
        message: 'Some data is not accessible due to row-level security policies'
      });
    }
    
    return res.status(500).json({ 
      error: error?.message || error?.code || 'Unknown error occurred',
      code: error?.code || '',
    });
  }
}

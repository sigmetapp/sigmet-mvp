import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
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

  const userId = req.body.user_id as string || user.id;

  try {
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

      if (allPosts && !allPostsError) {
        const myMentionPatterns: string[] = [];
        if (profile.username && profile.username.trim() !== '') {
          myMentionPatterns.push(`@${profile.username.toLowerCase()}`);
          myMentionPatterns.push(`/u/${profile.username.toLowerCase()}`);
        }
        myMentionPatterns.push(`/u/${userId}`);

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
                const regex = new RegExp(`@${username}(\\s|$|\\n)`, 'i');
                if (regex.test(body)) found = true;
              }
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

          for (const userId_conn of Object.keys(theyMentionedMe)) {
            const theirPosts = theyMentionedMe[userId_conn] || new Set();
            const myPosts = iMentionedThem[userId_conn] || new Set();

            if (theirPosts.size > 0 && myPosts.size > 0) {
              const mutualCount = Math.min(theirPosts.size, myPosts.size);
              connectionsCount += mutualCount;
              
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
    let postsCount = 0;
    const { count: postsCountByAuthor } = await supabase
      .from('posts')
      .select('id', { count: 'exact', head: true })
      .eq('author_id', userId);
    
    if (postsCountByAuthor === null) {
      const { count: postsCountByUser } = await supabase
        .from('posts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);
      postsCount = postsCountByUser || 0;
    } else {
      postsCount = postsCountByAuthor || 0;
    }

    const postsPoints = postsCount * weights.post_points;

    // Get comments count
    const { count: commentsCount, error: commentsError } = await supabase
      .from('comments')
      .select('id', { count: 'exact', head: true })
      .eq('author_id', userId);

    const commentsPoints = (commentsCount || 0) * weights.comment_points;

    // Get reactions count
    let userPostsForReactions: any[] = [];
    const { data: userPostsByAuthor } = await supabase
      .from('posts')
      .select('id')
      .eq('author_id', userId);
    
    if (!userPostsByAuthor || userPostsByAuthor.length === 0) {
      const { data: userPostsByUser } = await supabase
        .from('posts')
        .select('id')
        .eq('user_id', userId);
      userPostsForReactions = userPostsByUser || [];
    } else {
      userPostsForReactions = userPostsByAuthor || [];
    }

    let reactionsPoints = 0;
    if (userPostsForReactions.length > 0) {
      const postIds = userPostsForReactions.map(p => p.id);
      const { count: reactionsCount } = await supabase
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

    // Update sw_scores table if it exists
    try {
      await supabase
        .from('sw_scores')
        .upsert({
          user_id: userId,
          total: totalSW,
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
      totalSW,
      message: 'SW recalculated successfully',
    });
  } catch (error: any) {
    console.error('sw/recalculate error:', error);
    return res.status(500).json({ error: error.message });
  }
}

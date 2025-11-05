import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabaseServer';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = supabaseAdmin();

  // Get current user from session
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let userId: string | undefined;

  try {
    const token = authHeader.replace('Bearer ', '');
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !authUser) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    userId = authUser.id;
  } catch (authErr: any) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    const oneDayAgoISO = oneDayAgo.toISOString();

    // Get posts count in last 24 hours
    // Try both user_id and author_id fields
    let postsCount = 0;
    try {
      // Try user_id first
      let { count, error } = await supabase
        .from('posts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', oneDayAgoISO);
      
      if (error) {
        // Try author_id if user_id doesn't exist
        const result = await supabase
          .from('posts')
          .select('id', { count: 'exact', head: true })
          .eq('author_id', userId)
          .gte('created_at', oneDayAgoISO);
        count = result.count;
        error = result.error;
      }
      
      if (!error && count !== null) {
        postsCount = count;
      }
    } catch (err) {
      console.warn('Error fetching recent posts:', err);
    }

    // Get comments count in last 24 hours
    // Try both user_id and author_id fields
    let commentsCount = 0;
    try {
      // Try user_id first
      let { count, error } = await supabase
        .from('comments')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', oneDayAgoISO);
      
      if (error) {
        // Try author_id if user_id doesn't exist
        const result = await supabase
          .from('comments')
          .select('id', { count: 'exact', head: true })
          .eq('author_id', userId)
          .gte('created_at', oneDayAgoISO);
        count = result.count;
        error = result.error;
      }
      
      if (!error && count !== null) {
        commentsCount = count;
      }
    } catch (err) {
      console.warn('Error fetching recent comments:', err);
    }

    // Get reactions received on user's posts in last 24 hours
    let reactionsCount = 0;
    try {
      // First get user's posts - try both user_id and author_id
      let { data: userPosts, error: postsError } = await supabase
        .from('posts')
        .select('id')
        .eq('user_id', userId);

      if (postsError) {
        // Try author_id if user_id doesn't exist
        const result = await supabase
          .from('posts')
          .select('id')
          .eq('author_id', userId);
        userPosts = result.data;
        postsError = result.error;
      }

      if (!postsError && userPosts && userPosts.length > 0) {
        const postIds = userPosts.map(p => p.id);
        const { count, error } = await supabase
          .from('post_reactions')
          .select('post_id', { count: 'exact', head: true })
          .in('post_id', postIds)
          .gte('created_at', oneDayAgoISO);
        
        if (!error && count !== null) {
          reactionsCount = count;
        }
      }
    } catch (err) {
      console.warn('Error fetching recent reactions:', err);
    }

    // Get invites count in last 24 hours
    let invitesCount = 0;
    try {
      const { count, error } = await supabase
        .from('invites')
        .select('id', { count: 'exact', head: true })
        .eq('inviter_user_id', userId)
        .eq('status', 'accepted')
        .gte('accepted_at', oneDayAgoISO);
      
      if (!error && count !== null) {
        invitesCount = count;
      }
    } catch (err) {
      console.warn('Error fetching recent invites:', err);
    }

    // Check if profile is complete
    let profileComplete = false;
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('username, full_name, bio, country, avatar_url')
        .eq('user_id', userId)
        .single();
      
      if (!error && profile) {
        const hasUsername = profile.username && profile.username.trim() !== '';
        const hasFullName = profile.full_name && profile.full_name.trim() !== '';
        const hasBio = profile.bio && profile.bio.trim() !== '';
        const hasCountry = profile.country && profile.country.trim() !== '';
        const hasAvatar = profile.avatar_url && profile.avatar_url.trim() !== '';
        
        profileComplete = hasUsername && hasFullName && hasBio && hasCountry && hasAvatar;
      }
    } catch (err) {
      console.warn('Error checking profile completion:', err);
    }

    return res.status(200).json({
      profileComplete,
      postsCount,
      commentsCount,
      reactionsCount,
      invitesCount,
    });
  } catch (error: any) {
    console.error('sw/recent-activity error:', error);
    return res.status(500).json({ 
      error: error?.message || 'Unknown error occurred',
    });
  }
}

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
    // Get user's city from profile
    const { data: userProfile, error: profileError } = await supabase
      .from('profiles')
      .select('country, city')
      .eq('user_id', userId)
      .single();

    if (profileError || !userProfile) {
      return res.status(200).json({ leaders: [] });
    }

    const userCity = userProfile.city;
    const userCountry = userProfile.country;

    if (!userCity && !userCountry) {
      return res.status(200).json({ leaders: [] });
    }

    // First, get profiles by city/country
    let profilesQuery = supabase
      .from('profiles')
      .select('user_id, username, full_name, avatar_url, city, country')
      .limit(100);

    // Filter by city if available, otherwise by country
    if (userCity) {
      profilesQuery = profilesQuery.eq('city', userCity);
    } else if (userCountry) {
      profilesQuery = profilesQuery.eq('country', userCountry);
    }

    const { data: profilesData, error: profilesError } = await profilesQuery;

    if (profilesError || !profilesData || profilesData.length === 0) {
      return res.status(200).json({ leaders: [] });
    }

    // Filter out current user and get user IDs
    const userIds = profilesData
      .filter((p: any) => p.user_id !== userId)
      .map((p: any) => p.user_id);

    if (userIds.length === 0) {
      return res.status(200).json({ leaders: [] });
    }

    // Get SW scores for these users
    const { data: swScoresData, error: swScoresError } = await supabase
      .from('sw_scores')
      .select('user_id, total')
      .in('user_id', userIds)
      .order('total', { ascending: false })
      .limit(6);

    if (swScoresError || !swScoresData) {
      return res.status(200).json({ leaders: [] });
    }

    // Create a map of profiles by user_id
    const profilesMap = new Map();
    profilesData.forEach((p: any) => {
      profilesMap.set(p.user_id, p);
    });

    // Format the response
    const leaders = swScoresData
      .slice(0, 5) // Limit to 5 leaders
      .map((item: any) => {
        const profile = profilesMap.get(item.user_id);
        return {
          userId: item.user_id,
          sw: item.total || 0,
          username: profile?.username || null,
          fullName: profile?.full_name || null,
          avatarUrl: profile?.avatar_url || null,
          city: profile?.city || null,
          country: profile?.country || null,
        };
      });

    return res.status(200).json({ leaders });
  } catch (error: any) {
    console.error('sw/city-leaders error:', error);
    return res.status(500).json({ 
      error: error?.message || 'Unknown error occurred',
    });
  }
}

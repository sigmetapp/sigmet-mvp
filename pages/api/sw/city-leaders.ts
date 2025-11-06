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
    // Helper function to parse city and country from combined string
    // Format: "city, country" or just "country"
    function parseCityCountry(value?: string | null): { city?: string; country?: string } {
      if (!value) return {};
      const parts = value.split(',').map((p) => p.trim()).filter(Boolean);
      if (parts.length === 0) return {};
      if (parts.length === 1) return { country: parts[0] };
      return { city: parts.slice(0, -1).join(', '), country: parts[parts.length - 1] };
    }

    // Get user's city and country from profile
    const { data: userProfile, error: profileError } = await supabase
      .from('profiles')
      .select('country')
      .eq('user_id', userId)
      .single();

    if (profileError || !userProfile || !userProfile.country) {
      return res.status(200).json({ leaders: [] });
    }

    const { city: userCity, country: userCountry } = parseCityCountry(userProfile.country);

    if (!userCity && !userCountry) {
      return res.status(200).json({ leaders: [] });
    }

    // Get all profiles with country field
    const { data: allProfiles, error: profilesError } = await supabase
      .from('profiles')
      .select('user_id, username, full_name, avatar_url, country')
      .not('country', 'is', null)
      .limit(100);

    if (profilesError || !allProfiles || allProfiles.length === 0) {
      return res.status(200).json({ leaders: [] });
    }

    // Filter profiles by matching city and country
    // If user has city, match by city and country
    // If user only has country, match by country
    const matchingProfiles = allProfiles
      .filter((p: any) => {
        if (p.user_id === userId) return false; // Exclude current user
        
        const { city: profileCity, country: profileCountry } = parseCityCountry(p.country);
        
        if (userCity && userCountry) {
          // Match by both city and country
          return profileCity === userCity && profileCountry === userCountry;
        } else if (userCountry) {
          // Match by country only
          return profileCountry === userCountry;
        }
        return false;
      });

    if (matchingProfiles.length === 0) {
      return res.status(200).json({ leaders: [] });
    }

    // Get user IDs
    const userIds = matchingProfiles.map((p: any) => p.user_id);

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
    matchingProfiles.forEach((p: any) => {
      profilesMap.set(p.user_id, p);
    });

    // Format the response
    const leaders = swScoresData
      .slice(0, 5) // Limit to 5 leaders
      .map((item: any) => {
        const profile = profilesMap.get(item.user_id);
        const { city, country } = parseCityCountry(profile?.country);
        return {
          userId: item.user_id,
          sw: item.total || 0,
          username: profile?.username || null,
          fullName: profile?.full_name || null,
          avatarUrl: profile?.avatar_url || null,
          city: city || null,
          country: country || null,
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

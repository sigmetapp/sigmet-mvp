import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabaseServer';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { q, limit = '10' } = req.query;
  const query = (q as string)?.trim();

  if (!query || query.length < 2) {
    return res.status(200).json({
      people: [],
      posts: [],
      cities: [],
      countries: [],
    });
  }

  const searchLimit = Math.min(parseInt(limit as string, 10), 50);
  const searchPattern = `%${query}%`;

  try {
    const supabase = supabaseAdmin();

    // Search people (username, full_name)
    // Search username and full_name separately, then combine results
    const { data: usernameResults, error: usernameError } = await supabase
      .from('profiles')
      .select('user_id, username, full_name, avatar_url, country')
      .ilike('username', searchPattern)
      .limit(searchLimit);

    const { data: fullNameResults, error: fullNameError } = await supabase
      .from('profiles')
      .select('user_id, username, full_name, avatar_url, country')
      .ilike('full_name', searchPattern)
      .limit(searchLimit);

    // Combine and deduplicate results
    const peopleMap = new Map();
    if (usernameResults) {
      usernameResults.forEach((p) => peopleMap.set(p.user_id, p));
    }
    if (fullNameResults) {
      fullNameResults.forEach((p) => peopleMap.set(p.user_id, p));
    }
    const people = Array.from(peopleMap.values()).slice(0, searchLimit);
    const peopleError = usernameError || fullNameError;

    if (peopleError) {
      console.error('Error searching people:', peopleError);
    }

    // Search posts (content)
    const { data: postsData, error: postsError } = await supabase
      .from('posts')
      .select('id, text, author_id, created_at')
      .ilike('text', searchPattern)
      .order('created_at', { ascending: false })
      .limit(searchLimit);

    if (postsError) {
      console.error('Error searching posts:', postsError);
    }

    // Fetch profiles for post authors
    let posts = postsData || [];
    if (posts.length > 0) {
      const authorIds = [...new Set(posts.map((p) => p.author_id).filter(Boolean))];
      const { data: authorProfiles } = await supabase
        .from('profiles')
        .select('user_id, username, full_name, avatar_url')
        .in('user_id', authorIds);

      const profilesMap = new Map();
      if (authorProfiles) {
        authorProfiles.forEach((p) => profilesMap.set(p.user_id, p));
      }

      // Merge profiles with posts
      posts = posts.map((post) => ({
        ...post,
        profiles: profilesMap.get(post.author_id) || null,
      }));
    }

    // Search cities and countries (stored in country field as "City, Country")
    const { data: locations, error: locationsError } = await supabase
      .from('profiles')
      .select('country')
      .not('country', 'is', null)
      .ilike('country', searchPattern)
      .limit(100);

    if (locationsError) {
      console.error('Error searching locations:', locationsError);
    }

    // Extract unique cities and countries from location data
    const cityCountrySet = new Set<string>();
    const cityMap = new Map<string, number>();
    const countryMap = new Map<string, number>();

    if (locations) {
      for (const loc of locations) {
        if (!loc.country) continue;
        const parts = loc.country.split(',').map((p: string) => p.trim());
        if (parts.length >= 2) {
          const city = parts.slice(0, -1).join(', ');
          const country = parts[parts.length - 1];
          const key = `${city}|${country}`;
          if (!cityCountrySet.has(key)) {
            cityCountrySet.add(key);
            cityMap.set(city, (cityMap.get(city) || 0) + 1);
            countryMap.set(country, (countryMap.get(country) || 0) + 1);
          }
        } else if (parts.length === 1) {
          // Might be just a country
          countryMap.set(parts[0], (countryMap.get(parts[0]) || 0) + 1);
        }
      }
    }

    // Filter cities and countries that match the query
    const queryLower = query.toLowerCase();
    const cities = Array.from(cityMap.entries())
      .filter(([city]) => city.toLowerCase().includes(queryLower))
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => {
        const aStarts = a.city.toLowerCase().startsWith(queryLower) ? 0 : 1;
        const bStarts = b.city.toLowerCase().startsWith(queryLower) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        return b.count - a.count;
      })
      .slice(0, searchLimit);

    const countries = Array.from(countryMap.entries())
      .filter(([country]) => country.toLowerCase().includes(queryLower))
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => {
        const aStarts = a.country.toLowerCase().startsWith(queryLower) ? 0 : 1;
        const bStarts = b.country.toLowerCase().startsWith(queryLower) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        return b.count - a.count;
      })
      .slice(0, searchLimit);

    return res.status(200).json({
      people: people || [],
      posts: posts || [],
      cities: cities,
      countries: countries,
    });
  } catch (error) {
    console.error('Search error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

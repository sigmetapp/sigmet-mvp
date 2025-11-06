import type { NextApiRequest, NextApiResponse } from 'next';
import { Country, City } from 'country-state-city';

type CitySuggestion = {
  city: string;
  countryCode: string;
  country: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { query: searchQuery } = req.query;

  if (!searchQuery || typeof searchQuery !== 'string' || searchQuery.trim().length === 0) {
    return res.status(400).json({ error: 'Query is required' });
  }

  try {
    const query = searchQuery.trim().toLowerCase();
    
    // Get all countries for country name lookup
    const countries = Country.getAllCountries();
    const countryNameByIso = new Map<string, string>();
    for (const c of countries) {
      countryNameByIso.set(c.isoCode, c.name);
    }

    // Get all cities
    const allCities = City.getAllCities() || [];
    
    // Filter cities by query
    const seen = new Set<string>();
    const suggestions: CitySuggestion[] = [];
    
    for (const c of allCities) {
      const cityNameLower = c.name.toLowerCase();
      const countryName = countryNameByIso.get(c.countryCode) || c.countryCode;
      const countryNameLower = countryName.toLowerCase();
      
      // Check if query matches city name or country name
      if (cityNameLower.includes(query) || countryNameLower.includes(query)) {
        const key = `${c.name}-${c.countryCode}`;
        if (!seen.has(key)) {
          seen.add(key);
          suggestions.push({
            city: c.name,
            countryCode: c.countryCode,
            country: countryName,
          });
        }
      }
    }

    // Sort results: cities that start with query first, then alphabetically
    suggestions.sort((a, b) => {
      const aStarts = a.city.toLowerCase().startsWith(query) ? 0 : 1;
      const bStarts = b.city.toLowerCase().startsWith(query) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      return a.city.localeCompare(b.city);
    });

    // Return top 30 results
    return res.status(200).json({ results: suggestions.slice(0, 30) });
  } catch (error: any) {
    console.error('Error searching cities:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabaseServer';

type Institution = {
  id?: number;
  name: string;
  type: 'school' | 'college' | 'university';
  country?: string;
  city?: string;
  source?: 'local' | 'external';
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { query: searchQuery, type } = req.query;

  if (!searchQuery || typeof searchQuery !== 'string' || searchQuery.trim().length < 2) {
    return res.status(400).json({ error: 'Query must be at least 2 characters' });
  }

  const results: Institution[] = [];

  try {
    const supabase = supabaseAdmin();

    // 1. Search in local database first
    let localQuery = supabase
      .from('educational_institutions')
      .select('*')
      .ilike('name', `%${searchQuery.trim()}%`)
      .limit(20);

    if (type && typeof type === 'string' && ['school', 'college', 'university'].includes(type)) {
      localQuery = localQuery.eq('type', type);
    }

    const { data: localData, error: localError } = await localQuery;

    if (!localError && localData) {
      results.push(
        ...localData.map((inst) => ({
          id: inst.id,
          name: inst.name,
          type: inst.type,
          country: inst.country || undefined,
          city: inst.city || undefined,
          source: 'local' as const,
        }))
      );
    }

    // 2. Search external sources if not enough results
    if (results.length < 10) {
      const externalResults = await searchExternalSources(searchQuery.trim(), type as string);
      results.push(...externalResults);
    }

    // Remove duplicates by name and type
    const uniqueResults = Array.from(
      new Map(
        results.map((item) => [`${item.name.toLowerCase()}_${item.type}`, item])
      ).values()
    ).slice(0, 30);

    return res.status(200).json({ results: uniqueResults });
  } catch (error: any) {
    console.error('Error searching institutions:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

async function searchExternalSources(
  query: string,
  type?: string
): Promise<Institution[]> {
  const results: Institution[] = [];

  try {
    // Search in NCES/IPEDS (US institutions)
    // Note: This would require API access or CSV import. For now, we'll use a placeholder.
    // In production, you would:
    // 1. Import NCES data into your database, or
    // 2. Use NCES API if available, or
    // 3. Scrape/publicly available data

    // Search in European Data Portal
    // Similar approach needed for European institutions

    // For now, we'll return empty array as these sources require setup
    // In production, implement actual API calls or database queries to imported data

    // Example structure for future implementation:
    /*
    if (query && type) {
      // Search NCES for US colleges/universities
      if (type === 'college' || type === 'university') {
        const ncesResults = await searchNCES(query, type);
        results.push(...ncesResults);
      }

      // Search European universities
      if (type === 'university') {
        const euResults = await searchEuropeanUniversities(query);
        results.push(...euResults);
      }
    }
    */

    return results;
  } catch (error) {
    console.error('Error searching external sources:', error);
    return [];
  }
}

// Helper function for future NCES integration
async function searchNCES(query: string, type: string): Promise<Institution[]> {
  // This would implement actual NCES API call or database query
  // Example endpoint: https://api.data.gov/ed/collegescorecard/v1/schools
  // Requires API key from data.gov
  
  return [];
}

// Helper function for future European universities integration
async function searchEuropeanUniversities(query: string): Promise<Institution[]> {
  // This would implement European Data Portal API call or database query
  // Or query imported data from Universities of European Alliances CSV
  
  return [];
}

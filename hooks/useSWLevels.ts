import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { SW_LEVELS, type SWLevel } from '@/lib/swLevels';

const CACHE_KEY_SW_LEVELS = 'sw_levels_cache';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCachedLevels(): SWLevel[] | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY_SW_LEVELS);
    if (!cached) return null;
    const { data, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp > CACHE_TTL) {
      localStorage.removeItem(CACHE_KEY_SW_LEVELS);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function setCachedLevels(levels: SWLevel[]): void {
  try {
    localStorage.setItem(CACHE_KEY_SW_LEVELS, JSON.stringify({ data: levels, timestamp: Date.now() }));
  } catch {
    // Ignore localStorage errors
  }
}

export function useSWLevels(): SWLevel[] {
  const [swLevels, setSwLevels] = useState<SWLevel[]>(getCachedLevels() || SW_LEVELS);

  useEffect(() => {
    async function loadLevels() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          // Use default levels if not authenticated
          return;
        }

        const response = await fetch('/api/sw/weights', {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        });

        if (!response.ok) {
          // Use cached or default levels on error
          return;
        }

        const data = await response.json();
        
        // Load SW levels from weights if available
        if (data.sw_levels) {
          try {
            const levels = data.sw_levels;
            
            // Map levels to include features and colors from defaults
            const mappedLevels = levels.map((level: any, index: number) => {
              const defaultLevel = SW_LEVELS.find(l => l.name === level.name) || SW_LEVELS[index] || SW_LEVELS[0];
              return {
                name: level.name || defaultLevel.name,
                minSW: level.minSW ?? defaultLevel.minSW,
                maxSW: level.maxSW ?? defaultLevel.maxSW,
                features: defaultLevel.features,
                color: defaultLevel.color,
              };
            });
            
            if (mappedLevels.length > 0) {
              setSwLevels(mappedLevels);
              setCachedLevels(mappedLevels);
            }
          } catch (err) {
            console.error('Error parsing sw_levels:', err);
          }
        }
      } catch (error) {
        console.error('Error loading SW levels:', error);
        // Use cached or default levels on error
      }
    }

    loadLevels();
  }, []);

  return swLevels;
}

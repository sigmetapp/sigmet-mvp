"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import Button from '@/components/Button';
import SWSkeleton from '@/components/SWSkeleton';

type SWBreakdown = {
  registration: { points: number; count: number; weight: number };
  profileComplete: { points: number; count: number; weight: number };
  growth: { points: number; count: number; weight: number; description: string };
  followers: { points: number; count: number; weight: number };
  connections: { points: number; count: number; firstCount: number; repeatCount: number; firstWeight: number; repeatWeight: number };
  posts: { points: number; count: number; weight: number };
  comments: { points: number; count: number; weight: number };
  reactions: { points: number; count: number; weight: number };
  invites?: { points: number; count: number; weight: number };
  growthBonus?: { points: number; count: number; weight: number; description?: string };
};

type SWData = {
  totalSW: number;
  originalSW?: number;
  breakdown: SWBreakdown;
  weights: any;
  inflationRate?: number;
  cached?: boolean;
  cacheAge?: number;
  swLevels?: SWLevel[];
};

type SWLevel = {
  name: string;
  minSW: number;
  maxSW?: number;
  features: string[];
  color: string;
};

type LevelColorScheme = {
  text: string;
  bg: string;
  bgGradient: string;
  border: string;
  borderGlow: string;
  badgeBg: string;
  badgeBorder: string;
  checkmark: string;
  hex: string;
};

const LEVEL_COLOR_SCHEMES: Record<string, LevelColorScheme> = {
  'Beginner': {
    text: 'text-gray-400',
    bg: 'bg-gray-500/10',
    bgGradient: 'from-gray-500/15 to-gray-600/10',
    border: 'border-gray-400/30',
    borderGlow: 'shadow-[0_0_8px_rgba(156,163,175,0.3)]',
    badgeBg: 'bg-gray-500/20',
    badgeBorder: 'border-gray-400/40',
    checkmark: 'text-gray-400',
    hex: '#9ca3af'
  },
  'Growing': {
    text: 'text-blue-400',
    bg: 'bg-blue-500/10',
    bgGradient: 'from-blue-500/15 to-blue-600/10',
    border: 'border-blue-400/30',
    borderGlow: 'shadow-[0_0_8px_rgba(96,165,250,0.3)]',
    badgeBg: 'bg-blue-500/20',
    badgeBorder: 'border-blue-400/40',
    checkmark: 'text-blue-400',
    hex: '#60a5fa'
  },
  'Advance': {
    text: 'text-purple-400',
    bg: 'bg-purple-500/10',
    bgGradient: 'from-purple-500/15 to-purple-600/10',
    border: 'border-purple-400/30',
    borderGlow: 'shadow-[0_0_8px_rgba(167,139,250,0.3)]',
    badgeBg: 'bg-purple-500/20',
    badgeBorder: 'border-purple-400/40',
    checkmark: 'text-purple-400',
    hex: '#a78bfa'
  },
  'Expert': {
    text: 'text-yellow-400',
    bg: 'bg-yellow-500/10',
    bgGradient: 'from-yellow-500/15 to-yellow-600/10',
    border: 'border-yellow-400/30',
    borderGlow: 'shadow-[0_0_8px_rgba(251,191,36,0.3)]',
    badgeBg: 'bg-yellow-500/20',
    badgeBorder: 'border-yellow-400/40',
    checkmark: 'text-yellow-400',
    hex: '#fbbf24'
  },
  'Leader': {
    text: 'text-orange-400',
    bg: 'bg-orange-500/10',
    bgGradient: 'from-orange-500/15 to-orange-600/10',
    border: 'border-orange-400/30',
    borderGlow: 'shadow-[0_0_8px_rgba(251,146,60,0.3)]',
    badgeBg: 'bg-orange-500/20',
    badgeBorder: 'border-orange-400/40',
    checkmark: 'text-orange-400',
    hex: '#fb923c'
  },
  'Angel': {
    text: 'text-pink-400',
    bg: 'bg-pink-500/10',
    bgGradient: 'from-pink-500/15 to-pink-600/10',
    border: 'border-pink-400/30',
    borderGlow: 'shadow-[0_0_8px_rgba(244,114,182,0.3)]',
    badgeBg: 'bg-pink-500/20',
    badgeBorder: 'border-pink-400/40',
    checkmark: 'text-pink-400',
    hex: '#f472b6'
  }
};

const SW_LEVELS: SWLevel[] = [
  {
    name: 'Beginner',
    minSW: 0,
    maxSW: 100,
    features: [
      'View feed',
      'Post to feed',
      'Comment on materials',
      'Followers'
    ],
    color: 'text-gray-400'
  },
  {
    name: 'Growing',
    minSW: 100,
    maxSW: 500,
    features: [
      'Grow 8 panel',
      'Badge near nickname / Avatar frame',
      'Partial moderation of posts and comments',
      'Access to Trust Flow functionality',
      'White theme',
      'Connections functionality'
    ],
    color: 'text-blue-400'
  },
  {
    name: 'Advance',
    minSW: 500,
    maxSW: 2000,
    features: [
      'Create more than 20 posts per day',
      'Increased ranking priority (x2)',
      'Badge near nickname / Avatar frame',
      'Voting and challenges functionality',
      'Post and comment moderation'
    ],
    color: 'text-purple-400'
  },
  {
    name: 'Expert',
    minSW: 2000,
    maxSW: 10000,
    features: [
      'Increased ranking priority (x3)',
      'Badge near nickname / Avatar frame',
      'Display profile to followers and connections in separate block at top',
      'Soon....',
      'Soon....'
    ],
    color: 'text-yellow-400'
  },
  {
    name: 'Leader',
    minSW: 10000,
    maxSW: 50000,
    features: [
      'Soon....',
      'Soon....',
      'Soon....',
      'Soon....',
      'Soon....'
    ],
    color: 'text-orange-400'
  },
  {
    name: 'Angel',
    minSW: 50000,
    features: [
      'Soon....',
      'Soon....',
      'Soon....',
      'Soon....',
      'Soon....'
    ],
    color: 'text-pink-400'
  }
];

function getSWLevel(sw: number, levels: SWLevel[]): SWLevel {
  for (let i = levels.length - 1; i >= 0; i--) {
    if (sw >= levels[i].minSW) {
      return levels[i];
    }
  }
  return levels[0];
}

function getNextLevel(sw: number, levels: SWLevel[]): SWLevel | null {
  const currentLevel = getSWLevel(sw, levels);
  const currentIndex = levels.findIndex(level => level.name === currentLevel.name);
  if (currentIndex < levels.length - 1) {
    return levels[currentIndex + 1];
  }
  return null;
}

const CACHE_KEY_SW = 'sw_data_cache';
const CACHE_KEY_RECENT_ACTIVITY = 'sw_recent_activity_cache';
const CACHE_KEY_CITY_LEADERS = 'sw_city_leaders_cache';
const CACHE_KEY_ADMIN = 'sw_admin_cache';
const CACHE_TTL = 5 * 60 * 1000; // 5 минут

function getCachedData<T>(key: string): T | null {
  try {
    const cached = localStorage.getItem(key);
    if (!cached) return null;
    const { data, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp > CACHE_TTL) {
      localStorage.removeItem(key);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function setCachedData<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
  } catch {
    // Ignore localStorage errors
  }
}

export default function SWPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [swData, setSwData] = useState<SWData | null>(getCachedData<SWData>(CACHE_KEY_SW));
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | undefined>();
  const [activeTab, setActiveTab] = useState<'overview' | 'factors' | 'levels' | 'breakdown'>('overview');
  const [isAdmin, setIsAdmin] = useState<boolean | null>(getCachedData<boolean>(CACHE_KEY_ADMIN));
  const [recentActivity, setRecentActivity] = useState<{
    profileComplete: boolean;
    postsCount: number;
    commentsCount: number;
    reactionsCount: number;
    invitesCount: number;
    totalAcceptedInvites?: number;
    followersCount: number;
    connectionsCount: number;
  } | null>(getCachedData(CACHE_KEY_RECENT_ACTIVITY));
  const [swLevels, setSwLevels] = useState<SWLevel[]>(SW_LEVELS); // Start with default levels
  const [cityLeaders, setCityLeaders] = useState<Array<{
    userId: string;
    sw: number;
    username: string | null;
    fullName: string | null;
    avatarUrl: string | null;
    city: string | null;
    country: string | null;
  }>>(getCachedData(CACHE_KEY_CITY_LEADERS) || []);
  const [swGrowth, setSwGrowth] = useState<{
    growth24h: number;
    growth7d: number;
  } | null>(null);

  useEffect(() => {
    // Если есть кэшированные данные, показываем их сразу
    const hasCachedData = swData || isAdmin !== null;
    if (hasCachedData) {
      setLoading(false);
    }

    // Оптимизированная загрузка: получаем auth данные один раз и загружаем все параллельно
    async function loadAllData() {
      try {
        // Получаем auth данные один раз
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setLoading(false);
          return;
        }

        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;
        if (!token) {
          setError('Not authenticated');
          setLoading(false);
          return;
        }

        // Загружаем все данные параллельно
        const [swDataResult, recentActivityData, cityLeadersData, adminData, growthData] = await Promise.allSettled([
          // Основные данные SW
          fetch('/api/sw/calculate', {
            headers: { 'Authorization': `Bearer ${token}` },
          }).then(res => {
            if (!res.ok) throw new Error('Failed to load SW data');
            return res.json();
          }),
          // Недавняя активность
          fetch('/api/sw/recent-activity', {
            headers: { 'Authorization': `Bearer ${token}` },
          }).then(res => res.ok ? res.json() : null),
          // Лидеры города
          fetch('/api/sw/city-leaders', {
            headers: { 'Authorization': `Bearer ${token}` },
          }).then(res => res.ok ? res.json() : null),
          // Проверка админа
          supabase.rpc('is_admin_uid').then(({ data, error }) => {
            if (error) throw error;
            return data ?? false;
          }),
          // SW Growth data
          fetch('/api/sw/growth', {
            headers: { 'Authorization': `Bearer ${token}` },
          }).then(res => res.ok ? res.json() : null),
        ]);

        // Обрабатываем результаты и кэшируем
        if (swDataResult.status === 'fulfilled') {
          const data = swDataResult.value;
          setSwData(data);
          setCachedData(CACHE_KEY_SW, data);
          
          // Load SW levels from weights if available
          if (data.weights?.sw_levels) {
            try {
              const levels = typeof data.weights.sw_levels === 'string' 
                ? JSON.parse(data.weights.sw_levels)
                : data.weights.sw_levels;
              
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
              }
            } catch (err) {
              console.error('Error parsing sw_levels:', err);
            }
          }
          setError(null);
        } else {
          setError(swDataResult.reason?.message || 'Failed to load SW data');
        }

        if (recentActivityData.status === 'fulfilled' && recentActivityData.value) {
          setRecentActivity(recentActivityData.value);
          setCachedData(CACHE_KEY_RECENT_ACTIVITY, recentActivityData.value);
        }

        if (cityLeadersData.status === 'fulfilled' && cityLeadersData.value) {
          const leaders = cityLeadersData.value.leaders || [];
          setCityLeaders(leaders);
          setCachedData(CACHE_KEY_CITY_LEADERS, leaders);
        }

        if (adminData.status === 'fulfilled') {
          setIsAdmin(adminData.value);
          setCachedData(CACHE_KEY_ADMIN, adminData.value);
        } else {
          setIsAdmin(false);
          setCachedData(CACHE_KEY_ADMIN, false);
        }

        if (growthData.status === 'fulfilled' && growthData.value) {
          setSwGrowth(growthData.value);
        }

        setLoading(false);
      } catch (error: any) {
        console.error('Error loading data:', error);
        setError(error.message || 'Failed to load data');
        setLoading(false);
      }
    }

    loadAllData();
  }, []);

  async function loadRecentActivity() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) return;

      const response = await fetch('/api/sw/recent-activity', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setRecentActivity(data);
      }
    } catch (error: any) {
      console.error('Error loading recent activity:', error);
    }
  }

  async function loadCityLeaders() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) return;

      const response = await fetch('/api/sw/city-leaders', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setCityLeaders(data.leaders || []);
      }
    } catch (error: any) {
      console.error('Error loading city leaders:', error);
    }
  }

  async function checkAdmin() {
    try {
      const { data, error } = await supabase.rpc('is_admin_uid');
      if (error) {
        console.error('Error checking admin:', error);
        setIsAdmin(false);
      } else {
        setIsAdmin(data ?? false);
      }
    } catch (err) {
      console.error('Error checking admin:', err);
      setIsAdmin(false);
    }
  }

  async function loadSW() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) {
        setError('Not authenticated');
        setLoading(false);
        return;
      }

      const response = await fetch('/api/sw/calculate', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        setError(error.error || 'Failed to load SW data');
        setLoading(false);
        return;
      }

      const data = await response.json();
      setSwData(data);
      
      // Load SW levels from weights if available
      if (data.weights?.sw_levels) {
        try {
          const levels = typeof data.weights.sw_levels === 'string' 
            ? JSON.parse(data.weights.sw_levels)
            : data.weights.sw_levels;
          
          // Map levels to include features (if not in DB, use defaults)
          const mappedLevels = levels.map((level: any, index: number) => {
            const defaultLevel = SW_LEVELS.find(l => l.name === level.name) || SW_LEVELS[index] || SW_LEVELS[0];
            return {
              name: level.name || defaultLevel.name,
              minSW: level.minSW ?? defaultLevel.minSW,
              maxSW: level.maxSW ?? defaultLevel.maxSW,
              features: defaultLevel.features, // Keep features from defaults for now
              color: defaultLevel.color,
            };
          });
          
          if (mappedLevels.length > 0) {
            setSwLevels(mappedLevels);
          }
        } catch (err) {
          console.error('Error parsing sw_levels:', err);
        }
      }
      
      setLoading(false);
      setError(null);
    } catch (error: any) {
      console.error('Error loading SW:', error);
      setError(error.message || 'Failed to load SW data');
      setLoading(false);
    }
  }

  async function recalculateSW() {
    setRecalculating(true);
    setNote(undefined);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) {
        setNote('Not authenticated');
        setRecalculating(false);
        return;
      }

      const response = await fetch('/api/sw/recalculate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ user_id: user.id }),
      });

      if (!response.ok) {
        const error = await response.json();
        setNote(error.error || 'Failed to recalculate SW');
        setRecalculating(false);
        return;
      }

      const data = await response.json();
      setNote(data.message || 'SW recalculated successfully');
      
      // Reload SW data
      await loadSW();
    } catch (error: any) {
      console.error('Error recalculating SW:', error);
      setNote(error.message || 'Failed to recalculate SW');
    } finally {
      setRecalculating(false);
    }
  }

  // Показываем скелетон только если нет кэшированных данных
  if (loading && !swData && isAdmin === null) {
    return <SWSkeleton />;
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6 md:p-6">
        <div className="text-red-400">{error}</div>
      </div>
    );
  }

  if (!swData) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6 md:p-6">
        <div className="text-white/70">No SW data available</div>
      </div>
    );
  }

  const { totalSW, breakdown, inflationRate, originalSW, cached, cacheAge } = swData;
  const currentLevel = getSWLevel(totalSW, swLevels);
  const nextLevel = getNextLevel(totalSW, swLevels);
  const progressToNext = nextLevel ? ((totalSW - currentLevel.minSW) / (nextLevel.minSW - currentLevel.minSW)) * 100 : 100;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white mb-1">Social Weight (SW)</h1>
          <p className="text-white/70 text-sm mt-2">
            Your Social Weight reflects your activity and engagement in the social network.
          </p>
        </div>
        {isAdmin && (
          <Button
            onClick={recalculateSW}
            variant="secondary"
            disabled={recalculating || loading}
          >
            {recalculating ? 'Recalculating...' : 'Recalculate SW'}
          </Button>
        )}
      </div>

      {note && (
        <div className="card p-3 bg-white/5">
          <div className="text-white/80 text-sm">{note}</div>
        </div>
      )}

      {/* Cache indicator */}
      {cached && (
        <div className="card p-3 bg-blue-500/10 border border-blue-500/20">
          <div className="text-blue-300 text-sm">
            ⚡ Data loaded from cache (updated {cacheAge} seconds ago). Updates occur every 5 minutes.
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-white/10">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'overview'
              ? 'text-white border-b-2 border-primary-blue'
              : 'text-white/60 hover:text-white/80'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('factors')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'factors'
              ? 'text-white border-b-2 border-primary-blue'
              : 'text-white/60 hover:text-white/80'
          }`}
        >
          How to Increase SW
        </button>
        <button
          onClick={() => setActiveTab('levels')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'levels'
              ? 'text-white border-b-2 border-primary-blue'
              : 'text-white/60 hover:text-white/80'
          }`}
        >
          Levels & Features
        </button>
        {isAdmin && (
          <button
            onClick={() => setActiveTab('breakdown')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'breakdown'
                ? 'text-white border-b-2 border-primary-blue'
                : 'text-white/60 hover:text-white/80'
            }`}
          >
            Breakdown (Admin)
          </button>
        )}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {/* Total SW and Current Level - Side by Side */}
          <div className="flex flex-col md:flex-row gap-4">
            {/* Total SW - 1/3 width */}
            {(() => {
              const currentColorScheme = LEVEL_COLOR_SCHEMES[currentLevel.name] || LEVEL_COLOR_SCHEMES['Beginner'];
              return (
                <div className={`card p-6 border-2 ${currentColorScheme.border} ${currentColorScheme.borderGlow} w-full md:w-1/3`}>
                  <div className="text-center w-full">
                    <div className="text-white/60 text-sm mb-2">Your Social Weight</div>
                    <div className="text-5xl font-bold text-white mb-2">{totalSW.toLocaleString()}</div>
                    {originalSW && originalSW !== totalSW && (
                      <div className="text-white/50 text-xs mb-2">
                        Original SW: {originalSW.toLocaleString()} (inflation: {((1 - (inflationRate || 1)) * 100).toFixed(2)}%)
                      </div>
                    )}
                    <div className="text-white/60 text-sm mb-3">Total Points</div>
                    {swGrowth && (
                      <div className="flex flex-col gap-3 mt-4 pt-4 border-t border-white/10">
                        <div className="text-center">
                          <div className="text-white/50 text-xs mb-1">Last 24 hours</div>
                          <div className={`text-sm font-semibold ${swGrowth.growth24h >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {swGrowth.growth24h >= 0 ? '+' : ''}{swGrowth.growth24h.toLocaleString()}
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-white/50 text-xs mb-1">Last 7 days</div>
                          <div className={`text-sm font-semibold ${swGrowth.growth7d >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {swGrowth.growth7d >= 0 ? '+' : ''}{swGrowth.growth7d.toLocaleString()}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Current Level - 2/3 width */}
            {(() => {
              const currentColorScheme = LEVEL_COLOR_SCHEMES[currentLevel.name] || LEVEL_COLOR_SCHEMES['Beginner'];
              return (
                <div className={`card p-4 border-2 ${currentColorScheme.border} bg-gradient-to-br ${currentColorScheme.bgGradient} ${currentColorScheme.borderGlow} w-full md:w-2/3`}>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="text-white/60 text-sm mb-1">Current Level</div>
                      <div className={`text-2xl font-bold ${currentColorScheme.text} flex items-center gap-2`}>
                        <span>{currentLevel.name}</span>
                        <span className="text-lg animate-pulse">✨</span>
                      </div>
                    </div>
                    {nextLevel && (
                      <div className="text-right">
                        <div className="text-white/60 text-sm mb-1">Next Level</div>
                        {(() => {
                          const nextLevelObj = getSWLevel(nextLevel.minSW, swLevels);
                          const nextColorScheme = LEVEL_COLOR_SCHEMES[nextLevelObj.name] || LEVEL_COLOR_SCHEMES['Beginner'];
                          return (
                            <>
                              <div className={`text-xl font-semibold ${nextColorScheme.text} flex items-center gap-2 justify-end`}>
                                <span>{nextLevel.name}</span>
                                <span className="text-sm">🚀</span>
                              </div>
                              <div className={`text-sm font-medium mt-1 ${currentColorScheme.text}`}>
                                {nextLevel.minSW - totalSW} points to next level
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                  {nextLevel && (
                    <div className="relative w-full bg-white/10 rounded-full h-3 overflow-hidden">
                      <div
                        className="h-3 rounded-full transition-all duration-500 ease-out relative"
                        style={{ 
                          width: `${Math.min(100, Math.max(0, progressToNext))}%`,
                          backgroundColor: currentColorScheme.hex,
                          boxShadow: `0 0 10px ${currentColorScheme.hex}40`
                        }}
                      >
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"></div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Inflation Indicator */}
          {inflationRate && inflationRate < 1 && (
            <div className="card p-4 bg-yellow-500/10 border border-yellow-500/20">
              <div className="flex items-start gap-3">
                <div className="text-yellow-400 text-xl">⚠️</div>
                <div className="flex-1">
                  <div className="text-yellow-300 font-medium mb-1">SW Inflation</div>
                  <div className="text-white/70 text-sm">
                    Your SW is decreasing by {((1 - inflationRate) * 100).toFixed(2)}% due to:
                    <ul className="list-disc list-inside mt-2 space-y-1">
                      <li>Time elapsed since registration</li>
                      <li>Growth in the number of users in the network</li>
                    </ul>
                    <div className="mt-2 text-xs text-white/60">
                      To maintain SW, you need to constantly increase your activity.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* City Leaders */}
          <div className="card p-4">
            <h3 className="text-lg font-semibold text-white mb-4">🏆 City Leaders</h3>
            {cityLeaders.length > 0 ? (
              <div className="space-y-3">
                {cityLeaders.map((leader, index) => {
                  const displayName = leader.fullName || leader.username || leader.userId.slice(0, 8);
                  const username = leader.username || leader.userId.slice(0, 8);
                  const profileUrl = leader.username ? `/u/${leader.username}` : `/u/${leader.userId}`;
                  const avatarFallback = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='100%' height='100%' fill='%23222'/><circle cx='32' cy='24' r='14' fill='%23555'/><rect x='12' y='44' width='40' height='12' rx='6' fill='%23555'/></svg>";
                  
                  return (
                    <Link
                      key={leader.userId}
                      href={profileUrl}
                      className={`flex items-center gap-3 p-3 rounded-lg border border-white/10 hover:bg-white/5 transition-colors`}
                    >
                      <div className="flex-shrink-0 w-8 text-center">
                        <span className="text-white/60 text-sm font-semibold">#{index + 1}</span>
                      </div>
                      <div className="flex-shrink-0">
                        <img
                          src={leader.avatarUrl || avatarFallback}
                          alt={displayName}
                          className="h-12 w-12 rounded-full object-cover border border-white/10"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-white font-medium truncate">{displayName}</div>
                        <div className="text-white/60 text-sm truncate">@{username}</div>
                        {leader.city && (
                          <div className="text-white/50 text-xs mt-1">{leader.city}</div>
                        )}
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <div className="text-white font-semibold">{leader.sw.toLocaleString()}</div>
                        <div className="text-white/60 text-xs">SW</div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="text-white/60 text-sm py-4">
                No city leaders found. Complete your profile with city information to see local leaders.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Factors Tab */}
      {activeTab === 'factors' && (
        <div className="space-y-4">
          {(() => {
            const currentColorScheme = LEVEL_COLOR_SCHEMES[currentLevel.name] || LEVEL_COLOR_SCHEMES['Beginner'];
            return (
              <div className={`card p-4 border-2 ${currentColorScheme.border} ${currentColorScheme.borderGlow}`}>
                <h2 className="text-lg font-semibold text-white mb-4">How to Increase Your SW</h2>
            <div className="space-y-4">
              {/* Profile Complete - Single action */}
              <div className="flex items-start justify-between p-3 rounded-lg bg-white/5">
                <div className="flex-1">
                  <div className="text-white font-medium mb-2">1. Complete Your Profile</div>
                  <div className="text-white/70 text-sm">
                    Fill in all profile fields (name, bio, country, avatar) - this will give you additional points.
                  </div>
                </div>
                <div className="ml-4 flex items-center">
                  {recentActivity?.profileComplete ? (
                    <span className="text-green-400 text-xl">✓</span>
                  ) : (
                    <span className="text-white/30 text-xl">○</span>
                  )}
                </div>
              </div>

              {/* Growth Directions - Single action (but can have multiple tasks) */}
              <div className="flex items-start justify-between p-3 rounded-lg bg-white/5">
                <div className="flex-1">
                  <div className="text-white font-medium mb-2">2. Complete Growth Directions Tasks</div>
                  <div className="text-white/70 text-sm">
                    Complete tasks from growth directions - this is the main source of SW points.
                  </div>
                </div>
                <div className="ml-4 flex items-center">
                  <Button
                    onClick={() => router.push('/growth-directions')}
                    variant="primary"
                    size="sm"
                  >
                    Go to Growth Directions
                  </Button>
                </div>
              </div>

              {/* Posts - Repeatable action */}
              <div className="flex items-start justify-between p-3 rounded-lg bg-white/5">
                <div className="flex-1">
                  <div className="text-white font-medium mb-2">3. Publish Posts</div>
                  <div className="text-white/70 text-sm">
                    Each published post adds points to your SW.
                  </div>
                </div>
                <div className="ml-4 flex flex-col items-end">
                  <span className="text-white/70 text-sm font-medium">
                    {recentActivity ? `${recentActivity.postsCount} today` : '...'}
                  </span>
                  {recentActivity && (
                    <span className="text-blue-400 text-sm font-medium mt-1 underline">
                      We recommend 5
                    </span>
                  )}
                </div>
              </div>

              {/* Comments - Repeatable action */}
              <div className="flex items-start justify-between p-3 rounded-lg bg-white/5">
                <div className="flex-1">
                  <div className="text-white font-medium mb-2">4. Comment</div>
                  <div className="text-white/70 text-sm">
                    Actively commenting on other users' posts increases your SW.
                  </div>
                </div>
                <div className="ml-4 flex flex-col items-end">
                  <span className="text-white/70 text-sm font-medium">
                    {recentActivity ? `${recentActivity.commentsCount} today` : '...'}
                  </span>
                  {recentActivity && (
                    <span className="text-blue-400 text-sm font-medium mt-1 underline">
                      We recommend 10
                    </span>
                  )}
                </div>
              </div>

              {/* Connections - Single action (but can have multiple connections) */}
              <div className="flex items-start justify-between p-3 rounded-lg bg-white/5">
                <div className="flex-1">
                  <div className="text-white font-medium mb-2">5. Create Connections</div>
                  <div className="text-white/70 text-sm">
                    Mutual mentions in posts create connections that give additional points.
                  </div>
                </div>
                <div className="ml-4 flex items-center">
                  <span className="text-white/70 text-sm font-medium">
                    {recentActivity ? `${recentActivity.connectionsCount} today` : '...'}
                  </span>
                </div>
              </div>

              {/* Followers - Single action (but can have multiple followers) */}
              <div className="flex items-start justify-between p-3 rounded-lg bg-white/5">
                <div className="flex-1">
                  <div className="text-white font-medium mb-2">6. Attract Followers</div>
                  <div className="text-white/70 text-sm">
                    The more followers you have, the higher your SW.
                  </div>
                </div>
                <div className="ml-4 flex items-center">
                  <span className="text-white/70 text-sm font-medium">
                    {recentActivity ? `${recentActivity.followersCount} today` : '...'}
                  </span>
                </div>
              </div>

              {/* Reactions - Repeatable action */}
              <div className="flex items-start justify-between p-3 rounded-lg bg-white/5">
                <div className="flex-1">
                  <div className="text-white font-medium mb-2">7. Get Reactions</div>
                  <div className="text-white/70 text-sm">
                    Reactions on your posts increase your SW.
                  </div>
                </div>
                <div className="ml-4 flex flex-col items-end">
                  <span className="text-white/70 text-sm font-medium">
                    {recentActivity ? `${recentActivity.reactionsCount} today` : '...'}
                  </span>
                  {recentActivity && (
                    <span className="text-blue-400 text-sm font-medium mt-1 underline">
                      We recommend 10
                    </span>
                  )}
                </div>
              </div>

              {/* Invites - Repeatable action */}
              <div className="flex items-start justify-between p-3 rounded-lg bg-white/5">
                <div className="flex-1">
                  <div className="text-white font-medium mb-2">8. Invite Friends</div>
                  <div className="text-white/70 text-sm">
                    Invite friends via invite codes. Each invited friend gives you points.
                  </div>
                </div>
                <div className="ml-4 flex items-center">
                  <span className="text-white/70 text-sm font-medium">
                    {recentActivity && recentActivity.totalAcceptedInvites !== undefined
                      ? `Invite ${Math.max(0, 5 - recentActivity.totalAcceptedInvites)}/5`
                      : '...'}
                  </span>
                </div>
              </div>
            </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Levels Tab */}
      {activeTab === 'levels' && (
        <div className="space-y-3">
          <div className="card p-3">
            <h2 className="text-xl font-semibold text-white mb-4">SW Levels & Features</h2>
            <div className="space-y-2">
              {swLevels.map((level, index) => {
                const isCurrent = currentLevel.name === level.name;
                const isUnlocked = totalSW >= level.minSW;
                const colorScheme = LEVEL_COLOR_SCHEMES[level.name] || LEVEL_COLOR_SCHEMES['Beginner'];
                
                return (
                  <div
                    key={level.name}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      isCurrent
                        ? `${colorScheme.border} ${colorScheme.bgGradient ? `bg-gradient-to-br ${colorScheme.bgGradient}` : colorScheme.bg} ${colorScheme.borderGlow}`
                        : isUnlocked
                        ? `${colorScheme.border} ${colorScheme.bg} opacity-80`
                        : `${colorScheme.border} ${colorScheme.bg} opacity-40`
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className={`text-xl font-bold ${colorScheme.text}`}>
                        {level.name}
                        {isCurrent && <span className={`ml-2 text-sm ${colorScheme.text} opacity-80`}>(Current)</span>}
                      </div>
                      <div className={`px-3 py-1.5 rounded-full ${colorScheme.badgeBg} border ${colorScheme.badgeBorder}`}>
                        <span className={`${colorScheme.text} font-semibold text-base`}>
                          {level.maxSW ? `${level.minSW.toLocaleString()} - ${level.maxSW.toLocaleString()} pts` : `${level.minSW.toLocaleString()}+ pts`}
                        </span>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      {level.features.map((feature, featureIndex) => (
                        <div key={featureIndex} className="flex items-start gap-2">
                          <span className={`${colorScheme.checkmark} mt-0.5 text-sm`}>✓</span>
                          <span className={`text-sm ${isUnlocked ? 'text-white/80' : 'text-white/50'}`}>
                            {feature}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Breakdown Tab (Admin only) */}
      {activeTab === 'breakdown' && isAdmin && (
        <div className="space-y-4">
          <div className="card p-4 space-y-2">
            <h2 className="text-lg font-semibold text-white mb-2">SW Breakdown (Detailed Calculation)</h2>
            
            <div className="space-y-2">
              {/* Registration */}
              <div className="flex items-center justify-between p-2 rounded-lg bg-white/5">
                <div>
                  <div className="text-white font-medium text-sm">Registration</div>
                  <div className="text-white/60 text-xs">Account creation</div>
                </div>
                <div className="text-right">
                  <div className="text-white font-semibold text-sm">{breakdown.registration.points} pts</div>
                  <div className="text-white/60 text-xs">{breakdown.registration.count} × {breakdown.registration.weight}</div>
                </div>
              </div>

              {/* Profile Complete */}
              <div className="flex items-center justify-between p-2 rounded-lg bg-white/5">
                <div>
                  <div className="text-white font-medium text-sm">Profile Complete</div>
                  <div className="text-white/60 text-xs">All profile fields filled</div>
                </div>
                <div className="text-right">
                  <div className="text-white font-semibold text-sm">{breakdown.profileComplete.points} pts</div>
                  <div className="text-white/60 text-xs">{breakdown.profileComplete.count} × {breakdown.profileComplete.weight}</div>
                </div>
              </div>

              {/* Growth */}
              <div className="flex items-center justify-between p-2 rounded-lg bg-white/5">
                <div>
                  <div className="text-white font-medium text-sm">Growth Directions</div>
                  <div className="text-white/60 text-xs">{breakdown.growth.description}</div>
                </div>
                <div className="text-right">
                  <div className="text-white font-semibold text-sm">{breakdown.growth.points} pts</div>
                  <div className="text-white/60 text-xs">{breakdown.growth.count} tasks × {breakdown.growth.weight}x</div>
                </div>
              </div>

              {/* Followers */}
              <div className="flex items-center justify-between p-2 rounded-lg bg-white/5">
                <div>
                  <div className="text-white font-medium text-sm">Followers</div>
                  <div className="text-white/60 text-xs">People following you</div>
                </div>
                <div className="text-right">
                  <div className="text-white font-semibold text-sm">{breakdown.followers.points} pts</div>
                  <div className="text-white/60 text-xs">{breakdown.followers.count} × {breakdown.followers.weight}</div>
                </div>
              </div>

              {/* Connections */}
              <div className="flex items-center justify-between p-2 rounded-lg bg-white/5">
                <div>
                  <div className="text-white font-medium text-sm">Connections</div>
                  <div className="text-white/60 text-xs">
                    Mutual mentions: {breakdown.connections.firstCount} first ({breakdown.connections.firstWeight}pts), {breakdown.connections.repeatCount} repeat ({breakdown.connections.repeatWeight}pts)
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-white font-semibold text-sm">{breakdown.connections.points} pts</div>
                  <div className="text-white/60 text-xs">{breakdown.connections.count} connections</div>
                </div>
              </div>

              {/* Posts */}
              <div className="flex items-center justify-between p-2 rounded-lg bg-white/5">
                <div>
                  <div className="text-white font-medium text-sm">Posts</div>
                  <div className="text-white/60 text-xs">Published posts</div>
                </div>
                <div className="text-right">
                  <div className="text-white font-semibold text-sm">{breakdown.posts.points} pts</div>
                  <div className="text-white/60 text-xs">{breakdown.posts.count} × {breakdown.posts.weight}</div>
                </div>
              </div>

              {/* Comments */}
              <div className="flex items-center justify-between p-2 rounded-lg bg-white/5">
                <div>
                  <div className="text-white font-medium text-sm">Comments</div>
                  <div className="text-white/60 text-xs">Published comments</div>
                </div>
                <div className="text-right">
                  <div className="text-white font-semibold text-sm">{breakdown.comments.points} pts</div>
                  <div className="text-white/60 text-xs">{breakdown.comments.count} × {breakdown.comments.weight}</div>
                </div>
              </div>

              {/* Reactions */}
              <div className="flex items-center justify-between p-2 rounded-lg bg-white/5">
                <div>
                  <div className="text-white font-medium text-sm">Reactions</div>
                  <div className="text-white/60 text-xs">Reactions received on your posts</div>
                </div>
                <div className="text-right">
                  <div className="text-white font-semibold text-sm">{breakdown.reactions.points} pts</div>
                  <div className="text-white/60 text-xs">{Math.round(breakdown.reactions.count)} × {breakdown.reactions.weight}</div>
                </div>
              </div>

              {/* Invites */}
              <div className="flex items-center justify-between p-2 rounded-lg bg-white/5">
                <div>
                  <div className="text-white font-medium text-sm">Invite People</div>
                  <div className="text-white/60 text-xs">People who joined via your invite code and received 70 pts</div>
                </div>
                <div className="text-right">
                  <div className="text-white font-semibold text-sm">{breakdown.invites?.points || 0} pts</div>
                  <div className="text-white/60 text-xs">{breakdown.invites?.count || 0} × {breakdown.invites?.weight || 50}</div>
                </div>
              </div>

              {/* Growth Bonus */}
              <div className="flex items-center justify-between p-2 rounded-lg bg-white/5">
                <div>
                  <div className="text-white font-medium text-sm">Growth Bonus</div>
                  <div className="text-white/60 text-xs">{breakdown.growthBonus?.description || "5% bonus on invited users' growth points"}</div>
                </div>
                <div className="text-right">
                  <div className="text-white font-semibold text-sm">{(breakdown.growthBonus?.points || 0).toFixed(2)} pts</div>
                  <div className="text-white/60 text-xs">{((breakdown.growthBonus?.weight || 0.05) * 100)}% of invited users' growth points</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Button from '@/components/Button';

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
};

type SWLevel = {
  name: string;
  minSW: number;
  maxSW?: number;
  features: string[];
  color: string;
};

const SW_LEVELS: SWLevel[] = [
  {
    name: 'Beginner',
    minSW: 0,
    maxSW: 100,
    features: [
      'Basic social network features',
      'Post publishing',
      'Commenting',
      'Reacting to posts'
    ],
    color: 'text-gray-400'
  },
  {
    name: 'Active',
    minSW: 100,
    maxSW: 500,
    features: [
      'All "Beginner" level features',
      'Invite friends',
      'Access to extended statistics',
      'Priority in notifications'
    ],
    color: 'text-blue-400'
  },
  {
    name: 'Influencer',
    minSW: 500,
    maxSW: 2000,
    features: [
      'All "Active" level features',
      'Create groups and communities',
      'Extended profile features',
      'Priority support'
    ],
    color: 'text-purple-400'
  },
  {
    name: 'Expert',
    minSW: 2000,
    maxSW: 10000,
    features: [
      'All "Influencer" level features',
      'Content moderation',
      'Access to platform analytics',
      'VIP status'
    ],
    color: 'text-yellow-400'
  },
  {
    name: 'Legend',
    minSW: 10000,
    features: [
      'All "Expert" level features',
      'Exclusive features',
      'Personal support',
      'Participate in platform development'
    ],
    color: 'text-orange-400'
  }
];

function getSWLevel(sw: number): SWLevel {
  for (let i = SW_LEVELS.length - 1; i >= 0; i--) {
    if (sw >= SW_LEVELS[i].minSW) {
      return SW_LEVELS[i];
    }
  }
  return SW_LEVELS[0];
}

function getNextLevel(sw: number): SWLevel | null {
  const currentLevel = getSWLevel(sw);
  const currentIndex = SW_LEVELS.findIndex(level => level.name === currentLevel.name);
  if (currentIndex < SW_LEVELS.length - 1) {
    return SW_LEVELS[currentIndex + 1];
  }
  return null;
}

export default function SWPage() {
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [swData, setSwData] = useState<SWData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | undefined>();
  const [activeTab, setActiveTab] = useState<'overview' | 'factors' | 'levels' | 'breakdown'>('overview');
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [recentActivity, setRecentActivity] = useState<{
    profileComplete: boolean;
    postsCount: number;
    commentsCount: number;
    reactionsCount: number;
    invitesCount: number;
  } | null>(null);

  useEffect(() => {
    checkAdmin();
    loadSW();
    loadRecentActivity();
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

  if (loading || isAdmin === null) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6 md:p-6">
        <div className="text-white/70">Loading SW data…</div>
      </div>
    );
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
  const currentLevel = getSWLevel(totalSW);
  const nextLevel = getNextLevel(totalSW);
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
              ? 'text-white border-b-2 border-telegram-blue'
              : 'text-white/60 hover:text-white/80'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('factors')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'factors'
              ? 'text-white border-b-2 border-telegram-blue'
              : 'text-white/60 hover:text-white/80'
          }`}
        >
          How to Increase SW
        </button>
        <button
          onClick={() => setActiveTab('levels')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'levels'
              ? 'text-white border-b-2 border-telegram-blue'
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
                ? 'text-white border-b-2 border-telegram-blue'
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
          {/* Total SW */}
          <div className="card p-6">
            <div className="text-center">
              <div className="text-white/60 text-sm mb-2">Your Social Weight</div>
              <div className="text-5xl font-bold text-white mb-2">{totalSW.toLocaleString()}</div>
              {originalSW && originalSW !== totalSW && (
                <div className="text-white/50 text-xs mb-2">
                  Original SW: {originalSW.toLocaleString()} (inflation: {((1 - (inflationRate || 1)) * 100).toFixed(2)}%)
                </div>
              )}
              <div className="text-white/60 text-sm">Total Points</div>
            </div>
          </div>

          {/* Current Level */}
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-white/60 text-sm mb-1">Current Level</div>
                <div className={`text-xl font-bold ${currentLevel.color}`}>{currentLevel.name}</div>
              </div>
              {nextLevel && (
                <div className="text-right">
                  <div className="text-white/60 text-sm mb-1">Next Level</div>
                  <div className={`text-lg font-semibold ${getSWLevel(nextLevel.minSW).color}`}>{nextLevel.name}</div>
                  <div className="text-white/50 text-xs mt-1">
                    {nextLevel.minSW - totalSW} points to next level
                  </div>
                </div>
              )}
            </div>
            {nextLevel && (
              <div className="w-full bg-white/10 rounded-full h-2">
                <div
                  className="bg-telegram-blue h-2 rounded-full transition-all"
                  style={{ width: `${Math.min(100, Math.max(0, progressToNext))}%` }}
                />
              </div>
            )}
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
        </div>
      )}

      {/* Factors Tab */}
      {activeTab === 'factors' && (
        <div className="space-y-4">
          <div className="card p-4">
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
                  {breakdown.growth.count > 0 ? (
                    <span className="text-green-400 text-xl">✓</span>
                  ) : (
                    <span className="text-white/30 text-xl">○</span>
                  )}
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
                <div className="ml-4 flex items-center">
                  <span className="text-white/70 text-sm font-medium">
                    {recentActivity ? `${recentActivity.postsCount} today` : '...'}
                  </span>
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
                <div className="ml-4 flex items-center">
                  <span className="text-white/70 text-sm font-medium">
                    {recentActivity ? `${recentActivity.commentsCount} today` : '...'}
                  </span>
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
                  {breakdown.connections.count > 0 ? (
                    <span className="text-green-400 text-xl">✓</span>
                  ) : (
                    <span className="text-white/30 text-xl">○</span>
                  )}
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
                  {breakdown.followers.count > 0 ? (
                    <span className="text-green-400 text-xl">✓</span>
                  ) : (
                    <span className="text-white/30 text-xl">○</span>
                  )}
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
                <div className="ml-4 flex items-center">
                  <span className="text-white/70 text-sm font-medium">
                    {recentActivity ? `${recentActivity.reactionsCount} today` : '...'}
                  </span>
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
                    {recentActivity ? `${recentActivity.invitesCount} today` : '...'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Levels Tab */}
      {activeTab === 'levels' && (
        <div className="space-y-4">
          <div className="card p-4">
            <h2 className="text-lg font-semibold text-white mb-4">SW Levels & Features</h2>
            <div className="space-y-4">
              {SW_LEVELS.map((level, index) => {
                const isCurrent = currentLevel.name === level.name;
                const isUnlocked = totalSW >= level.minSW;
                return (
                  <div
                    key={level.name}
                    className={`p-4 rounded-lg border-2 ${
                      isCurrent
                        ? 'border-telegram-blue bg-telegram-blue/10'
                        : isUnlocked
                        ? 'border-white/20 bg-white/5'
                        : 'border-white/10 bg-white/5 opacity-60'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className={`text-xl font-bold ${level.color}`}>
                        {level.name}
                        {isCurrent && <span className="ml-2 text-sm text-telegram-blue">(Current)</span>}
                      </div>
                      <div className="text-white/60 text-sm">
                        {level.maxSW ? `${level.minSW} - ${level.maxSW} SW` : `${level.minSW}+ SW`}
                      </div>
                    </div>
                    <div className="space-y-2">
                      {level.features.map((feature, featureIndex) => (
                        <div key={featureIndex} className="flex items-start gap-2">
                          <span className="text-telegram-blue mt-1">✓</span>
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

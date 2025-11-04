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
  breakdown: SWBreakdown;
  weights: any;
};

export default function SWPage() {
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [swData, setSwData] = useState<SWData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | undefined>();

  useEffect(() => {
    loadSW();
  }, []);

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

  if (loading) {
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

  const { totalSW, breakdown } = swData;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 md:p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white mb-1">Social Weight (SW)</h1>
          <p className="text-white/70 text-sm mt-2">
            Your Social Weight is calculated based on various factors that reflect your engagement and activity on the platform.
          </p>
        </div>
        <Button
          onClick={recalculateSW}
          variant="secondary"
          disabled={recalculating || loading}
        >
          {recalculating ? 'Recalculating...' : 'Recalculate SW'}
        </Button>
      </div>

      {note && (
        <div className="card p-4 bg-white/5">
          <div className="text-white/80 text-sm">{note}</div>
        </div>
      )}

      {/* Total SW */}
      <div className="card p-6">
        <div className="text-center">
          <div className="text-white/60 text-sm mb-2">Your Social Weight</div>
          <div className="text-4xl font-bold text-white mb-2">{totalSW.toLocaleString()}</div>
          <div className="text-white/60 text-sm">Total Points</div>
        </div>
      </div>

      {/* Breakdown */}
      <div className="card p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white mb-4">SW Breakdown</h2>
        
        <div className="space-y-4">
          {/* Registration */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-white/5">
            <div>
              <div className="text-white font-medium">Registration</div>
              <div className="text-white/60 text-sm">Account creation</div>
            </div>
            <div className="text-right">
              <div className="text-white font-semibold">{breakdown.registration.points} pts</div>
              <div className="text-white/60 text-xs">{breakdown.registration.count} × {breakdown.registration.weight}</div>
            </div>
          </div>

          {/* Profile Complete */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-white/5">
            <div>
              <div className="text-white font-medium">Profile Complete</div>
              <div className="text-white/60 text-sm">All profile fields filled</div>
            </div>
            <div className="text-right">
              <div className="text-white font-semibold">{breakdown.profileComplete.points} pts</div>
              <div className="text-white/60 text-xs">{breakdown.profileComplete.count} × {breakdown.profileComplete.weight}</div>
            </div>
          </div>

          {/* Growth */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-white/5">
            <div>
              <div className="text-white font-medium">Growth Directions</div>
              <div className="text-white/60 text-sm">{breakdown.growth.description}</div>
            </div>
            <div className="text-right">
              <div className="text-white font-semibold">{breakdown.growth.points} pts</div>
              <div className="text-white/60 text-xs">{breakdown.growth.count} tasks × {breakdown.growth.weight}x</div>
            </div>
          </div>

          {/* Followers */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-white/5">
            <div>
              <div className="text-white font-medium">Followers</div>
              <div className="text-white/60 text-sm">People following you</div>
            </div>
            <div className="text-right">
              <div className="text-white font-semibold">{breakdown.followers.points} pts</div>
              <div className="text-white/60 text-xs">{breakdown.followers.count} × {breakdown.followers.weight}</div>
            </div>
          </div>

          {/* Connections */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-white/5">
            <div>
              <div className="text-white font-medium">Connections</div>
              <div className="text-white/60 text-sm">
                Mutual mentions: {breakdown.connections.firstCount} first ({breakdown.connections.firstWeight}pts), {breakdown.connections.repeatCount} repeat ({breakdown.connections.repeatWeight}pts)
              </div>
            </div>
            <div className="text-right">
              <div className="text-white font-semibold">{breakdown.connections.points} pts</div>
              <div className="text-white/60 text-xs">{breakdown.connections.count} connections</div>
            </div>
          </div>

          {/* Posts */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-white/5">
            <div>
              <div className="text-white font-medium">Posts</div>
              <div className="text-white/60 text-sm">Published posts</div>
            </div>
            <div className="text-right">
              <div className="text-white font-semibold">{breakdown.posts.points} pts</div>
              <div className="text-white/60 text-xs">{breakdown.posts.count} × {breakdown.posts.weight}</div>
            </div>
          </div>

          {/* Comments */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-white/5">
            <div>
              <div className="text-white font-medium">Comments</div>
              <div className="text-white/60 text-sm">Published comments</div>
            </div>
            <div className="text-right">
              <div className="text-white font-semibold">{breakdown.comments.points} pts</div>
              <div className="text-white/60 text-xs">{breakdown.comments.count} × {breakdown.comments.weight}</div>
            </div>
          </div>

          {/* Reactions */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-white/5">
            <div>
              <div className="text-white font-medium">Reactions</div>
              <div className="text-white/60 text-sm">Reactions received on your posts</div>
            </div>
            <div className="text-right">
              <div className="text-white font-semibold">{breakdown.reactions.points} pts</div>
              <div className="text-white/60 text-xs">{Math.round(breakdown.reactions.count)} × {breakdown.reactions.weight}</div>
            </div>
          </div>

          {/* Invites */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-white/5">
            <div>
              <div className="text-white font-medium">Invite People</div>
              <div className="text-white/60 text-sm">People who joined via your invite code and received 70 pts</div>
            </div>
            <div className="text-right">
              <div className="text-white font-semibold">{breakdown.invites?.points || 0} pts</div>
              <div className="text-white/60 text-xs">{breakdown.invites?.count || 0} × {breakdown.invites?.weight || 50}</div>
            </div>
          </div>

          {/* Growth Bonus */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-white/5">
            <div>
              <div className="text-white font-medium">Growth Bonus</div>
              <div className="text-white/60 text-sm">{breakdown.growthBonus?.description || '5% bonus on growth points'}</div>
            </div>
            <div className="text-right">
              <div className="text-white font-semibold">{(breakdown.growthBonus?.points || 0).toFixed(2)} pts</div>
              <div className="text-white/60 text-xs">{((breakdown.growthBonus?.weight || 0.05) * 100)}% of growth points</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

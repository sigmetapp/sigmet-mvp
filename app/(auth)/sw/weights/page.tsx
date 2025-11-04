"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Button from '@/components/Button';

const ADMIN_EMAILS = new Set<string>(['seosasha@gmail.com']);

type SWWeights = {
  id: number;
  registration_points: number;
  profile_complete_points: number;
  growth_total_points_multiplier: number;
  follower_points: number;
  connection_first_points: number;
  connection_repeat_points: number;
  post_points: number;
  comment_points: number;
  reaction_points: number;
  updated_at: string;
  updated_by: string | null;
};

export default function SWWeightsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [weights, setWeights] = useState<SWWeights | null>(null);
  const [editedWeights, setEditedWeights] = useState<Partial<SWWeights>>({});
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [note, setNote] = useState<string | undefined>();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    loadWeights();
  }, []);

  async function loadWeights() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const email = user.email || null;
      setUserEmail(email);
      const admin = email && ADMIN_EMAILS.has(email);
      setIsAdmin(admin);

      if (!admin) {
        if (typeof window !== 'undefined') {
          window.location.href = '/feed';
        }
        setLoading(false);
        return;
      }

      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) {
        setNote('Not authenticated');
        setLoading(false);
        return;
      }

      const response = await fetch('/api/sw/weights', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        setNote(error.error || 'Failed to load weights');
        setLoading(false);
        return;
      }

      const data = await response.json();
      setWeights(data.weights);
      setEditedWeights(data.weights);
      setLoading(false);
    } catch (error: any) {
      console.error('Error loading weights:', error);
      setNote(error.message || 'Failed to load weights');
      setLoading(false);
    }
  }

  async function saveWeights() {
    if (!isAdmin) return;

    setSaving(true);
    setNote(undefined);

    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) {
        setNote('Not authenticated');
        setSaving(false);
        return;
      }

      const response = await fetch('/api/sw/weights', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(editedWeights),
      });

      const data = await response.json();

      if (!response.ok) {
        setNote(data.error || 'Failed to save weights');
      } else {
        setNote('Weights saved successfully');
        setWeights(data.weights);
        setEditedWeights(data.weights);
      }
    } catch (error: any) {
      setNote(error.message || 'Failed to save weights');
    } finally {
      setSaving(false);
    }
  }

  if (loading || isAdmin === null) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6 md:p-6">
        <div className="text-white/70">Loading weights…</div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6 md:p-6">
        <div className="text-white/70">Access denied. This page is only available for administrators.</div>
      </div>
    );
  }

  if (!weights) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6 md:p-6">
        <div className="text-white/70">No weights data available</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white mb-1">SW Weights Management</h1>
        <p className="text-white/70 text-sm mt-2">
          Configure the weights used in the Social Weight (SW) calculation formula.
        </p>
      </div>

      {note && (
        <div className="card p-4 bg-white/5">
          <div className="text-white/80 text-sm">{note}</div>
        </div>
      )}

      <div className="card p-6 space-y-6">
        <div className="space-y-4">
          {/* Registration */}
          <div className="flex items-center gap-4">
            <label className="w-64 text-white font-medium">Registration Points</label>
            <input
              type="number"
              value={editedWeights.registration_points ?? weights.registration_points}
              onChange={(e) => setEditedWeights({ ...editedWeights, registration_points: parseInt(e.target.value) || 0 })}
              className="flex-1 px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:border-telegram-blue/50"
            />
            <div className="text-white/60 text-sm w-32">pts per registration</div>
          </div>

          {/* Profile Complete */}
          <div className="flex items-center gap-4">
            <label className="w-64 text-white font-medium">Profile Complete Points</label>
            <input
              type="number"
              value={editedWeights.profile_complete_points ?? weights.profile_complete_points}
              onChange={(e) => setEditedWeights({ ...editedWeights, profile_complete_points: parseInt(e.target.value) || 0 })}
              className="flex-1 px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:border-telegram-blue/50"
            />
            <div className="text-white/60 text-sm w-32">pts when complete</div>
          </div>

          {/* Growth Multiplier */}
          <div className="flex items-center gap-4">
            <label className="w-64 text-white font-medium">Growth Total Points Multiplier</label>
            <input
              type="number"
              value={editedWeights.growth_total_points_multiplier ?? weights.growth_total_points_multiplier}
              onChange={(e) => setEditedWeights({ ...editedWeights, growth_total_points_multiplier: parseInt(e.target.value) || 1 })}
              className="flex-1 px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:border-telegram-blue/50"
            />
            <div className="text-white/60 text-sm w-32">multiplier</div>
          </div>

          {/* Follower */}
          <div className="flex items-center gap-4">
            <label className="w-64 text-white font-medium">Follower Points</label>
            <input
              type="number"
              value={editedWeights.follower_points ?? weights.follower_points}
              onChange={(e) => setEditedWeights({ ...editedWeights, follower_points: parseInt(e.target.value) || 0 })}
              className="flex-1 px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:border-telegram-blue/50"
            />
            <div className="text-white/60 text-sm w-32">pts per follower</div>
          </div>

          {/* Connection First */}
          <div className="flex items-center gap-4">
            <label className="w-64 text-white font-medium">Connection First Points</label>
            <input
              type="number"
              value={editedWeights.connection_first_points ?? weights.connection_first_points}
              onChange={(e) => setEditedWeights({ ...editedWeights, connection_first_points: parseInt(e.target.value) || 0 })}
              className="flex-1 px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:border-telegram-blue/50"
            />
            <div className="text-white/60 text-sm w-32">pts per first connection</div>
          </div>

          {/* Connection Repeat */}
          <div className="flex items-center gap-4">
            <label className="w-64 text-white font-medium">Connection Repeat Points</label>
            <input
              type="number"
              value={editedWeights.connection_repeat_points ?? weights.connection_repeat_points}
              onChange={(e) => setEditedWeights({ ...editedWeights, connection_repeat_points: parseInt(e.target.value) || 0 })}
              className="flex-1 px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:border-telegram-blue/50"
            />
            <div className="text-white/60 text-sm w-32">pts per repeat connection</div>
          </div>

          {/* Post */}
          <div className="flex items-center gap-4">
            <label className="w-64 text-white font-medium">Post Points</label>
            <input
              type="number"
              value={editedWeights.post_points ?? weights.post_points}
              onChange={(e) => setEditedWeights({ ...editedWeights, post_points: parseInt(e.target.value) || 0 })}
              className="flex-1 px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:border-telegram-blue/50"
            />
            <div className="text-white/60 text-sm w-32">pts per post</div>
          </div>

          {/* Comment */}
          <div className="flex items-center gap-4">
            <label className="w-64 text-white font-medium">Comment Points</label>
            <input
              type="number"
              value={editedWeights.comment_points ?? weights.comment_points}
              onChange={(e) => setEditedWeights({ ...editedWeights, comment_points: parseInt(e.target.value) || 0 })}
              className="flex-1 px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:border-telegram-blue/50"
            />
            <div className="text-white/60 text-sm w-32">pts per comment</div>
          </div>

          {/* Reaction */}
          <div className="flex items-center gap-4">
            <label className="w-64 text-white font-medium">Reaction Points</label>
            <input
              type="number"
              value={editedWeights.reaction_points ?? weights.reaction_points}
              onChange={(e) => setEditedWeights({ ...editedWeights, reaction_points: parseInt(e.target.value) || 0 })}
              className="flex-1 px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:border-telegram-blue/50"
            />
            <div className="text-white/60 text-sm w-32">pts per reaction</div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
          <Button
            onClick={saveWeights}
            variant="primary"
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Weights'}
          </Button>
        </div>
      </div>
    </div>
  );
}

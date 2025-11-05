"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Button from '@/components/Button';

const ADMIN_EMAILS = new Set<string>(['seosasha@gmail.com']);

type SWLevel = {
  name: string;
  minSW: number;
  maxSW?: number;
};

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
  daily_inflation_rate?: number;
  user_growth_inflation_rate?: number;
  min_inflation_rate?: number;
  invite_points?: number;
  growth_bonus_percentage?: number;
  cache_duration_minutes?: number;
  sw_levels?: SWLevel[];
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
  const [activeSection, setActiveSection] = useState<'weights' | 'inflation' | 'bonuses' | 'cache' | 'levels'>('weights');

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
      const loadedWeights = data.weights;
      
      // Parse sw_levels if it's a string
      if (loadedWeights.sw_levels && typeof loadedWeights.sw_levels === 'string') {
        try {
          loadedWeights.sw_levels = JSON.parse(loadedWeights.sw_levels);
        } catch (e) {
          console.error('Error parsing sw_levels:', e);
        }
      }
      
      setWeights(loadedWeights);
      setEditedWeights(loadedWeights);
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

      // Prepare data for saving
      const saveData: any = { ...editedWeights };
      
      // Ensure sw_levels is properly formatted
      if (saveData.sw_levels && Array.isArray(saveData.sw_levels)) {
        // Keep as is - API will handle JSONB conversion
      }

      const response = await fetch('/api/sw/weights', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(saveData),
      });

      const data = await response.json();

      if (!response.ok) {
        setNote(data.error || 'Failed to save weights');
      } else {
        setNote('Weights saved successfully');
        const updatedWeights = data.weights;
        if (updatedWeights.sw_levels && typeof updatedWeights.sw_levels === 'string') {
          try {
            updatedWeights.sw_levels = JSON.parse(updatedWeights.sw_levels);
          } catch (e) {
            console.error('Error parsing sw_levels:', e);
          }
        }
        setWeights(updatedWeights);
        setEditedWeights(updatedWeights);
      }
    } catch (error: any) {
      setNote(error.message || 'Failed to save weights');
    } finally {
      setSaving(false);
    }
  }

  function updateLevel(index: number, field: 'name' | 'minSW' | 'maxSW', value: string | number) {
    if (!editedWeights.sw_levels) return;
    
    const updatedLevels = [...editedWeights.sw_levels];
    updatedLevels[index] = { ...updatedLevels[index], [field]: value };
    setEditedWeights({ ...editedWeights, sw_levels: updatedLevels });
  }

  function addLevel() {
    if (!editedWeights.sw_levels) return;
    
    const newLevel: SWLevel = { name: 'New Level', minSW: 0 };
    setEditedWeights({ ...editedWeights, sw_levels: [...editedWeights.sw_levels, newLevel] });
  }

  function removeLevel(index: number) {
    if (!editedWeights.sw_levels || editedWeights.sw_levels.length <= 1) return;
    
    const updatedLevels = editedWeights.sw_levels.filter((_, i) => i !== index);
    setEditedWeights({ ...editedWeights, sw_levels: updatedLevels });
  }

  if (loading || isAdmin === null) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-6 md:p-6">
        <div className="text-white/70">Loading weights…</div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-6 md:p-6">
        <div className="text-white/70">Access denied. This page is only available for administrators.</div>
      </div>
    );
  }

  if (!weights) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-6 md:p-6">
        <div className="text-white/70">No weights data available</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white mb-1">SW Formula Parameters Management</h1>
        <p className="text-white/70 text-sm mt-2">
          Configure all parameters used in the Social Weight (SW) calculation formula.
        </p>
      </div>

      {note && (
        <div className="card p-4 bg-white/5">
          <div className="text-white/80 text-sm">{note}</div>
        </div>
      )}

      {/* Section Tabs */}
      <div className="flex gap-2 border-b border-white/10">
        {(['weights', 'inflation', 'bonuses', 'cache', 'levels'] as const).map((section) => (
          <button
            key={section}
            onClick={() => setActiveSection(section)}
            className={`px-4 py-2 text-sm font-medium transition-colors capitalize ${
              activeSection === section
                ? 'text-white border-b-2 border-telegram-blue'
                : 'text-white/60 hover:text-white/80'
            }`}
          >
            {section}
          </button>
        ))}
      </div>

      {/* Weights Section */}
      {activeSection === 'weights' && (
        <div className="card p-6 space-y-6">
          <h2 className="text-lg font-semibold text-white mb-4">SW Calculation Weights</h2>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <label className="w-64 text-white font-medium">Registration Points</label>
              <input
                type="number"
                value={editedWeights.registration_points ?? weights.registration_points ?? 0}
                onChange={(e) => setEditedWeights({ ...editedWeights, registration_points: parseInt(e.target.value) || 0 })}
                className="flex-1 px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:border-telegram-blue/50"
              />
              <div className="text-white/60 text-sm w-32">pts per registration</div>
            </div>

            <div className="flex items-center gap-4">
              <label className="w-64 text-white font-medium">Profile Complete Points</label>
              <input
                type="number"
                value={editedWeights.profile_complete_points ?? weights.profile_complete_points ?? 0}
                onChange={(e) => setEditedWeights({ ...editedWeights, profile_complete_points: parseInt(e.target.value) || 0 })}
                className="flex-1 px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:border-telegram-blue/50"
              />
              <div className="text-white/60 text-sm w-32">pts when complete</div>
            </div>

            <div className="flex items-center gap-4">
              <label className="w-64 text-white font-medium">Growth Total Points Multiplier</label>
              <input
                type="number"
                value={editedWeights.growth_total_points_multiplier ?? weights.growth_total_points_multiplier ?? 1}
                onChange={(e) => setEditedWeights({ ...editedWeights, growth_total_points_multiplier: parseInt(e.target.value) || 1 })}
                className="flex-1 px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:border-telegram-blue/50"
              />
              <div className="text-white/60 text-sm w-32">multiplier</div>
            </div>

            <div className="flex items-center gap-4">
              <label className="w-64 text-white font-medium">Follower Points</label>
              <input
                type="number"
                value={editedWeights.follower_points ?? weights.follower_points ?? 0}
                onChange={(e) => setEditedWeights({ ...editedWeights, follower_points: parseInt(e.target.value) || 0 })}
                className="flex-1 px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:border-telegram-blue/50"
              />
              <div className="text-white/60 text-sm w-32">pts per follower</div>
            </div>

            <div className="flex items-center gap-4">
              <label className="w-64 text-white font-medium">Connection First Points</label>
              <input
                type="number"
                value={editedWeights.connection_first_points ?? weights.connection_first_points ?? 0}
                onChange={(e) => setEditedWeights({ ...editedWeights, connection_first_points: parseInt(e.target.value) || 0 })}
                className="flex-1 px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:border-telegram-blue/50"
              />
              <div className="text-white/60 text-sm w-32">pts per first connection</div>
            </div>

            <div className="flex items-center gap-4">
              <label className="w-64 text-white font-medium">Connection Repeat Points</label>
              <input
                type="number"
                value={editedWeights.connection_repeat_points ?? weights.connection_repeat_points ?? 0}
                onChange={(e) => setEditedWeights({ ...editedWeights, connection_repeat_points: parseInt(e.target.value) || 0 })}
                className="flex-1 px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:border-telegram-blue/50"
              />
              <div className="text-white/60 text-sm w-32">pts per repeat connection</div>
            </div>

            <div className="flex items-center gap-4">
              <label className="w-64 text-white font-medium">Post Points</label>
              <input
                type="number"
                value={editedWeights.post_points ?? weights.post_points ?? 0}
                onChange={(e) => setEditedWeights({ ...editedWeights, post_points: parseInt(e.target.value) || 0 })}
                className="flex-1 px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:border-telegram-blue/50"
              />
              <div className="text-white/60 text-sm w-32">pts per post</div>
            </div>

            <div className="flex items-center gap-4">
              <label className="w-64 text-white font-medium">Comment Points</label>
              <input
                type="number"
                value={editedWeights.comment_points ?? weights.comment_points ?? 0}
                onChange={(e) => setEditedWeights({ ...editedWeights, comment_points: parseInt(e.target.value) || 0 })}
                className="flex-1 px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:border-telegram-blue/50"
              />
              <div className="text-white/60 text-sm w-32">pts per comment</div>
            </div>

            <div className="flex items-center gap-4">
              <label className="w-64 text-white font-medium">Reaction Points</label>
              <input
                type="number"
                value={editedWeights.reaction_points ?? weights.reaction_points ?? 0}
                onChange={(e) => setEditedWeights({ ...editedWeights, reaction_points: parseInt(e.target.value) || 0 })}
                className="flex-1 px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:border-telegram-blue/50"
              />
              <div className="text-white/60 text-sm w-32">pts per reaction</div>
            </div>
          </div>
        </div>
      )}

      {/* Inflation Section */}
      {activeSection === 'inflation' && (
        <div className="card p-6 space-y-6">
          <h2 className="text-lg font-semibold text-white mb-4">Inflation Parameters</h2>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <label className="w-64 text-white font-medium">Daily Inflation Rate</label>
              <input
                type="number"
                step="0.0001"
                value={editedWeights.daily_inflation_rate ?? weights.daily_inflation_rate ?? 0.001}
                onChange={(e) => setEditedWeights({ ...editedWeights, daily_inflation_rate: parseFloat(e.target.value) || 0.001 })}
                className="flex-1 px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:border-telegram-blue/50"
              />
              <div className="text-white/60 text-sm w-32">per day (0.001 = 0.1%)</div>
            </div>

            <div className="flex items-center gap-4">
              <label className="w-64 text-white font-medium">User Growth Inflation Rate</label>
              <input
                type="number"
                step="0.0001"
                value={editedWeights.user_growth_inflation_rate ?? weights.user_growth_inflation_rate ?? 0.0001}
                onChange={(e) => setEditedWeights({ ...editedWeights, user_growth_inflation_rate: parseFloat(e.target.value) || 0.0001 })}
                className="flex-1 px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:border-telegram-blue/50"
              />
              <div className="text-white/60 text-sm w-32">per 100 users (0.0001 = 0.01%)</div>
            </div>

            <div className="flex items-center gap-4">
              <label className="w-64 text-white font-medium">Minimum Inflation Rate</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={editedWeights.min_inflation_rate ?? weights.min_inflation_rate ?? 0.5}
                onChange={(e) => setEditedWeights({ ...editedWeights, min_inflation_rate: parseFloat(e.target.value) || 0.5 })}
                className="flex-1 px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:border-telegram-blue/50"
              />
              <div className="text-white/60 text-sm w-32">min value (0.5 = 50%)</div>
            </div>
          </div>
        </div>
      )}

      {/* Bonuses Section */}
      {activeSection === 'bonuses' && (
        <div className="card p-6 space-y-6">
          <h2 className="text-lg font-semibold text-white mb-4">Invites & Bonuses</h2>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <label className="w-64 text-white font-medium">Invite Points</label>
              <input
                type="number"
                value={editedWeights.invite_points ?? weights.invite_points ?? 50}
                onChange={(e) => setEditedWeights({ ...editedWeights, invite_points: parseInt(e.target.value) || 50 })}
                className="flex-1 px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:border-telegram-blue/50"
              />
              <div className="text-white/60 text-sm w-32">pts per invite</div>
            </div>

            <div className="flex items-center gap-4">
              <label className="w-64 text-white font-medium">Growth Bonus Percentage</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={editedWeights.growth_bonus_percentage ?? weights.growth_bonus_percentage ?? 0.05}
                onChange={(e) => setEditedWeights({ ...editedWeights, growth_bonus_percentage: parseFloat(e.target.value) || 0.05 })}
                className="flex-1 px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:border-telegram-blue/50"
              />
              <div className="text-white/60 text-sm w-32">(0.05 = 5%)</div>
            </div>
          </div>
        </div>
      )}

      {/* Cache Section */}
      {activeSection === 'cache' && (
        <div className="card p-6 space-y-6">
          <h2 className="text-lg font-semibold text-white mb-4">Cache Settings</h2>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <label className="w-64 text-white font-medium">Cache Duration (minutes)</label>
              <input
                type="number"
                min="1"
                value={editedWeights.cache_duration_minutes ?? weights.cache_duration_minutes ?? 5}
                onChange={(e) => setEditedWeights({ ...editedWeights, cache_duration_minutes: parseInt(e.target.value) || 5 })}
                className="flex-1 px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:border-telegram-blue/50"
              />
              <div className="text-white/60 text-sm w-32">minutes</div>
            </div>
          </div>
        </div>
      )}

      {/* Levels Section */}
      {activeSection === 'levels' && (
        <div className="card p-6 space-y-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">SW Levels Configuration</h2>
            <Button
              onClick={addLevel}
              variant="secondary"
              disabled={saving}
            >
              + Add Level
            </Button>
          </div>
          <div className="space-y-4">
            {(editedWeights.sw_levels || weights.sw_levels || []).map((level, index) => (
              <div key={index} className="p-4 rounded-lg bg-white/5 border border-white/10">
                <div className="flex items-center gap-4 mb-3">
                  <input
                    type="text"
                    value={level.name}
                    onChange={(e) => updateLevel(index, 'name', e.target.value)}
                    className="flex-1 px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:border-telegram-blue/50"
                    placeholder="Level name"
                  />
                  <Button
                    onClick={() => removeLevel(index)}
                    variant="secondary"
                    disabled={saving || (editedWeights.sw_levels?.length ?? 0) <= 1}
                  >
                    Remove
                  </Button>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <label className="text-white/60 text-sm mb-1 block">Min SW</label>
                    <input
                      type="number"
                      value={level.minSW}
                      onChange={(e) => updateLevel(index, 'minSW', parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:border-telegram-blue/50"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-white/60 text-sm mb-1 block">Max SW (optional)</label>
                    <input
                      type="number"
                      value={level.maxSW ?? ''}
                      onChange={(e) => updateLevel(index, 'maxSW', e.target.value ? parseInt(e.target.value) : undefined)}
                      className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:border-telegram-blue/50"
                      placeholder="Leave empty for unlimited"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Save Button */}
      <div className="flex justify-end gap-3 pt-4">
        <Button
          onClick={saveWeights}
          variant="primary"
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save All Parameters'}
        </Button>
      </div>
    </div>
  );
}

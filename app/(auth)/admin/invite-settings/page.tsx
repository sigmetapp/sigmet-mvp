'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { RequireAuth } from '@/components/RequireAuth';

interface InviteLimits {
  id: number;
  beginner_limit: number;
  growing_limit: number;
  advance_limit: number;
  expert_limit: number;
  leader_limit: number;
  angel_limit: number;
  updated_at: string | null;
  updated_by: string | null;
}

export default function AdminInviteSettingsPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [limits, setLimits] = useState<InviteLimits>({
    id: 1,
    beginner_limit: 3,
    growing_limit: 5,
    advance_limit: 10,
    expert_limit: 15,
    leader_limit: 20,
    angel_limit: 30,
    updated_at: null,
    updated_by: null,
  });

  useEffect(() => {
    checkAdmin();
    loadLimits();
  }, []);

  const checkAdmin = async () => {
    try {
      const { data, error } = await supabase.rpc('is_admin_uid');
      if (error) throw error;
      const adminStatus = data ?? false;
      setIsAdmin(adminStatus);
      if (!adminStatus && typeof window !== 'undefined') {
        window.location.href = '/';
      }
    } catch (err) {
      console.error('Error checking admin status:', err);
      setIsAdmin(false);
      if (typeof window !== 'undefined') {
        window.location.href = '/';
      }
    }
  };

  const loadLimits = async () => {
    try {
      const { data, error } = await supabase
        .from('invite_limits')
        .select('*')
        .eq('id', 1)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      if (data) {
        setLimits(data);
      }
    } catch (err: any) {
      console.error('Error loading limits:', err);
      setError(err.message || 'Failed to load invite limits');
    }
  };

  const handleSave = async () => {
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('invite_limits')
        .update({
          beginner_limit: limits.beginner_limit,
          growing_limit: limits.growing_limit,
          advance_limit: limits.advance_limit,
          expert_limit: limits.expert_limit,
          leader_limit: limits.leader_limit,
          angel_limit: limits.angel_limit,
          updated_at: new Date().toISOString(),
          updated_by: user.id,
        })
        .eq('id', 1);

      if (error) throw error;
      setSuccess('Invite limits updated successfully!');
      await loadLimits();
    } catch (err: any) {
      setError(err.message || 'Failed to update invite limits');
    } finally {
      setLoading(false);
    }
  };

  if (isAdmin === null) {
    return (
      <RequireAuth>
        <div className="max-w-4xl mx-auto px-4 py-6 md:p-6">
          <div className="text-white">Loading...</div>
        </div>
      </RequireAuth>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <RequireAuth>
      <div className="max-w-4xl mx-auto px-4 py-6 md:p-6">
        <h1 className="text-2xl font-semibold text-white mb-2">Admin: Invite Settings</h1>
        <p className="text-gray-400 mb-6">Configure invite limits for different SW levels.</p>

        {/* Admin Status */}
        <div className="mb-4 p-3 bg-green-500/20 border border-green-500/50 rounded-lg">
          <p className="text-green-300 text-sm">👑 Admin access confirmed.</p>
        </div>

        {/* Settings Form */}
        <div className="bg-gray-800 p-6 rounded-lg mb-6">
          <h2 className="text-lg font-semibold text-white mb-4">Invite Limits by SW Level</h2>
          <p className="text-gray-400 text-sm mb-6">
            Set how many invites users can create based on their Social Weight (SW) level.
          </p>

          {error && (
            <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg">
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 bg-green-500/20 border border-green-500/50 rounded-lg">
              <p className="text-green-300 text-sm">{success}</p>
            </div>
          )}

          <div className="space-y-4">
            {/* Beginner */}
            <div className="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Beginner (0-99 SW)
                </label>
                <p className="text-xs text-gray-400">Default level for new users</p>
              </div>
              <input
                type="number"
                min="0"
                max="100"
                value={limits.beginner_limit}
                onChange={(e) => setLimits({ ...limits, beginner_limit: parseInt(e.target.value) || 0 })}
                className="w-24 px-3 py-2 bg-gray-600 text-white rounded-lg border border-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Growing */}
            <div className="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Growing (100-1250 SW)
                </label>
                <p className="text-xs text-gray-400">Users with basic engagement</p>
              </div>
              <input
                type="number"
                min="0"
                max="100"
                value={limits.growing_limit}
                onChange={(e) => setLimits({ ...limits, growing_limit: parseInt(e.target.value) || 0 })}
                className="w-24 px-3 py-2 bg-gray-600 text-white rounded-lg border border-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Advance */}
            <div className="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Advance (1251-6250 SW)
                </label>
                <p className="text-xs text-gray-400">Active community members</p>
              </div>
              <input
                type="number"
                min="0"
                max="100"
                value={limits.advance_limit}
                onChange={(e) => setLimits({ ...limits, advance_limit: parseInt(e.target.value) || 0 })}
                className="w-24 px-3 py-2 bg-gray-600 text-white rounded-lg border border-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Expert */}
            <div className="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Expert (6251-9999 SW)
                </label>
                <p className="text-xs text-gray-400">Highly engaged users</p>
              </div>
              <input
                type="number"
                min="0"
                max="100"
                value={limits.expert_limit}
                onChange={(e) => setLimits({ ...limits, expert_limit: parseInt(e.target.value) || 0 })}
                className="w-24 px-3 py-2 bg-gray-600 text-white rounded-lg border border-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Leader */}
            <div className="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Leader (10000-49999 SW)
                </label>
                <p className="text-xs text-gray-400">Community leaders</p>
              </div>
              <input
                type="number"
                min="0"
                max="100"
                value={limits.leader_limit}
                onChange={(e) => setLimits({ ...limits, leader_limit: parseInt(e.target.value) || 0 })}
                className="w-24 px-3 py-2 bg-gray-600 text-white rounded-lg border border-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Angel */}
            <div className="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Angel (50000+ SW)
                </label>
                <p className="text-xs text-gray-400">Top tier users</p>
              </div>
              <input
                type="number"
                min="0"
                max="100"
                value={limits.angel_limit}
                onChange={(e) => setLimits({ ...limits, angel_limit: parseInt(e.target.value) || 0 })}
                className="w-24 px-3 py-2 bg-gray-600 text-white rounded-lg border border-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="mt-6 flex gap-4">
            <button
              onClick={handleSave}
              disabled={loading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {loading ? 'Saving...' : 'Save Settings'}
            </button>
            <button
              onClick={loadLimits}
              disabled={loading}
              className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              Reset
            </button>
          </div>

          {limits.updated_at && (
            <div className="mt-4 text-xs text-gray-400">
              Last updated: {new Date(limits.updated_at).toLocaleString()}
            </div>
          )}
        </div>

        {/* Info Section */}
        <div className="bg-gray-800 p-6 rounded-lg">
          <h3 className="text-lg font-semibold text-white mb-4">How It Works</h3>
          <ul className="space-y-2 text-gray-300 text-sm">
            <li>• Users can create invites up to their level's limit</li>
            <li>• Expired invites (24 hours) are automatically removed and don't count toward the limit</li>
            <li>• Accepted invites count toward the limit until they expire</li>
            <li>• Admins can create unlimited invites regardless of their SW level</li>
            <li>• Changes take effect immediately for new invite creation attempts</li>
          </ul>
        </div>
      </div>
    </RequireAuth>
  );
}

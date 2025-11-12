'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { ph } from '@/lib/analytics.client';
import { RequireAuth } from '@/components/RequireAuth';

interface Invite {
  id: string;
  invitee_email: string;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  created_at: string;
  sent_at: string | null;
  accepted_at: string | null;
  token: string;
  invite_code: string | null;
  consumed_by_user_id: string | null;
  consumed_by_user_sw: number | null;
  expires_at: string | null;
}

interface InviteStats {
  user_id: string;
  total_sent: number;
  accepted_count: number;
  active_count: number;
}

interface UserInviteLimit {
  limit: number;
  current_count: number;
  level: string;
}

export default function InvitePage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [stats, setStats] = useState<InviteStats | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [userLimit, setUserLimit] = useState<UserInviteLimit | null>(null);

  useEffect(() => {
    loadInvites();
    loadStats();
    checkAdmin();
    loadUserLimit();
  }, []);

  // Use admin function if user is admin, otherwise use regular function
  const handleCreateInvite = async () => {
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      let result;
      if (isAdmin) {
        // Admin can create unlimited invites
        const { data, error } = await supabase.rpc('admin_create_invite', {});
        if (error) throw error;
        result = data;
      } else {
        // Regular user has 3 invite limit
        const { data, error } = await supabase.rpc('send_invite', {});
        if (error) throw error;
        result = data;
      }

      setSuccess('Invite code generated successfully!');
      await loadInvites();
      await loadStats();
      await loadUserLimit();

      // PostHog event
      ph.capture('invite_sent', {
        invite_id: result,
        is_admin: isAdmin
      });
    } catch (err: any) {
      setError(err.message || 'Failed to create invite');
    } finally {
      setLoading(false);
    }
  };

  const checkAdmin = async () => {
    try {
      const { data, error } = await supabase.rpc('is_admin_uid');
      if (error) throw error;
      setIsAdmin(data ?? false);
    } catch (err) {
      console.error('Error checking admin status:', err);
      setIsAdmin(false);
    }
  };

  const loadInvites = async () => {
    try {
      const { data, error } = await supabase
        .from('invites')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setInvites(data || []);
    } catch (err: any) {
      console.error('Error loading invites:', err);
      setError(err.message || 'Failed to load invites');
    }
  };

  const loadStats = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('invite_stats')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
      setStats(data || { user_id: user.id, total_sent: 0, accepted_count: 0, active_count: 0 });
    } catch (err: any) {
      console.error('Error loading stats:', err);
    }
  };

  const loadUserLimit = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      // Check admin status first
      const { data: adminStatus } = await supabase.rpc('is_admin_uid');
      if (adminStatus) return; // Skip for admins

      // Get user's SW level and limit
      const { data: limit, error: limitError } = await supabase.rpc('get_user_invite_limit', {
        user_id: user.id
      });

      if (limitError) {
        console.error('Error loading user limit:', limitError);
        return;
      }

      // Get current active invite count (excluding expired)
      const now = new Date().toISOString();
      const { data: invitesData, error: invitesError } = await supabase
        .from('invites')
        .select('id, expires_at')
        .eq('inviter_user_id', user.id)
        .in('status', ['pending', 'accepted']);

      // Filter out expired invites on client side
      const activeInvites = invitesData?.filter(invite => {
        if (!invite.expires_at) return true;
        return new Date(invite.expires_at) >= new Date(now);
      }) || [];

      const currentCount = invitesError ? 0 : activeInvites.length;

      // Determine level name
      const { data: swData } = await supabase
        .from('sw_scores')
        .select('total')
        .eq('user_id', user.id)
        .single();

      const sw = swData?.total || 0;
      let level = 'Beginner';
      if (sw >= 50000) level = 'Angel';
      else if (sw >= 10000) level = 'Leader';
      else if (sw >= 6251) level = 'Expert';
      else if (sw >= 1251) level = 'Advance';
      else if (sw >= 100) level = 'Growing';

      setUserLimit({
        limit: limit || 3,
        current_count: currentCount,
        level: level
      });
    } catch (err: any) {
      console.error('Error loading user limit:', err);
    }
  };


  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'text-yellow-500';
      case 'accepted':
        return 'text-green-500';
      case 'expired':
        return 'text-gray-500';
      case 'revoked':
        return 'text-red-500';
      default:
        return 'text-gray-400';
    }
  };

  const formatDate = (date: string | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatExpiration = (expiresAt: string | null) => {
    if (!expiresAt) return '-';
    const expires = new Date(expiresAt);
    const now = new Date();
    const diff = expires.getTime() - now.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (diff < 0) {
      return <span className="text-red-400">Expired</span>;
    }
    if (hours > 0) {
      return <span className="text-yellow-400">{hours}h {minutes}m left</span>;
    }
    return <span className="text-red-400">{minutes}m left</span>;
  };

  const handleDeleteInvite = async (inviteId: string) => {
    if (!confirm('Are you sure you want to delete this invite?')) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.rpc('delete_invite', { invite_id: inviteId });
      if (error) throw error;
      
      setSuccess('Invite deleted successfully');
      await loadInvites();
      await loadStats();
      await loadUserLimit();
    } catch (err: any) {
      setError(err.message || 'Failed to delete invite');
    } finally {
      setLoading(false);
    }
  };

  return (
    <RequireAuth>
      <div className="max-w-4xl mx-auto px-4 py-6 md:p-6">
        <h1 className="text-2xl font-semibold text-white mb-6">Invite System</h1>

        {/* Admin Notice */}
        {isAdmin && (
          <div className="mb-4 p-3 bg-green-500/20 border border-green-500/50 rounded-lg">
            <p className="text-green-300 text-sm font-semibold">👑 Admin mode: You can generate unlimited invite codes without restrictions.</p>
          </div>
        )}

        {/* Stats Cards */}
        {stats && !isAdmin && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-gray-800 p-4 rounded-lg">
              <div className="text-gray-400 text-sm mb-1">Total Sent</div>
              <div className="text-2xl font-bold text-white">{stats.total_sent}</div>
            </div>
            <div className="bg-gray-800 p-4 rounded-lg">
              <div className="text-gray-400 text-sm mb-1">Accepted</div>
              <div className="text-2xl font-bold text-green-400">{stats.accepted_count}</div>
            </div>
            <div className="bg-gray-800 p-4 rounded-lg">
              <div className="text-gray-400 text-sm mb-1">
                Active ({userLimit?.level || 'Beginner'} Level)
              </div>
              <div className="text-2xl font-bold text-yellow-400">
                {userLimit?.current_count || stats.active_count} / {userLimit?.limit || 3}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Limit based on your SW level
              </div>
            </div>
          </div>
        )}

        {/* Create Invite Form */}
        <div className="bg-gray-800 p-6 rounded-lg mb-6">
          <h2 className="text-lg font-semibold text-white mb-4">Create Invite Code</h2>
          <p className="text-gray-400 text-sm mb-4">
            Generate a unique invite code to share with friends. They can use it during registration.
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

          <button
            onClick={handleCreateInvite}
            disabled={loading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {loading ? 'Creating...' : 'Generate Invite Code'}
          </button>
        </div>

        {/* Invites List */}
        <div className="bg-gray-800 p-6 rounded-lg">
          <h2 className="text-lg font-semibold text-white mb-4">Your Invites</h2>
          {invites.length === 0 ? (
            <p className="text-gray-400">No invites yet. Send your first invite above.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-300">Invite Code</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-300">Status</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-300">Created</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-300">Expires</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-300">Accepted</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-300">Used By</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-300">SW</th>
                    {isAdmin && <th className="text-left py-3 px-4 text-sm font-medium text-gray-300">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {invites.map((invite) => (
                    <tr key={invite.id} className="border-b border-gray-700/50">
                      <td className="py-3 px-4 text-sm">
                        {invite.invite_code ? (
                          <div className="flex items-center gap-2">
                            <code className="px-3 py-1.5 bg-gray-700 text-blue-400 font-mono font-bold rounded text-base">
                              {invite.invite_code}
                            </code>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(invite.invite_code!);
                                alert('Invite code copied to clipboard!');
                              }}
                              className="px-2 py-1 text-xs text-gray-400 hover:text-white bg-gray-700 rounded transition"
                              title="Copy code"
                            >
                              📋 Copy
                            </button>
                          </div>
                        ) : (
                          <span className="text-gray-500 text-xs">Generating...</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-sm">
                        <span className={getStatusColor(invite.status)}>{invite.status}</span>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-400">{formatDate(invite.sent_at)}</td>
                      <td className="py-3 px-4 text-sm">
                        {invite.status === 'pending' ? formatExpiration(invite.expires_at) : '-'}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-400">{formatDate(invite.accepted_at)}</td>
                      <td className="py-3 px-4 text-sm text-gray-400">
                        {invite.consumed_by_user_id ? (
                          <span className="text-blue-400 font-mono text-xs">
                            {invite.consumed_by_user_id.slice(0, 8)}...
                          </span>
                        ) : (
                          <span className="text-gray-500">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-400">
                        {invite.consumed_by_user_sw !== null ? (
                          <span className="text-green-400 font-semibold">
                            {invite.consumed_by_user_sw.toFixed(0)}
                          </span>
                        ) : (
                          <span className="text-gray-500">-</span>
                        )}
                      </td>
                      {isAdmin && (
                        <td className="py-3 px-4 text-sm">
                          <button
                            onClick={() => handleDeleteInvite(invite.id)}
                            disabled={loading}
                            className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 transition"
                          >
                            Delete
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </RequireAuth>
  );
}

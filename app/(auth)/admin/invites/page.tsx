'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { ph } from '@/lib/analytics.client';
import { RequireAuth } from '@/components/RequireAuth';

interface Invite {
  id: string;
  inviter_user_id: string;
  invitee_email: string;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  created_at: string;
  sent_at: string | null;
  accepted_at: string | null;
  consumed_by_user_id: string | null;
  token: string;
}

export default function AdminInvitesPage() {
  const [email, setEmail] = useState('');
  const [targetInviterId, setTargetInviterId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    checkAdmin();
    loadInvites();
  }, []);

  const checkAdmin = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUserId(user?.id || null);

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

  const loadInvites = async () => {
    try {
      const { data, error } = await supabase
        .from('invites')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setInvites(data || []);
    } catch (err: any) {
      console.error('Error loading invites:', err);
      setError(err.message || 'Failed to load invites');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    // Client-side validation: reject any list-like patterns
    if (email.includes(',') || email.includes(';') || email.includes(' ') || email.includes('\n') || email.includes('\t')) {
      setError('Only single email allowed');
      setLoading(false);
      return;
    }

    try {
      const params: { invitee_email: string; target_inviter?: string } = {
        invitee_email: email.trim().toLowerCase()
      };

      // If target inviter ID is provided, use it; otherwise use null (will default to admin's own ID)
      if (targetInviterId.trim()) {
        params.target_inviter = targetInviterId.trim();
      }

      const { data, error } = await supabase.rpc('admin_create_invite', params);

      if (error) {
        const errorMsg = error.message || 'Failed to create invite';
        setError(errorMsg);
        return;
      }

      setSuccess('Invite created successfully!');
      setEmail('');
      setTargetInviterId('');
      await loadInvites();

      // PostHog event
      ph.capture('invite_sent', {
        invite_id: data,
        invitee_email: email.trim().toLowerCase(),
        admin_created: true,
        target_inviter: params.target_inviter || currentUserId
      });
    } catch (err: any) {
      setError(err.message || 'Failed to create invite');
    } finally {
      setLoading(false);
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

  if (isAdmin === null) {
    return (
      <RequireAuth>
        <div className="max-w-4xl mx-auto p-6">
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
      <div className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-semibold text-white mb-2">Admin: Invite Management</h1>
        <p className="text-gray-400 mb-6">Create invites without the 3 invite limit. Can specify inviter_user_id.</p>

        {/* Admin Status */}
        <div className="mb-4 p-3 bg-green-500/20 border border-green-500/50 rounded-lg">
          <p className="text-green-300 text-sm">? Admin access confirmed. You can create unlimited invites.</p>
        </div>

        {/* Create Invite Form */}
        <div className="bg-gray-800 p-6 rounded-lg mb-6">
          <h2 className="text-lg font-semibold text-white mb-4">Create Invite</h2>
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                Email Address *
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                required
                className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={loading}
              />
              <p className="mt-1 text-xs text-gray-400">
                Only single email allowed. Batch invites are not permitted.
              </p>
            </div>

            <div className="mb-4">
              <label htmlFor="targetInviter" className="block text-sm font-medium text-gray-300 mb-2">
                Target Inviter User ID (Optional)
              </label>
              <input
                type="text"
                id="targetInviter"
                value={targetInviterId}
                onChange={(e) => setTargetInviterId(e.target.value)}
                placeholder="Leave empty to use your own ID"
                className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                disabled={loading}
              />
              <p className="mt-1 text-xs text-gray-400">
                If provided, the invite will be created on behalf of this user. Otherwise, uses your admin user ID.
              </p>
            </div>

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
              type="submit"
              disabled={loading || !email.trim()}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {loading ? 'Creating...' : 'Create Invite'}
            </button>
          </form>
        </div>

        {/* All Invites List */}
        <div className="bg-gray-800 p-6 rounded-lg">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">All Invites (Last 100)</h2>
            <button
              onClick={loadInvites}
              className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition text-sm"
            >
              Refresh
            </button>
          </div>
          {invites.length === 0 ? (
            <p className="text-gray-400">No invites found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-300">Inviter ID</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-300">Email</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-300">Status</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-300">Sent</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-300">Accepted</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-300">Consumed By</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-300">Token</th>
                  </tr>
                </thead>
                <tbody>
                  {invites.map((invite) => (
                    <tr key={invite.id} className="border-b border-gray-700/50">
                      <td className="py-3 px-4 text-sm text-gray-400 font-mono text-xs">
                        {invite.inviter_user_id.substring(0, 8)}...
                      </td>
                      <td className="py-3 px-4 text-sm text-white">{invite.invitee_email}</td>
                      <td className="py-3 px-4 text-sm">
                        <span className={getStatusColor(invite.status)}>{invite.status}</span>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-400">{formatDate(invite.sent_at)}</td>
                      <td className="py-3 px-4 text-sm text-gray-400">{formatDate(invite.accepted_at)}</td>
                      <td className="py-3 px-4 text-sm text-gray-400 font-mono text-xs">
                        {invite.consumed_by_user_id ? invite.consumed_by_user_id.substring(0, 8) + '...' : '-'}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-500 font-mono text-xs">
                        {invite.token.substring(0, 8)}...
                      </td>
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

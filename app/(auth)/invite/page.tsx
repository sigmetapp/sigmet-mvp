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
}

interface InviteStats {
  user_id: string;
  total_sent: number;
  accepted_count: number;
  active_count: number;
}

export default function InvitePage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [stats, setStats] = useState<InviteStats | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    loadInvites();
    loadStats();
    checkAdmin();
  }, []);

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
      const { data, error } = await supabase.rpc('send_invite', {
        invitee_email: email.trim().toLowerCase()
      });

      if (error) {
        // Handle specific error messages
        const errorMsg = error.message || 'Failed to send invite';
        setError(errorMsg);
        return;
      }

      setSuccess('Invite sent successfully!');
      setEmail('');
      await loadInvites();
      await loadStats();

      // PostHog event
      ph.capture('invite_sent', {
        invite_id: data,
        invitee_email: email.trim().toLowerCase()
      });
    } catch (err: any) {
      setError(err.message || 'Failed to send invite');
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

  return (
    <RequireAuth>
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-semibold text-white mb-6">Invite System</h1>

        {/* Admin Notice */}
        {isAdmin && (
          <div className="mb-4 p-3 bg-blue-500/20 border border-blue-500/50 rounded-lg">
            <p className="text-blue-300 text-sm">Admin mode: You can create invites without the 3 invite limit.</p>
          </div>
        )}

        {/* Stats Cards */}
        {stats && (
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
              <div className="text-gray-400 text-sm mb-1">Active (Pending + Accepted)</div>
              <div className="text-2xl font-bold text-yellow-400">{stats.active_count} / 3</div>
            </div>
          </div>
        )}

        {/* Send Invite Form */}
        <div className="bg-gray-800 p-6 rounded-lg mb-6">
          <h2 className="text-lg font-semibold text-white mb-4">Send Invite</h2>
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                Email Address
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
              {loading ? 'Sending...' : 'Send Invite'}
            </button>
          </form>
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
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-300">Email</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-300">Invite Code</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-300">Status</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-300">Sent</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-300">Accepted</th>
                  </tr>
                </thead>
                <tbody>
                  {invites.map((invite) => (
                    <tr key={invite.id} className="border-b border-gray-700/50">
                      <td className="py-3 px-4 text-sm text-white">{invite.invitee_email}</td>
                      <td className="py-3 px-4 text-sm">
                        {invite.invite_code ? (
                          <div className="flex items-center gap-2">
                            <code className="px-2 py-1 bg-gray-700 text-blue-400 font-mono font-bold rounded text-sm">
                              {invite.invite_code}
                            </code>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(invite.invite_code!);
                                alert('Invite code copied!');
                              }}
                              className="text-xs text-gray-400 hover:text-white"
                              title="Copy code"
                            >
                              ??
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
                      <td className="py-3 px-4 text-sm text-gray-400">{formatDate(invite.accepted_at)}</td>
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

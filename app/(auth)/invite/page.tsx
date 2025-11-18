'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { ph } from '@/lib/analytics.client';
import { RequireAuth } from '@/components/RequireAuth';
import { useSiteSettings } from '@/components/SiteSettingsContext';

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
  consumed_by_username: string | null;
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

interface InviteDebugSnapshot {
  generated_at: string;
  stats: {
    total_invites: number;
    pending_invites: number;
    accepted_invites: number;
    invites_only: boolean;
  };
  recent_invites: Array<{
    invite_code: string | null;
    status: string;
    created_at: string;
    accepted_at: string | null;
    consumed_by_user_id: string | null;
  }>;
  recent_events: Array<{
    invite_code: string | null;
    event: string;
    meta: Record<string, any> | null;
    created_at: string;
  }>;
  invite?: Record<string, any> | null;
  events?: Array<Record<string, any>> | null;
}

export default function InvitePage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [stats, setStats] = useState<InviteStats | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [userLimit, setUserLimit] = useState<UserInviteLimit | null>(null);
  const { invites_only: siteInvitesOnly } = useSiteSettings();
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [debugInviteCode, setDebugInviteCode] = useState('');
  const [debugData, setDebugData] = useState<InviteDebugSnapshot | null>(null);
  const [debugLoading, setDebugLoading] = useState(false);
  const [debugError, setDebugError] = useState<string | null>(null);
  const [debugValidationResult, setDebugValidationResult] = useState<string | null>(null);
  const [debugValidationTimestamp, setDebugValidationTimestamp] = useState<string | null>(null);

  useEffect(() => {
    loadInvites();
    loadStats();
    checkAdmin();
    loadUserLimit();
  }, []);

  const normalizeDebugCode = useCallback((code: string) => {
    const trimmed = code.trim().toUpperCase();
    return trimmed.length ? trimmed : null;
  }, []);

  const refreshDebugSnapshot = useCallback(
    async (normalizedCode: string | null) => {
      if (!isAdmin) return;
      setDebugLoading(true);
      setDebugError(null);
      try {
        const { data, error } = await supabase.rpc('get_invite_debug_snapshot', {
          debug_code: normalizedCode,
        });
        if (error) throw error;
        setDebugData((data || null) as InviteDebugSnapshot | null);
      } catch (err: any) {
        console.error('Error loading invite debug snapshot:', err);
        setDebugError(err.message || 'Failed to load invite debug snapshot');
      } finally {
        setDebugLoading(false);
      }
    },
    [isAdmin]
  );

  const handleDebugRefresh = useCallback(() => {
    const normalized = normalizeDebugCode(debugInviteCode);
    refreshDebugSnapshot(normalized);
  }, [debugInviteCode, normalizeDebugCode, refreshDebugSnapshot]);

  const handleDebugValidate = useCallback(async () => {
    setDebugValidationResult(null);
    setDebugValidationTimestamp(null);
    const normalized = normalizeDebugCode(debugInviteCode);
    if (!normalized) {
      setDebugValidationResult('Enter an invite code to validate.');
      return;
    }
    try {
      const { data, error } = await supabase.rpc('validate_invite_code', {
        invite_code: normalized,
      });
      if (error) throw error;
      setDebugValidationResult(
        data ? 'Invite code is valid and pending.' : 'Invite code is invalid or already used.'
      );
      setDebugValidationTimestamp(new Date().toISOString());
    } catch (err: any) {
      console.error('Invite code validation failed:', err);
      setDebugValidationResult(err.message || 'Failed to validate invite code.');
      setDebugValidationTimestamp(new Date().toISOString());
    }
  }, [debugInviteCode, normalizeDebugCode]);

  const handleToggleDebugPanel = useCallback(() => {
    setShowDebugPanel((prev) => {
      const next = !prev;
      if (!prev && isAdmin) {
        const normalized = normalizeDebugCode(debugInviteCode);
        refreshDebugSnapshot(normalized);
      }
      return next;
    });
  }, [debugInviteCode, isAdmin, normalizeDebugCode, refreshDebugSnapshot]);

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

      if (isAdmin && showDebugPanel) {
        await refreshDebugSnapshot(normalizeDebugCode(debugInviteCode));
      }
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
      
      // Fetch usernames for users who consumed invites
      const userIds = (data || [])
        .map((inv: any) => inv.consumed_by_user_id)
        .filter((id: string | null): id is string => id !== null);
      
      const usernameMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, username')
          .in('user_id', userIds);
        
        profiles?.forEach((profile) => {
          if (profile.username) {
            usernameMap[profile.user_id] = profile.username;
          }
        });
      }
      
      // Transform data to include username
      const transformedData = (data || []).map((invite: any) => ({
        ...invite,
        consumed_by_username: invite.consumed_by_user_id ? usernameMap[invite.consumed_by_user_id] || null : null
      }));
      
      setInvites(transformedData);
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
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatFullDate = (date: string | null | undefined) => {
    if (!date) return '-';
    return new Date(date).toLocaleString();
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
      if (isAdmin && showDebugPanel) {
        await refreshDebugSnapshot(normalizeDebugCode(debugInviteCode));
      }
    } catch (err: any) {
      setError(err.message || 'Failed to delete invite');
    } finally {
      setLoading(false);
    }
  };

  const selectedInvite = (debugData?.invite ?? null) as Record<string, any> | null;
  const selectedInviteEvents = (debugData?.events ?? null) as Array<Record<string, any>> | null;

  return (
    <RequireAuth>
      <div className="max-w-4xl mx-auto px-0 md:px-4 py-6 md:p-6">
        <h1 className="text-2xl font-semibold text-white mb-6 px-4 md:px-0">Invite System</h1>

        {/* Admin Notice */}
        {isAdmin && (
          <div className="mb-4 p-3 bg-green-500/20 border border-green-500/50 rounded-lg mx-4 md:mx-0">
            <p className="text-green-300 text-sm font-semibold">👑 Admin mode: You can generate unlimited invite codes without restrictions.</p>
          </div>
        )}

        {/* Stats Cards */}
        {stats && !isAdmin && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 px-4 md:px-0">
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

          {/* Admin Debug Panel */}
          {isAdmin && (
            <div className="bg-gray-900 border border-gray-800 p-6 rounded-lg mb-6 mx-4 md:mx-0">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-white">Invite Debug Panel</h2>
                  <p className="text-xs text-gray-400">
                    Track validation & acceptance flow. Site invites-only:{' '}
                    <span className={siteInvitesOnly ? 'text-red-300 font-semibold' : 'text-green-300 font-semibold'}>
                      {siteInvitesOnly ? 'ENABLED' : 'DISABLED'}
                    </span>
                  </p>
                </div>
                <button
                  onClick={handleToggleDebugPanel}
                  className="px-4 py-2 text-xs font-semibold rounded-lg border border-gray-600 text-gray-200 hover:bg-gray-800 transition"
                >
                  {showDebugPanel ? 'Hide Debug Panel' : 'Show Debug Panel'}
                </button>
              </div>

              {showDebugPanel && (
                <div className="mt-4 space-y-5 text-sm">
                  <div className="grid grid-cols-1 md:grid-cols-[2fr,1fr,1fr] gap-3">
                    <input
                      type="text"
                      value={debugInviteCode}
                      onChange={(e) =>
                        setDebugInviteCode(
                          e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12)
                        )
                      }
                      placeholder="Enter invite code to inspect"
                      className="w-full px-3 py-2 bg-gray-800 text-white border border-gray-700 rounded-lg font-mono text-xs"
                    />
                    <button
                      onClick={handleDebugValidate}
                      className="px-3 py-2 bg-gray-800 text-gray-200 border border-gray-700 rounded-lg hover:bg-gray-700 transition text-xs"
                    >
                      Validate Code
                    </button>
                    <button
                      onClick={handleDebugRefresh}
                      disabled={debugLoading}
                      className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-xs transition"
                    >
                      {debugLoading ? 'Refreshing...' : 'Refresh Snapshot'}
                    </button>
                  </div>

                  {debugValidationResult && (
                    <div className="text-xs text-gray-300">
                      <span className="font-semibold">Validation:</span> {debugValidationResult}
                      {debugValidationTimestamp && (
                        <span className="ml-2 text-gray-500">
                          ({formatFullDate(debugValidationTimestamp)})
                        </span>
                      )}
                    </div>
                  )}

                  {debugError && (
                    <div className="p-3 bg-red-500/10 border border-red-500/40 rounded-lg text-xs text-red-300">
                      {debugError}
                    </div>
                  )}

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-gray-800 p-3 rounded-lg">
                      <div className="text-xs text-gray-400">Total Invites</div>
                      <div className="text-lg font-semibold text-white">
                        {debugData?.stats?.total_invites ?? '—'}
                      </div>
                    </div>
                    <div className="bg-gray-800 p-3 rounded-lg">
                      <div className="text-xs text-gray-400">Pending (DB)</div>
                      <div className="text-lg font-semibold text-yellow-300">
                        {debugData?.stats?.pending_invites ?? '—'}
                      </div>
                    </div>
                    <div className="bg-gray-800 p-3 rounded-lg">
                      <div className="text-xs text-gray-400">Accepted (DB)</div>
                      <div className="text-lg font-semibold text-green-300">
                        {debugData?.stats?.accepted_invites ?? '—'}
                      </div>
                    </div>
                    <div className="bg-gray-800 p-3 rounded-lg">
                      <div className="text-xs text-gray-400">Invites-only (DB)</div>
                      <div
                        className={`text-lg font-semibold ${
                          debugData?.stats?.invites_only ? 'text-red-300' : 'text-green-300'
                        }`}
                      >
                        {debugData?.stats
                          ? debugData.stats.invites_only
                            ? 'Enabled'
                            : 'Disabled'
                          : '—'}
                      </div>
                    </div>
                  </div>

                  <div className="bg-gray-800 p-4 rounded-lg">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <h3 className="text-sm font-semibold text-white">Recent Invites</h3>
                      <span className="text-xs text-gray-500">
                        Snapshot: {formatFullDate(debugData?.generated_at)}
                      </span>
                    </div>
                    {debugLoading ? (
                      <p className="text-xs text-gray-400">Loading snapshot...</p>
                    ) : debugData?.recent_invites?.length ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-gray-400 border-b border-gray-700">
                              <th className="py-2 text-left font-medium">Code</th>
                              <th className="py-2 text-left font-medium">Status</th>
                              <th className="py-2 text-left font-medium">Created</th>
                              <th className="py-2 text-left font-medium">Accepted</th>
                              <th className="py-2 text-left font-medium">Used By</th>
                            </tr>
                          </thead>
                          <tbody>
                            {debugData.recent_invites.map((invite) => (
                              <tr key={`${invite.invite_code ?? invite.created_at}`} className="border-b border-gray-700/40">
                                <td className="py-1 font-mono">{invite.invite_code ?? '-'}</td>
                                <td className="py-1 capitalize">{invite.status}</td>
                                <td className="py-1">{formatFullDate(invite.created_at)}</td>
                                <td className="py-1">{formatFullDate(invite.accepted_at)}</td>
                                <td className="py-1 font-mono">
                                  {invite.consumed_by_user_id ? `${invite.consumed_by_user_id.slice(0, 8)}...` : '-'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400">No invite data found.</p>
                    )}
                  </div>

                  <div className="bg-gray-800 p-4 rounded-lg">
                    <h3 className="text-sm font-semibold text-white mb-3">Recent Invite Events</h3>
                    {debugLoading ? (
                      <p className="text-xs text-gray-400">Loading events...</p>
                    ) : debugData?.recent_events?.length ? (
                      <ul className="space-y-2 text-xs text-gray-300">
                        {debugData.recent_events.map((event) => (
                          <li
                            key={`${event.invite_code ?? 'unknown'}-${event.created_at}-${event.event}`}
                            className="p-3 bg-black/20 rounded-lg border border-gray-700/60"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                              <span className="font-semibold text-white">{event.event}</span>
                              <span className="text-gray-400">{formatFullDate(event.created_at)}</span>
                            </div>
                            <div className="text-gray-400 mb-1">
                              Invite: <span className="font-mono">{event.invite_code ?? '-'}</span>
                            </div>
                            {event.meta && (
                              <pre className="bg-black/30 rounded-lg p-2 text-[11px] overflow-x-auto">
                                {JSON.stringify(event.meta, null, 2)}
                              </pre>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-gray-400">No events logged yet.</p>
                    )}
                  </div>

                  <div className="bg-gray-800 p-4 rounded-lg">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <h3 className="text-sm font-semibold text-white">Selected Invite Snapshot</h3>
                      <span className="text-xs text-gray-500">
                        {debugInviteCode.trim()
                          ? `Code: ${normalizeDebugCode(debugInviteCode) ?? ''}`
                          : 'Provide invite code above'}
                      </span>
                    </div>
                    {selectedInvite ? (
                      <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-gray-300">
                          <div>
                            <div className="text-gray-400">Invite ID</div>
                            <code className="font-mono">{selectedInvite.id}</code>
                          </div>
                          <div>
                            <div className="text-gray-400">Status</div>
                            <div className="font-semibold text-white">{selectedInvite.status}</div>
                          </div>
                          <div>
                            <div className="text-gray-400">Created</div>
                            <div>{formatFullDate(selectedInvite.created_at)}</div>
                          </div>
                          <div>
                            <div className="text-gray-400">Accepted</div>
                            <div>{formatFullDate(selectedInvite.accepted_at)}</div>
                          </div>
                          <div>
                            <div className="text-gray-400">Consumed By</div>
                            <div className="font-mono">
                              {selectedInvite.consumed_by_user_id
                                ? `${selectedInvite.consumed_by_user_id.slice(0, 8)}...`
                                : '-'}
                            </div>
                          </div>
                          <div>
                            <div className="text-gray-400">Invitee Email</div>
                            <div>{selectedInvite.invitee_email ?? '-'}</div>
                          </div>
                        </div>
                        <pre className="mt-4 text-[11px] bg-black/40 p-3 rounded-lg overflow-x-auto">
                          {JSON.stringify(selectedInvite, null, 2)}
                        </pre>
                        <div className="mt-4">
                          <h4 className="text-xs font-semibold text-gray-200 mb-2">Invite Events</h4>
                          {selectedInviteEvents?.length ? (
                            <ul className="space-y-2 text-xs text-gray-300">
                              {selectedInviteEvents.map((event) => (
                                <li
                                  key={`${event.id}-${event.created_at}`}
                                  className="p-2 bg-black/20 rounded border border-gray-700/50"
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                                    <span className="font-semibold text-white">{event.event}</span>
                                    <span className="text-gray-400">{formatFullDate(event.created_at)}</span>
                                  </div>
                                  {event.meta && (
                                    <pre className="bg-black/40 rounded p-2 text-[11px] overflow-x-auto">
                                      {JSON.stringify(event.meta, null, 2)}
                                    </pre>
                                  )}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-xs text-gray-400">No events recorded for this invite yet.</p>
                          )}
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-gray-400">
                        Enter an invite code and refresh the snapshot to inspect a specific invite record.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

        {/* Create Invite Form */}
        <div className="bg-gray-800 p-6 rounded-lg mb-6 mx-4 md:mx-0">
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
        <div className="bg-gray-800 p-6 rounded-lg mx-4 md:mx-0">
          <h2 className="text-lg font-semibold text-white mb-4">Your Invites</h2>
          {invites.length === 0 ? (
            <p className="text-gray-400">No invites yet. Send your first invite above.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full table-auto">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left py-2 px-2 text-xs font-medium text-gray-300">Invite Code</th>
                    <th className="text-left py-2 px-2 text-xs font-medium text-gray-300">Status</th>
                    <th className="text-left py-2 px-2 text-xs font-medium text-gray-300">Created</th>
                    <th className="text-left py-2 px-2 text-xs font-medium text-gray-300">Expires</th>
                    <th className="text-left py-2 px-2 text-xs font-medium text-gray-300">Accepted</th>
                    <th className="text-left py-2 px-2 text-xs font-medium text-gray-300">Used By</th>
                    <th className="text-left py-2 px-2 text-xs font-medium text-gray-300">SW</th>
                    {isAdmin && <th className="text-left py-2 px-2 text-xs font-medium text-gray-300">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {invites.map((invite) => (
                    <tr key={invite.id} className="border-b border-gray-700/50">
                      <td className="py-2 px-2 text-xs">
                        {invite.invite_code ? (
                          <div className="flex items-center gap-1">
                            <code className="px-2 py-1 bg-gray-700 text-blue-400 font-mono font-semibold rounded text-xs">
                              {invite.invite_code}
                            </code>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(invite.invite_code!);
                                alert('Invite code copied to clipboard!');
                              }}
                              className="px-1.5 py-0.5 text-xs text-gray-400 hover:text-white bg-gray-700 rounded transition"
                              title="Copy code"
                            >
                              📋
                            </button>
                          </div>
                        ) : (
                          <span className="text-gray-500 text-xs">Generating...</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-xs">
                        <span className={getStatusColor(invite.status)}>{invite.status}</span>
                      </td>
                      <td className="py-2 px-2 text-xs text-gray-400 whitespace-nowrap">{formatDate(invite.sent_at)}</td>
                      <td className="py-2 px-2 text-xs">
                        {invite.status === 'pending' ? formatExpiration(invite.expires_at) : '-'}
                      </td>
                      <td className="py-2 px-2 text-xs text-gray-400 whitespace-nowrap">{formatDate(invite.accepted_at)}</td>
                      <td className="py-2 px-2 text-xs text-gray-400">
                        {invite.consumed_by_user_id ? (
                          invite.consumed_by_username ? (
                            <Link 
                              href={`/u/${encodeURIComponent(invite.consumed_by_username)}`}
                              className="text-blue-400 hover:text-blue-300 hover:underline transition"
                            >
                              {invite.consumed_by_username}
                            </Link>
                          ) : (
                            <Link 
                              href={`/u/${encodeURIComponent(invite.consumed_by_user_id)}`}
                              className="text-blue-400 hover:text-blue-300 hover:underline transition font-mono text-xs"
                            >
                              {invite.consumed_by_user_id.slice(0, 8)}...
                            </Link>
                          )
                        ) : (
                          <span className="text-gray-500">-</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-xs text-gray-400">
                        {invite.consumed_by_user_sw !== null ? (
                          <span className="text-green-400 font-semibold">
                            {invite.consumed_by_user_sw.toFixed(0)}
                          </span>
                        ) : (
                          <span className="text-gray-500">-</span>
                        )}
                      </td>
                      {isAdmin && (
                        <td className="py-2 px-2 text-xs">
                          <button
                            onClick={() => handleDeleteInvite(invite.id)}
                            disabled={loading}
                            className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 transition"
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

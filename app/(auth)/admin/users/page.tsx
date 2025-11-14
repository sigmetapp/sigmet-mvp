'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { RequireAuth } from '@/components/RequireAuth';
import { useTheme } from '@/components/ThemeProvider';
import Link from 'next/link';
import AvatarWithBadge from '@/components/AvatarWithBadge';
import { resolveAvatarUrl } from '@/lib/utils';

export default function AdminUsersPage() {
  return (
    <RequireAuth>
      <AdminUsersInner />
    </RequireAuth>
  );
}

function AdminUsersInner() {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [users, setUsers] = useState<any[] | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [usernames, setUsernames] = useState<Record<string, string>>({});
  const [actionModal, setActionModal] = useState<{
    type: 'suspend' | 'bonus' | 'penalty' | 'tf-bonus' | 'tf-penalty' | null;
    user: any | null;
  }>({ type: null, user: null });
  const [modalData, setModalData] = useState({ points: '', reason: '' });
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const email = data?.user?.email || '';
      const allowed = email === 'seosasha@gmail.com';
      setIsAdmin(allowed);
      if (!allowed && typeof window !== 'undefined') {
        window.location.href = '/';
      }
    })();
  }, []);

  async function loadUsers() {
    setLoadingUsers(true);
    try {
      const resp = await fetch('/api/admin/users.list');
      const json = await resp.json();
      if (!resp.ok) throw new Error(json?.error || 'Failed to load users');
      const list = json.users || [];
      setUsers(list);
      // Load usernames for these users so we can link to /u/{username}
      try {
        const ids: string[] = list.map((u: any) => u.id).filter(Boolean);
        if (ids.length > 0) {
          const { data } = await supabase
            .from('profiles')
            .select('user_id, username')
            .in('user_id', ids);
          const map: Record<string, string> = {};
          for (const row of ((data as any[]) || [])) {
            if (row?.user_id && row?.username && String(row.username).trim() !== '') {
              map[row.user_id as string] = row.username as string;
            }
          }
          setUsernames(map);
        } else {
          setUsernames({});
        }
      } catch {
        setUsernames({});
      }
    } catch (e) {
      setUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  }

  async function deleteUser(userId: string) {
    if (!confirm('Delete this user? This cannot be undone.')) return;
    const resp = await fetch('/api/admin/users.delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    });
    const json = await resp.json();
    if (!resp.ok) {
      alert(json?.error || 'Failed to delete');
    } else {
      setUsers((prev) => (prev ? prev.filter((u) => u.id !== userId) : prev));
    }
  }

  async function suspendUser(userId: string, suspend: boolean) {
    if (!confirm(suspend ? 'Suspend this user?' : 'Unsuspend this user?')) return;
    
    setActionLoading(true);
    try {
      const resp = await fetch('/api/admin/users.suspend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, suspend }),
      });
      const json = await resp.json();
      if (!resp.ok) {
        alert(json?.error || 'Failed to suspend user');
      } else {
        // Reload users to get updated status
        await loadUsers();
      }
    } catch (e) {
      alert('Failed to suspend user');
    } finally {
      setActionLoading(false);
    }
  }

  async function addSWBonus(userId: string, points: number, reason: string) {
    setActionLoading(true);
    try {
      const resp = await fetch('/api/admin/users.sw-bonus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, points, reason }),
      });
      const json = await resp.json();
      if (!resp.ok) {
        alert(json?.error || 'Failed to add bonus');
      } else {
        alert(`Added ${points} SW points. New total: ${json.new_total}`);
        await loadUsers();
        setActionModal({ type: null, user: null });
        setModalData({ points: '', reason: '' });
      }
    } catch (e) {
      alert('Failed to add bonus');
    } finally {
      setActionLoading(false);
    }
  }

  async function removeSWPenalty(userId: string, points: number, reason: string) {
    setActionLoading(true);
    try {
      const resp = await fetch('/api/admin/users.sw-penalty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, points, reason }),
      });
      const json = await resp.json();
      if (!resp.ok) {
        alert(json?.error || 'Failed to remove points');
      } else {
        alert(`Removed ${points} SW points. New total: ${json.new_total}`);
        await loadUsers();
        setActionModal({ type: null, user: null });
        setModalData({ points: '', reason: '' });
      }
    } catch (e) {
      alert('Failed to remove points');
    } finally {
      setActionLoading(false);
    }
  }

  async function addTFBonus(userId: string, points: number, reason: string) {
    setActionLoading(true);
    try {
      const resp = await fetch('/api/admin/users.tf-bonus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, points, reason }),
      });
      const json = await resp.json();
      if (!resp.ok) {
        alert(json?.error || 'Failed to add TF bonus');
      } else {
        alert(`Added ${points} TF points. New total: ${json.new_total.toFixed(2)}`);
        await loadUsers();
        setActionModal({ type: null, user: null });
        setModalData({ points: '', reason: '' });
      }
    } catch (e) {
      alert('Failed to add TF bonus');
    } finally {
      setActionLoading(false);
    }
  }

  async function removeTFPenalty(userId: string, points: number, reason: string) {
    setActionLoading(true);
    try {
      const resp = await fetch('/api/admin/users.tf-penalty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, points, reason }),
      });
      const json = await resp.json();
      if (!resp.ok) {
        alert(json?.error || 'Failed to remove TF points');
      } else {
        alert(`Removed ${points} TF points. New total: ${json.new_total.toFixed(2)}`);
        await loadUsers();
        setActionModal({ type: null, user: null });
        setModalData({ points: '', reason: '' });
      }
    } catch (e) {
      alert('Failed to remove TF points');
    } finally {
      setActionLoading(false);
    }
  }

  function handleModalSubmit() {
    if (!actionModal.user) return;
    
    if (actionModal.type === 'bonus') {
      const points = parseInt(modalData.points);
      if (!points || points <= 0) {
        alert('Please enter a valid positive number of points');
        return;
      }
      addSWBonus(actionModal.user.id, points, modalData.reason || 'Admin bonus');
    } else if (actionModal.type === 'penalty') {
      const points = parseInt(modalData.points);
      if (!points || points <= 0) {
        alert('Please enter a valid positive number of points');
        return;
      }
      removeSWPenalty(actionModal.user.id, points, modalData.reason || 'Rule violation');
    } else if (actionModal.type === 'tf-bonus') {
      const points = parseFloat(modalData.points);
      if (!points || points <= 0) {
        alert('Please enter a valid positive number of points');
        return;
      }
      addTFBonus(actionModal.user.id, points, modalData.reason || 'Admin bonus');
    } else if (actionModal.type === 'tf-penalty') {
      const points = parseFloat(modalData.points);
      if (!points || points <= 0) {
        alert('Please enter a valid positive number of points');
        return;
      }
      removeTFPenalty(actionModal.user.id, points, modalData.reason || 'Rule violation');
    }
  }

  if (isAdmin === null) {
    return (
      <div className={`min-h-[60vh] flex items-center justify-center ${isLight ? 'text-black/80' : 'text-white/80'}`}>
        Loading...
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-[60vh]">
      <div className={`max-w-7xl mx-auto px-4 py-6`}>
        <div className="flex items-center justify-between mb-6">
          <h1 className={`text-2xl font-semibold ${isLight ? 'text-black' : 'text-white'}`}>
            User Management
          </h1>
          <button
            onClick={loadUsers}
            disabled={loadingUsers}
            className={`px-4 py-2 rounded-xl font-medium transition ${
              isLight
                ? 'bg-primary-blue text-white hover:bg-primary-blue-dark'
                : 'bg-primary-blue text-white hover:bg-primary-blue-dark'
            } disabled:opacity-60`}
          >
            {loadingUsers ? 'Loading...' : 'Load last 30 users'}
          </button>
        </div>

        {users && (
          <div className={`rounded-xl border ${
            isLight ? 'border-black/10 bg-white/90 backdrop-blur' : 'border-white/10 bg-black/30 backdrop-blur'
          } overflow-hidden shadow-lg`}>
            <div className="divide-y divide-white/10">
              {users.map((u) => {
                const avatarUrl = resolveAvatarUrl(u.avatar_url);
                const swScore = u.sw_score || 0;
                const isSuspended = u.user_metadata?.suspended === true;
                
                return (
                  <div key={u.id} className={`flex items-center gap-4 px-4 py-4 ${
                    isLight ? 'hover:bg-black/5' : 'hover:bg-white/5'
                  } transition`}>
                    {/* Avatar */}
                    <div className="flex-shrink-0">
                      <AvatarWithBadge
                        avatarUrl={avatarUrl || ''}
                        swScore={swScore}
                        size="sm"
                      />
                    </div>
                    
                    {/* User Info */}
                    <div className={`flex-1 text-sm ${isLight ? 'text-black/80' : 'text-white/80'}`}>
                      <div className="flex items-center gap-2">
                        {usernames[u.id] ? (
                          <Link
                            href={`/u/${usernames[u.id]}`}
                            className={`font-medium hover:underline ${
                              isLight ? 'text-primary-blue' : 'text-primary-blue-light'
                            }`}
                            title="Open profile"
                          >
                            {u.email || '(no email)'}
                          </Link>
                        ) : (
                          <span className={isLight ? 'text-black' : 'text-white'}>{u.email || '(no email)'}</span>
                        )}
                        {isSuspended && (
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            isLight ? 'bg-red-100 text-red-700' : 'bg-red-500/20 text-red-300'
                          }`}>
                            Suspended
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <div className={`text-xs ${isLight ? 'text-black/50' : 'text-white/50'}`}>
                          {new Date(u.created_at).toLocaleString()}
                        </div>
                        <div className={`text-xs font-medium ${
                          isLight ? 'text-primary-blue' : 'text-primary-blue-light'
                        }`}>
                          SW: {swScore.toLocaleString()}
                        </div>
                      </div>
                    </div>
                    
                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => setActionModal({ type: 'bonus', user: u })}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                          isLight
                            ? 'border border-green-300 text-green-700 hover:bg-green-50'
                            : 'border border-green-500/30 text-green-300 hover:bg-green-500/10'
                        }`}
                        title="Add bonus SW points"
                      >
                        +SW
                      </button>
                      <button
                        onClick={() => setActionModal({ type: 'penalty', user: u })}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                          isLight
                            ? 'border border-orange-300 text-orange-700 hover:bg-orange-50'
                            : 'border border-orange-500/30 text-orange-300 hover:bg-orange-500/10'
                        }`}
                        title="Remove SW points for violation"
                      >
                        -SW
                      </button>
                      <button
                        onClick={() => setActionModal({ type: 'tf-bonus', user: u })}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                          isLight
                            ? 'border border-blue-300 text-blue-700 hover:bg-blue-50'
                            : 'border border-blue-500/30 text-blue-300 hover:bg-blue-500/10'
                        }`}
                        title="Add bonus TF (Trust Flow) points"
                      >
                        +TF
                      </button>
                      <button
                        onClick={() => setActionModal({ type: 'tf-penalty', user: u })}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                          isLight
                            ? 'border border-purple-300 text-purple-700 hover:bg-purple-50'
                            : 'border border-purple-500/30 text-purple-300 hover:bg-purple-500/10'
                        }`}
                        title="Remove TF (Trust Flow) points for violation"
                      >
                        -TF
                      </button>
                      <button
                        onClick={() => suspendUser(u.id, !isSuspended)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                          isLight
                            ? isSuspended
                              ? 'border border-blue-300 text-blue-700 hover:bg-blue-50'
                              : 'border border-yellow-300 text-yellow-700 hover:bg-yellow-50'
                            : isSuspended
                              ? 'border border-blue-500/30 text-blue-300 hover:bg-blue-500/10'
                              : 'border border-yellow-500/30 text-yellow-300 hover:bg-yellow-500/10'
                        }`}
                        title={isSuspended ? 'Unsuspend user' : 'Suspend user'}
                      >
                        {isSuspended ? 'Unsuspend' : 'Suspend'}
                      </button>
                      <button
                        onClick={() => deleteUser(u.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                          isLight
                            ? 'border border-red-300 text-red-700 hover:bg-red-50'
                            : 'border border-red-500/30 text-red-300 hover:bg-red-500/10'
                        }`}
                        title="Delete user"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {users && users.length === 0 && (
          <div className={`text-center py-8 ${isLight ? 'text-black/60' : 'text-white/60'}`}>
            No users found. Click "Load last 30 users" to load users.
          </div>
        )}

        {!users && (
          <div className={`text-center py-8 ${isLight ? 'text-black/60' : 'text-white/60'}`}>
            Click "Load last 30 users" to load users.
          </div>
        )}

        {/* Action Modal */}
        {actionModal.type && actionModal.user && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className={`rounded-xl border p-6 max-w-md w-full mx-4 ${
              isLight ? 'border-black/10 bg-white' : 'border-white/10 bg-black/90'
            }`}>
              <h2 className={`text-lg font-semibold mb-4 ${
                isLight ? 'text-black' : 'text-white'
              }`}>
                {actionModal.type === 'bonus' && 'Add Bonus SW Points'}
                {actionModal.type === 'penalty' && 'Remove SW Points (Penalty)'}
                {actionModal.type === 'tf-bonus' && 'Add Bonus TF (Trust Flow) Points'}
                {actionModal.type === 'tf-penalty' && 'Remove TF (Trust Flow) Points (Penalty)'}
              </h2>
              
              <div className={`mb-4 text-sm ${isLight ? 'text-black/70' : 'text-white/70'}`}>
                User: {actionModal.user.email || '(no email)'}
                <br />
                {actionModal.type === 'bonus' || actionModal.type === 'penalty' ? (
                  <>Current SW: {(actionModal.user.sw_score || 0).toLocaleString()}</>
                ) : (
                  <>Current TF: {(actionModal.user.trust_flow || 5.0).toFixed(2)}</>
                )}
              </div>

              <div className="space-y-4">
                <div>
                  <label className={`block text-sm font-medium mb-1 ${
                    isLight ? 'text-black/80' : 'text-white/80'
                  }`}>
                    Points {actionModal.type === 'bonus' ? 'to add' : 'to remove'}
                  </label>
                  <input
                    type="number"
                    min="0.01"
                    step={actionModal.type === 'tf-bonus' || actionModal.type === 'tf-penalty' ? "0.01" : "1"}
                    value={modalData.points}
                    onChange={(e) => setModalData({ ...modalData, points: e.target.value })}
                    className={`w-full px-3 py-2 rounded-lg border ${
                      isLight
                        ? 'border-black/20 bg-white text-black'
                        : 'border-white/20 bg-black/50 text-white'
                    } focus:outline-none focus:ring-2 focus:ring-primary-blue`}
                    placeholder={actionModal.type === 'tf-bonus' || actionModal.type === 'tf-penalty' ? "Enter TF points (e.g., 2.5)" : "Enter points"}
                  />
                </div>

                <div>
                  <label className={`block text-sm font-medium mb-1 ${
                    isLight ? 'text-black/80' : 'text-white/80'
                  }`}>
                    Reason (optional)
                  </label>
                  <textarea
                    value={modalData.reason}
                    onChange={(e) => setModalData({ ...modalData, reason: e.target.value })}
                    className={`w-full px-3 py-2 rounded-lg border ${
                      isLight
                        ? 'border-black/20 bg-white text-black'
                        : 'border-white/20 bg-black/50 text-white'
                    } focus:outline-none focus:ring-2 focus:ring-primary-blue`}
                    placeholder="Enter reason..."
                    rows={3}
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    setActionModal({ type: null, user: null });
                    setModalData({ points: '', reason: '' });
                  }}
                  disabled={actionLoading}
                  className={`flex-1 px-4 py-2 rounded-lg font-medium transition ${
                    isLight
                      ? 'border border-black/20 text-black hover:bg-black/5'
                      : 'border border-white/20 text-white hover:bg-white/5'
                  } disabled:opacity-50`}
                >
                  Cancel
                </button>
                <button
                  onClick={handleModalSubmit}
                  disabled={actionLoading || !modalData.points}
                  className={`flex-1 px-4 py-2 rounded-lg font-medium transition ${
                    actionModal.type === 'bonus'
                      ? 'bg-green-600 text-white hover:bg-green-700'
                      : actionModal.type === 'penalty'
                      ? 'bg-orange-600 text-white hover:bg-orange-700'
                      : actionModal.type === 'tf-bonus'
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-purple-600 text-white hover:bg-purple-700'
                  } disabled:opacity-50`}
                >
                  {actionLoading ? 'Processing...' : 
                    actionModal.type === 'bonus' ? 'Add Bonus' : 
                    actionModal.type === 'penalty' ? 'Remove Points' :
                    actionModal.type === 'tf-bonus' ? 'Add TF Bonus' : 'Remove TF Points'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { RequireAuth } from '@/components/RequireAuth';
import { useTheme } from '@/components/ThemeProvider';
import Link from 'next/link';

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
              {users.map((u) => (
                <div key={u.id} className={`flex items-center justify-between px-4 py-3 ${
                  isLight ? 'hover:bg-black/5' : 'hover:bg-white/5'
                } transition`}>
                  <div className={`text-sm ${isLight ? 'text-black/80' : 'text-white/80'}`}>
                    <div>
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
                    </div>
                    <div className={`text-xs mt-1 ${isLight ? 'text-black/50' : 'text-white/50'}`}>
                      {new Date(u.created_at).toLocaleString()}
                    </div>
                  </div>
                  <button
                    onClick={() => deleteUser(u.id)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                      isLight
                        ? 'border border-red-300 text-red-700 hover:bg-red-50'
                        : 'border border-red-500/30 text-red-300 hover:bg-red-500/10'
                    }`}
                  >
                    Delete
                  </button>
                </div>
              ))}
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
      </div>
    </div>
  );
}
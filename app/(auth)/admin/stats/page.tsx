'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { RequireAuth } from '@/components/RequireAuth';
import { useTheme } from '@/components/ThemeProvider';

export default function AdminStatsPage() {
  return (
    <RequireAuth>
      <AdminStatsInner />
    </RequireAuth>
  );
}

function AdminStatsInner() {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [stats, setStats] = useState<any | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

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

  async function loadStats() {
    setLoadingStats(true);
    try {
      const resp = await fetch('/api/admin/stats');
      const json = await resp.json();
      if (!resp.ok) throw new Error(json?.error || 'Failed to load stats');
      setStats(json);
    } catch (e) {
      setStats(null);
    } finally {
      setLoadingStats(false);
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
            Stats
          </h1>
          <button
            onClick={loadStats}
            disabled={loadingStats}
            className={`px-4 py-2 rounded-xl font-medium transition ${
              isLight
                ? 'bg-primary-blue text-white hover:bg-primary-blue-dark'
                : 'bg-primary-blue text-white hover:bg-primary-blue-dark'
            } disabled:opacity-60`}
          >
            {loadingStats ? 'Loading...' : 'Refresh stats'}
          </button>
        </div>

        {stats && (
          <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4`}>
            <div className={`rounded-xl border p-4 ${
              isLight ? 'border-black/10 bg-white/90 backdrop-blur' : 'border-white/10 bg-black/30 backdrop-blur'
            } shadow-lg`}>
              <div className={`text-xs mb-1 ${isLight ? 'text-black/60' : 'text-white/60'}`}>Total users</div>
              <div className={`text-xl font-semibold ${isLight ? 'text-black' : 'text-white'}`}>
                {stats.total_profiles ?? '?'}
              </div>
            </div>
            <div className={`rounded-xl border p-4 ${
              isLight ? 'border-black/10 bg-white/90 backdrop-blur' : 'border-white/10 bg-black/30 backdrop-blur'
            } shadow-lg`}>
              <div className={`text-xs mb-1 ${isLight ? 'text-black/60' : 'text-white/60'}`}>New users (24h)</div>
              <div className={`text-xl font-semibold ${isLight ? 'text-black' : 'text-white'}`}>
                {stats.new_profiles_24h ?? '?'}
              </div>
            </div>
            <div className={`rounded-xl border p-4 ${
              isLight ? 'border-black/10 bg-white/90 backdrop-blur' : 'border-white/10 bg-black/30 backdrop-blur'
            } shadow-lg`}>
              <div className={`text-xs mb-1 ${isLight ? 'text-black/60' : 'text-white/60'}`}>Posts total</div>
              <div className={`text-xl font-semibold ${isLight ? 'text-black' : 'text-white'}`}>
                {stats.posts_total ?? '?'}
              </div>
            </div>
            <div className={`rounded-xl border p-4 ${
              isLight ? 'border-black/10 bg-white/90 backdrop-blur' : 'border-white/10 bg-black/30 backdrop-blur'
            } shadow-lg`}>
              <div className={`text-xs mb-1 ${isLight ? 'text-black/60' : 'text-white/60'}`}>Posts (24h)</div>
              <div className={`text-xl font-semibold ${isLight ? 'text-black' : 'text-white'}`}>
                {stats.posts_24h ?? '?'}
              </div>
            </div>
            <div className={`rounded-xl border p-4 ${
              isLight ? 'border-black/10 bg-white/90 backdrop-blur' : 'border-white/10 bg-black/30 backdrop-blur'
            } shadow-lg`}>
              <div className={`text-xs mb-1 ${isLight ? 'text-black/60' : 'text-white/60'}`}>Comments total</div>
              <div className={`text-xl font-semibold ${isLight ? 'text-black' : 'text-white'}`}>
                {stats.comments_total ?? '?'}
              </div>
            </div>
            <div className={`rounded-xl border p-4 ${
              isLight ? 'border-black/10 bg-white/90 backdrop-blur' : 'border-white/10 bg-black/30 backdrop-blur'
            } shadow-lg`}>
              <div className={`text-xs mb-1 ${isLight ? 'text-black/60' : 'text-white/60'}`}>DM threads</div>
              <div className={`text-xl font-semibold ${isLight ? 'text-black' : 'text-white'}`}>
                {stats.dms_threads_total ?? '?'}
              </div>
            </div>
            <div className={`rounded-xl border p-4 ${
              isLight ? 'border-black/10 bg-white/90 backdrop-blur' : 'border-white/10 bg-black/30 backdrop-blur'
            } shadow-lg`}>
              <div className={`text-xs mb-1 ${isLight ? 'text-black/60' : 'text-white/60'}`}>DM messages (24h)</div>
              <div className={`text-xl font-semibold ${isLight ? 'text-black' : 'text-white'}`}>
                {stats.dms_messages_24h ?? '?'}
              </div>
            </div>
            {typeof stats.follows_total === 'number' && (
              <div className={`rounded-xl border p-4 ${
                isLight ? 'border-black/10 bg-white/90 backdrop-blur' : 'border-white/10 bg-black/30 backdrop-blur'
              } shadow-lg`}>
                <div className={`text-xs mb-1 ${isLight ? 'text-black/60' : 'text-white/60'}`}>Follows total</div>
                <div className={`text-xl font-semibold ${isLight ? 'text-black' : 'text-white'}`}>
                  {stats.follows_total}
                </div>
              </div>
            )}
            <div className={`rounded-xl border p-4 sm:col-span-2 ${
              isLight ? 'border-black/10 bg-white/90 backdrop-blur' : 'border-white/10 bg-black/30 backdrop-blur'
            } shadow-lg`}>
              <div className={`text-xs mb-1 ${isLight ? 'text-black/60' : 'text-white/60'}`}>Active users (24h)</div>
              <div className={`text-xl font-semibold ${isLight ? 'text-black' : 'text-white'}`}>
                {stats.active_users_24h ?? '?'}
              </div>
            </div>
          </div>
        )}

        {!stats && (
          <div className={`text-center py-8 ${isLight ? 'text-black/60' : 'text-white/60'}`}>
            Click "Refresh stats" to load statistics.
          </div>
        )}
      </div>
    </div>
  );
}
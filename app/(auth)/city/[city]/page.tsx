'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { RequireAuth } from '@/components/RequireAuth';
import { resolveAvatarUrl } from '@/lib/utils';

interface ProfileRow {
  user_id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  country: string | null;
}

export default function CityUsersPage() {
  return (
    <RequireAuth>
      <CityUsersInner />
    </RequireAuth>
  );
}

function CityUsersInner() {
  const params = useParams<{ city: string }>();
  const rawCity = decodeURIComponent(params?.city || '').trim();
  const city = useMemo(() => rawCity, [rawCity]);

  const AVATAR_FALLBACK =
    "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='100%' height='100%' fill='%23222'/><circle cx='32' cy='24' r='14' fill='%23555'/><rect x='12' y='44' width='40' height='12' rx='6' fill='%23555'/></svg>";

  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<ProfileRow[]>([]);

  useEffect(() => {
    if (!city) return;
    (async () => {
      setLoading(true);
      // Prefer exact match on "City, %"; fall back to contains if needed
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, username, full_name, avatar_url, country')
        .ilike('country', `${city},%`);

      let rows = (data as ProfileRow[]) || [];
      // If no exact prefix matches, try broader contains search and then filter to exact city start client-side
      if ((!rows || rows.length === 0) && !error) {
        const broader = await supabase
          .from('profiles')
          .select('user_id, username, full_name, avatar_url, country')
          .ilike('country', `%${city}%`);
        const brows = (broader.data as ProfileRow[]) || [];
        rows = brows.filter((r) => (r.country || '').toLowerCase().startsWith(`${city.toLowerCase()},`));
      }

      setUsers(rows);
      setLoading(false);
    })();
  }, [city]);

  return (
    <main className="max-w-3xl mx-auto px-4 py-6 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-white text-xl font-semibold">Users from {city}</h1>
        <Link href="/feed" className="text-white/70 hover:underline">Back to feed</Link>
      </div>

      <div className="card p-4 md:p-6">
        {loading ? (
          <div className="text-white/70">Loading…</div>
        ) : users.length === 0 ? (
          <div className="text-white/70">No users found in this city.</div>
        ) : (
          <ul className="divide-y divide-white/10">
            {users.map((u) => (
              <li key={u.user_id} className="py-3 flex items-center gap-3">
                <img
                  src={resolveAvatarUrl(u.avatar_url) ?? AVATAR_FALLBACK}
                  alt="avatar"
                  className="h-10 w-10 rounded-full object-cover border border-white/10"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-white truncate">
                    <Link
                      href={`/u/${encodeURIComponent(u.username || u.user_id)}`}
                      className="hover:underline"
                    >
                      {u.full_name || u.username || u.user_id.slice(0, 8)}
                    </Link>
                  </div>
                  <div className="text-white/60 text-sm truncate">{u.country || '—'}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

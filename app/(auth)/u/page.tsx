'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

type Profile = {
  user_id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  country: string | null;
};

export default function UsersSearchPage() {
  const AVATAR_FALLBACK =
    "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='100%' height='100%' fill='%23222'/><circle cx='32' cy='24' r='14' fill='%23555'/><rect x='12' y='44' width='40' height='12' rx='6' fill='%23555'/></svg>";
  const params = useSearchParams();
  const qCity = params.get('city')?.trim() || '';
  const qCountry = params.get('country')?.trim() || '';

  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<Profile[]>([]);

  const title = useMemo(() => {
    if (qCity) return `Users in ${qCity}`;
    if (qCountry) return `Users in ${qCountry}`;
    return 'Browse users';
  }, [qCity, qCountry]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        let query = supabase.from('profiles').select('user_id, username, full_name, avatar_url, country').order('created_at', { ascending: false });
        if (qCity) {
          // Heuristic: city stored as first part of `country` field: "City, Country"
          query = query.ilike('country', `${qCity}%,%`);
        } else if (qCountry) {
          // Match anywhere to be lenient
          query = query.ilike('country', `%${qCountry}%`);
        } else {
          query = query.limit(50);
        }
        const { data } = await query;
        setResults(((data as any[]) || []) as Profile[]);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [qCity, qCountry]);

  return (
    <main className="max-w-4xl mx-auto p-4 md:p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold text-white">{title}</h1>
        {(qCity || qCountry) && (
          <div className="text-white/60 text-sm mt-1">
            {qCity && <>City: <span className=\"text-white\">{qCity}</span></>}
            {qCity && qCountry && <span className=\"mx-2\">•</span>}
            {qCountry && <>Country: <span className=\"text-white\">{qCountry}</span></>}
          </div>
        )}
      </div>

      <div className="card card-glow p-3 md:p-4">
        {loading ? (
          <div className="text-white/70">Loading…</div>
        ) : results.length === 0 ? (
          <div className="text-white/60">No users found</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {results.map((p) => {
              const name = p.full_name || p.username || p.user_id.slice(0, 8);
              const handle = p.username ? `@${p.username}` : p.user_id.slice(0, 8);
              return (
                <Link key={p.user_id} href={`/u/${encodeURIComponent(p.username || p.user_id)}`} className="flex items-center gap-3 p-3 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.avatar_url || AVATAR_FALLBACK} alt="" className="h-10 w-10 rounded-full object-cover border border-white/10" />
                  <div className="min-w-0">
                    <div className="text-white truncate">{name}</div>
                    <div className="text-white/60 text-sm truncate">{handle}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { RequireAuth } from '@/components/RequireAuth';

export default function DmsPage() {
  return (
    <RequireAuth>
      <DmsInner />
    </RequireAuth>
  );
}

type Profile = {
  user_id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
};

function DmsInner() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [partners, setPartners] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const AVATAR_FALLBACK =
    "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='100%' height='100%' fill='%23222'/><circle cx='32' cy='24' r='14' fill='%23555'/><rect x='12' y='44' width='40' height='12' rx='6' fill='%23555'/></svg>";

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setCurrentUserId(user?.id || null);
    })();
  }, []);

  // Load recent conversation partners (from threads)
  useEffect(() => {
    if (!currentUserId) return;

    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        // Get threads where user is a participant
        const { data: participants } = await supabase
          .from('dms_thread_participants')
          .select('thread_id')
          .eq('user_id', currentUserId)
          .limit(20);

        if (cancelled || !participants || participants.length === 0) {
          setPartners([]);
          setLoading(false);
          return;
        }

        const threadIds = participants.map((p) => p.thread_id);

        // Get other participants from these threads
        const { data: otherParticipants } = await supabase
          .from('dms_thread_participants')
          .select('user_id')
          .in('thread_id', threadIds)
          .neq('user_id', currentUserId);

        if (cancelled || !otherParticipants || otherParticipants.length === 0) {
          setPartners([]);
          setLoading(false);
          return;
        }

        const partnerIds = Array.from(
          new Set(otherParticipants.map((p) => p.user_id))
        );

        // Load profiles
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, username, full_name, avatar_url')
          .in('user_id', partnerIds)
          .limit(20);

        if (!cancelled && profiles) {
          setPartners(
            profiles.map((p) => ({
              user_id: p.user_id,
              username: p.username,
              full_name: p.full_name,
              avatar_url: p.avatar_url,
            }))
          );
        }
      } catch (err) {
        console.error('Error loading partners:', err);
        if (!cancelled) setPartners([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentUserId]);

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white">Messages</h1>
      </div>

      {loading ? (
        <div className="card card-glow p-6 flex items-center justify-center">
          <div className="text-white/70">Loading conversations...</div>
        </div>
      ) : partners.length === 0 ? (
        <div className="card card-glow p-6">
          <div className="text-white/70 text-center py-8">
            No conversations yet. Start a conversation by visiting a user's profile.
          </div>
        </div>
      ) : (
        <div className="card card-glow p-4 space-y-2">
          {partners.map((partner) => {
            const name =
              partner.full_name || partner.username || partner.user_id.slice(0, 8);
            const avatar = partner.avatar_url || AVATAR_FALLBACK;

            return (
              <Link
                key={partner.user_id}
                href={`/dms/${partner.user_id}`}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={avatar}
                  alt={name}
                  className="h-12 w-12 rounded-full object-cover border border-white/10"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-white/90 font-medium truncate">{name}</div>
                  {partner.username && (
                    <div className="text-white/60 text-sm truncate">
                      @{partner.username}
                    </div>
                  )}
                </div>
                <div className="text-white/40">→</div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

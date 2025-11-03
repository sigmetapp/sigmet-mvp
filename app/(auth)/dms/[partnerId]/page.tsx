'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { RequireAuth } from '@/components/RequireAuth';
import DmsChatWindow from '../DmsChatWindow';

export default function DmPage() {
  return (
    <RequireAuth>
      <DmPageInner />
    </RequireAuth>
  );
}

type Profile = {
  user_id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
};

function DmPageInner() {
  const params = useParams<{ partnerId: string }>();
  const partnerId = params?.partnerId as string;

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
    <div className="flex flex-col md:flex-row gap-4 h-[calc(100vh-120px)]">
      {/* Partners list - left side */}
      <div className="w-full md:w-80 flex-shrink-0">
        <div className="card card-glow h-full flex flex-col">
          <div className="px-4 py-3 border-b border-white/10">
            <Link href="/dms" className="text-lg font-semibold text-white hover:text-white/80">
              Messages
            </Link>
          </div>

          <div className="flex-1 overflow-y-auto smooth-scroll p-2">
            {loading ? (
              <div className="text-white/70 text-sm py-4 text-center">
                Loading conversations...
              </div>
            ) : partners.length === 0 ? (
              <div className="text-white/70 text-sm py-8 text-center">
                No conversations yet.
                <br />
                Start a conversation by visiting a user's profile.
              </div>
            ) : (
              <div className="space-y-1">
                {partners.map((p) => {
                  const name =
                    p.full_name || p.username || p.user_id.slice(0, 8);
                  const avatar = p.avatar_url || AVATAR_FALLBACK;
                  const isSelected = partnerId === p.user_id;

                  return (
                    <Link
                      key={p.user_id}
                      href={`/dms/${p.user_id}`}
                      className={`w-full text-left p-3 rounded-xl flex items-center gap-3 transition block ${
                        isSelected
                          ? 'bg-white/10 border border-white/20'
                          : 'hover:bg-white/5 border border-transparent'
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={avatar}
                        alt={name}
                        className="h-10 w-10 rounded-full object-cover border border-white/10 flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-white/90 font-medium truncate">{name}</div>
                        {p.username && (
                          <div className="text-white/60 text-sm truncate">
                            @{p.username}
                          </div>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chat window - right side */}
      <div className="flex-1 min-w-0">
        <DmsChatWindow partnerId={partnerId} />
      </div>
    </div>
  );
}

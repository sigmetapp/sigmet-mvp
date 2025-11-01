'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { RequireAuth } from '@/components/RequireAuth';
import DmsChatWindow from './DmsChatWindow';

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
  thread_id?: number | null;
  messages24h?: number;
};

function DmsInner() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [partners, setPartners] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);

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
          setSelectedPartnerId(null);
          setLoading(false);
          return;
        }

        const threadIds = participants.map((p) => p.thread_id);

        // Get other participants from these threads
        const { data: otherParticipants } = await supabase
          .from('dms_thread_participants')
          .select('user_id, thread_id')
          .in('thread_id', threadIds)
          .neq('user_id', currentUserId);

        if (cancelled || !otherParticipants || otherParticipants.length === 0) {
          setPartners([]);
          setSelectedPartnerId(null);
          setLoading(false);
          return;
        }

        const partnerThreadMap = new Map<string, number>();
        for (const participant of otherParticipants) {
          const threadIdValue = participant.thread_id;
          const normalizedThreadId =
            typeof threadIdValue === 'string'
              ? Number.parseInt(threadIdValue, 10)
              : threadIdValue;

          if (
            typeof normalizedThreadId === 'number' &&
            Number.isFinite(normalizedThreadId) &&
            !partnerThreadMap.has(participant.user_id)
          ) {
            partnerThreadMap.set(participant.user_id, normalizedThreadId);
          }
        }

        const partnerIds = Array.from(partnerThreadMap.keys());

        // Load profiles
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, username, full_name, avatar_url')
          .in('user_id', partnerIds)
          .limit(20);

        if (!cancelled && profiles) {
          const { data: threadMeta } = await supabase
            .from('dms_threads')
            .select('id, last_message_at, created_at')
            .in('id', threadIds);

          const threadMetaMap = new Map<number, { last_message_at: string | null; created_at: string }>();
          for (const meta of threadMeta || []) {
            const metaId = typeof meta.id === 'string' ? Number.parseInt(meta.id, 10) : meta.id;
            if (typeof metaId === 'number' && Number.isFinite(metaId)) {
              threadMetaMap.set(metaId, {
                last_message_at: meta.last_message_at ?? null,
                created_at: meta.created_at,
              });
            }
          }

          const basePartners = profiles
            .map((p) => {
              const threadId = partnerThreadMap.get(p.user_id) ?? null;
              const meta = threadId ? threadMetaMap.get(threadId) : null;
              return {
                user_id: p.user_id,
                username: p.username,
                full_name: p.full_name,
                avatar_url: p.avatar_url,
                thread_id: threadId,
                messages24h: undefined,
                last_message_at: meta?.last_message_at ?? null,
                created_at: meta?.created_at ?? null,
              };
            })
            .sort((a, b) => {
              const lastA = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
              const lastB = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
              if (lastA !== lastB) return lastB - lastA;
              const createdA = a.created_at ? new Date(a.created_at).getTime() : 0;
              const createdB = b.created_at ? new Date(b.created_at).getTime() : 0;
              return createdB - createdA;
            })
            .map(({ last_message_at: _last, created_at: _created, ...rest }) => rest);

          setPartners(basePartners);
          setSelectedPartnerId((prev) => prev ?? basePartners[0]?.user_id ?? null);

          const last24h = new Date();
          last24h.setHours(last24h.getHours() - 24);

          void Promise.all(
            basePartners.map(async (partner) => {
              const threadId = partner.thread_id;
              if (!threadId) {
                return { user_id: partner.user_id, count: 0 };
              }
              try {
                const { count } = await supabase
                  .from('dms_messages')
                  .select('*', { count: 'exact', head: true })
                  .eq('thread_id', threadId)
                  .in('sender_id', [currentUserId, partner.user_id])
                  .gte('created_at', last24h.toISOString());

                return { user_id: partner.user_id, count: count || 0 };
              } catch (err) {
                console.error('Error loading message count for partner:', err);
                return { user_id: partner.user_id, count: 0 };
              }
            })
          ).then((counts) => {
            if (cancelled || !counts) return;
            setPartners((prev) =>
              prev.map((partner) => {
                const match = counts.find((c) => c.user_id === partner.user_id);
                if (!match) return partner;
                return {
                  ...partner,
                  messages24h: match.count,
                };
              })
            );
          });
        }
      } catch (err) {
        console.error('Error loading partners:', err);
        if (!cancelled) {
          setPartners([]);
          setSelectedPartnerId(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentUserId]);

  function handlePartnerClick(partnerId: string) {
    setSelectedPartnerId(partnerId);
    // Don't change URL - keep it as /dms/ to avoid page reload
  }

  return (
    <div className="flex gap-4 h-[calc(100vh-120px)]">
      {/* Partners list - left side */}
      <div className="w-80 flex-shrink-0">
        <div className="card card-glow h-full flex flex-col">
          <div className="px-4 py-3 border-b border-white/10">
            <h1 className="text-lg font-semibold text-white">Messages</h1>
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
                {partners.map((partner) => {
                  const name =
                    partner.full_name || partner.username || partner.user_id.slice(0, 8);
                  const avatar = partner.avatar_url || AVATAR_FALLBACK;
                  const isSelected = selectedPartnerId === partner.user_id;

                  return (
                    <button
                      key={partner.user_id}
                      onClick={() => handlePartnerClick(partner.user_id)}
                      className={`w-full text-left p-3 rounded-xl flex items-center gap-3 transition ${
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
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-white/90 font-medium truncate">{name}</div>
                            {partner.username && (
                              <div className="text-white/60 text-sm truncate">
                                @{partner.username}
                              </div>
                            )}
                          </div>
                          {partner.messages24h !== undefined && partner.messages24h > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 whitespace-nowrap shrink-0">
                              <span className="text-xs leading-none" role="img" aria-label="speech">{'\uD83D\uDCAC'}</span>
                              {partner.messages24h}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chat window - right side */}
      <div className="flex-1 min-w-0">
        {selectedPartnerId ? (
          <DmsChatWindow partnerId={selectedPartnerId} />
        ) : (
          <div className="card card-glow h-full flex items-center justify-center">
            <div className="text-white/70 text-center">
              <div className="text-lg mb-2">Select a conversation</div>
              <div className="text-sm">Choose a user from the list to start messaging</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

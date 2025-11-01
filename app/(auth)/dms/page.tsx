'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
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
  const searchParams = useSearchParams();
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

  // Load all conversation partners (from threads with messages) + mutual follows
  useEffect(() => {
    if (!currentUserId) return;

    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        // Helper to normalize thread IDs
        const normalizeThreadId = (id: number | string | null | undefined): number | null => {
          if (id === null || id === undefined) return null;
          const numId = typeof id === 'string' ? Number.parseInt(id, 10) : id;
          return typeof numId === 'number' && Number.isFinite(numId) ? numId : null;
        };

        // Step 1: Get all partners from threads that have messages
        // Find all threads where user is a participant AND there are messages
        const { data: userThreads } = await supabase
          .from('dms_thread_participants')
          .select('thread_id')
          .eq('user_id', currentUserId);

        const partnerThreadMap = new Map<string, number>();
        const allPartnerIds = new Set<string>();

        if (userThreads && userThreads.length > 0) {
          const threadIds = userThreads
            .map((t) => normalizeThreadId(t.thread_id))
            .filter((id): id is number => id !== null);

          if (threadIds.length > 0) {
            // Get threads that have messages
            const { data: threadsWithMessages } = await supabase
              .from('dms_messages')
              .select('thread_id')
              .in('thread_id', threadIds);

            const threadsWithMessagesSet = new Set<number>();
            if (threadsWithMessages) {
              for (const msg of threadsWithMessages) {
                const tid = normalizeThreadId(msg.thread_id);
                if (tid !== null) {
                  threadsWithMessagesSet.add(tid);
                }
              }
            }

            // Get other participants from threads with messages
            const { data: otherParticipants } = await supabase
              .from('dms_thread_participants')
              .select('user_id, thread_id')
              .in('thread_id', Array.from(threadsWithMessagesSet))
              .neq('user_id', currentUserId);

            if (otherParticipants) {
              for (const participant of otherParticipants) {
                const threadId = normalizeThreadId(participant.thread_id);
                const userId = participant.user_id as string;
                if (threadId !== null && userId && !partnerThreadMap.has(userId)) {
                  partnerThreadMap.set(userId, threadId);
                  allPartnerIds.add(userId);
                }
              }
            }
          }
        }

        // Step 2: Get mutual follows (users I follow AND who follow me)
        try {
          const [{ data: iFollowRows }, { data: followMeRows }] = await Promise.all([
            supabase
              .from('follows')
              .select('followee_id')
              .eq('follower_id', currentUserId),
            supabase
              .from('follows')
              .select('follower_id')
              .eq('followee_id', currentUserId),
          ]);

          const iFollowSet = new Set<string>();
          const followMeSet = new Set<string>();

          if (iFollowRows) {
            for (const row of iFollowRows) {
              const userId = row.followee_id as string;
              if (userId && userId !== currentUserId) {
                iFollowSet.add(userId);
              }
            }
          }

          if (followMeRows) {
            for (const row of followMeRows) {
              const userId = row.follower_id as string;
              if (userId && userId !== currentUserId) {
                followMeSet.add(userId);
              }
            }
          }

          // Add mutual follows (users who are in both sets)
          for (const userId of iFollowSet) {
            if (followMeSet.has(userId) && !partnerThreadMap.has(userId)) {
              allPartnerIds.add(userId);
              // For mutual follows without existing thread, set thread_id to null
            }
          }
        } catch (followErr) {
          console.warn('Error loading mutual follows (follows table may not exist):', followErr);
        }

        if (cancelled) return;

        // Step 3: Load profiles for all partners
        const partnerIdsArray = Array.from(allPartnerIds);
        
        if (partnerIdsArray.length === 0) {
          setPartners([]);
          setSelectedPartnerId(null);
          setLoading(false);
          return;
        }

        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, username, full_name, avatar_url')
          .in('user_id', partnerIdsArray);

        if (cancelled || !profiles) {
          setPartners([]);
          setSelectedPartnerId(null);
          setLoading(false);
          return;
        }

        // Step 4: Get thread metadata for partners with threads
        const threadIdsForMeta = Array.from(partnerThreadMap.values());
        let threadMetaMap = new Map<number, { last_message_at: string | null; created_at: string }>();

        if (threadIdsForMeta.length > 0) {
          const { data: threadMeta } = await supabase
            .from('dms_threads')
            .select('id, last_message_at, created_at')
            .in('id', threadIdsForMeta);

          if (threadMeta) {
            for (const meta of threadMeta) {
              const metaId = normalizeThreadId(meta.id);
              if (metaId !== null) {
                threadMetaMap.set(metaId, {
                  last_message_at: meta.last_message_at ?? null,
                  created_at: meta.created_at,
                });
              }
            }
          }
        }

        // Step 5: Build partners list
        const basePartners = profiles
          .map((p) => {
            const userId = p.user_id;
            const threadId = partnerThreadMap.get(userId) ?? null;
            const meta = threadId ? threadMetaMap.get(threadId) : null;
            return {
              user_id: userId,
              username: p.username,
              full_name: p.full_name,
              avatar_url: p.avatar_url,
              thread_id: threadId,
              messages24h: undefined as number | undefined,
              last_message_at: meta?.last_message_at ?? null,
              created_at: meta?.created_at ?? null,
            };
          })
          .sort((a, b) => {
            // Sort by: last message (desc), then created (desc), then mutual follows at the end
            const hasMessagesA = a.thread_id !== null;
            const hasMessagesB = b.thread_id !== null;
            
            if (hasMessagesA && !hasMessagesB) return -1;
            if (!hasMessagesA && hasMessagesB) return 1;

            const lastA = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
            const lastB = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
            if (lastA !== lastB) return lastB - lastA;
            
            const createdA = a.created_at ? new Date(a.created_at).getTime() : 0;
            const createdB = b.created_at ? new Date(b.created_at).getTime() : 0;
            return createdB - createdA;
          })
          .map(({ last_message_at: _last, created_at: _created, ...rest }) => rest);

        setPartners(basePartners);

        // Step 6: Handle query params
        const partnerIdFromQuery = searchParams.get('partnerId');
        if (partnerIdFromQuery) {
          const existingPartner = basePartners.find((p) => p.user_id === partnerIdFromQuery);
          if (existingPartner) {
            setSelectedPartnerId(partnerIdFromQuery);
          } else {
            // Load profile for the partner from query params
            try {
              const { data: profile } = await supabase
                .from('profiles')
                .select('user_id, username, full_name, avatar_url')
                .eq('user_id', partnerIdFromQuery)
                .maybeSingle();

              if (profile && !cancelled) {
                const newPartner: Profile = {
                  ...profile,
                  thread_id: null,
                  messages24h: undefined,
                };
                setPartners((prev) => [newPartner, ...prev]);
                setSelectedPartnerId(partnerIdFromQuery);
              } else if (!cancelled) {
                setSelectedPartnerId(partnerIdFromQuery);
              }
            } catch (err) {
              console.error('Error loading partner from query:', err);
              if (!cancelled) {
                setSelectedPartnerId(partnerIdFromQuery);
              }
            }
          }
        } else {
          setSelectedPartnerId((prev) => prev ?? basePartners[0]?.user_id ?? null);
        }

        // Step 7: Load 24h message counts for partners with threads
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
                .is('deleted_at', null)
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
  }, [currentUserId, searchParams]);

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

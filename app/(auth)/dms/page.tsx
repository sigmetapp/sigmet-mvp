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
          // Load message counts for last 24 hours for each partner
          const profilesWithCounts = await Promise.all(
            profiles.map(async (p) => {
              try {
                // Find common thread between current user and partner
                const { data: partnerThreads } = await supabase
                  .from('dms_thread_participants')
                  .select('thread_id')
                  .eq('user_id', p.user_id)
                  .in('thread_id', threadIds);
                
                if (partnerThreads && partnerThreads.length > 0) {
                  // Get the first common thread
                  const commonThreadId = partnerThreads[0].thread_id;
                  const last24h = new Date();
                  last24h.setHours(last24h.getHours() - 24);
                  
                  const { count } = await supabase
                    .from('dms_messages')
                    .select('*', { count: 'exact', head: true })
                    .eq('thread_id', commonThreadId)
                    .in('sender_id', [currentUserId, p.user_id])
                    .gte('created_at', last24h.toISOString());
                  
                  return {
                    user_id: p.user_id,
                    username: p.username,
                    full_name: p.full_name,
                    avatar_url: p.avatar_url,
                    messages24h: count || 0,
                  };
                }
              } catch (err) {
                console.error('Error loading message count for partner:', err);
              }
              
              return {
                user_id: p.user_id,
                username: p.username,
                full_name: p.full_name,
                avatar_url: p.avatar_url,
                messages24h: 0,
              };
            })
          );
          
          setPartners(profilesWithCounts);
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

  function handlePartnerClick(partnerId: string) {
    setSelectedPartnerId(partnerId);
    // Don't change URL - keep it as /dms/ to avoid page reload
  }

  return (
    <div className="flex gap-4 h-full overflow-hidden">
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
                              <span className="text-xs leading-none" role="img" aria-label="speech">💬</span>
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

"use client";

import { useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';

async function finalizeInviteAcceptance(user: User) {
  const metadata = (user.user_metadata || {}) as Record<string, any>;
  const inviteCode = metadata.invite_code;
  const inviteSynced = Boolean(metadata.invite_synced || metadata.invite_completed);

  if (!inviteCode || inviteSynced) {
    return;
  }

  try {
    const { data: inviteId, error } = await supabase.rpc('accept_invite_by_code', {
      invite_code: inviteCode,
    });

    if (error) {
      console.warn('Failed to sync invite acceptance:', error);
      return;
    }

    if (inviteId) {
      try {
        await supabase.auth.updateUser({
          data: {
            invite_synced: true,
          },
        });
      } catch (updateErr) {
        console.warn('Failed to mark invite as synced in metadata:', updateErr);
      }

      try {
        const { trackInviteAccepted } = await import('@/lib/invite-tracking');
        await trackInviteAccepted(inviteId, user.id);
      } catch (trackErr) {
        console.warn('Failed to track invite acceptance:', trackErr);
      }
    }
  } catch (err) {
    console.error('Unexpected error while finalizing invite:', err);
  }
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const completedSyncRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
        return;
      }

      if (!completedSyncRef.current) {
        completedSyncRef.current = true;
        await finalizeInviteAcceptance(user);
      }

      if (!cancelled) {
        setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) return null;
  return <>{children}</>;
}

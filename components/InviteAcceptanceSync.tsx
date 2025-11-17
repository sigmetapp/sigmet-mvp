'use client';

import { useEffect, useRef } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';
import { trackInviteAccepted } from '@/lib/invite-tracking';

export default function InviteAcceptanceSync() {
  const attempted = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    const markInviteConsumed = async (user: User | null) => {
      if (cancelled || !user) return;

      const inviteCodeRaw =
        (user.user_metadata as Record<string, any> | null)?.invite_code;
      const inviteCode =
        typeof inviteCodeRaw === 'string'
          ? inviteCodeRaw.trim().toUpperCase()
          : null;
      const alreadyConsumed =
        (user.user_metadata as Record<string, any> | null)
          ?.invite_consumed_at ?? null;

      if (!inviteCode || alreadyConsumed) {
        return;
      }

      if (attempted.current.has(user.id)) {
        return;
      }
      attempted.current.add(user.id);

      try {
        const response = await fetch('/api/invite/accept', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            inviteCode,
            userId: user.id,
          }),
        });

        if (response.ok) {
          const payload = (await response.json()) as { inviteId?: string };
          if (payload?.inviteId) {
            await trackInviteAccepted(payload.inviteId, user.id);
          }
          await supabase.auth.updateUser({
            data: { invite_consumed_at: new Date().toISOString() },
          });
        } else if (response.status === 409) {
          await supabase.auth.updateUser({
            data: { invite_consumed_at: new Date().toISOString() },
          });
        } else {
          const payload = await response.json().catch(() => null);
          console.warn('InviteAcceptanceSync API error', {
            status: response.status,
            payload,
          });
          attempted.current.delete(user.id);
        }
      } catch (error) {
        console.warn('InviteAcceptanceSync exception', error);
        attempted.current.delete(user.id);
      }
    };

    const bootstrap = async () => {
      const { data } = await supabase.auth.getUser();
      await markInviteConsumed(data?.user ?? null);
    };

    bootstrap();

    const { data } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN') {
          await markInviteConsumed(session?.user ?? null);
        }
      }
    );

    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, []);

  return null;
}

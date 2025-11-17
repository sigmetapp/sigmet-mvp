'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function AuthCallbackPage() {
  const router = useRouter();
  const [message, setMessage] = useState('Finishing sign-in...');

  useEffect(() => {
    let timeout: any;

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        router.replace('/feed');
      }
    });

    (async () => {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        // Check if user has invite_code in metadata and process it if not already accepted
        const inviteCode = (data.user.user_metadata as any)?.invite_code;
        if (inviteCode) {
          try {
            // Check if invite was already accepted
            const { data: existingInvite } = await supabase
              .from('invites')
              .select('id, status, consumed_by_user_id')
              .eq('invite_code', inviteCode.toUpperCase())
              .single();
            
            // If invite exists and not yet accepted by this user, accept it
            if (existingInvite && existingInvite.status === 'pending') {
              const { data: inviteId, error: acceptErr } = await supabase.rpc(
                'accept_invite_by_code',
                { invite_code: inviteCode.toUpperCase() }
              );
              
              if (!acceptErr && inviteId) {
                const { trackInviteAccepted } = await import('@/lib/invite-tracking');
                await trackInviteAccepted(inviteId, data.user.id);
              }
            } else if (existingInvite && existingInvite.status === 'accepted' && existingInvite.consumed_by_user_id !== data.user.id) {
              // Invite was already accepted by someone else - this shouldn't happen, but handle gracefully
              console.warn('Invite code was already used by another user');
            }
          } catch (err) {
            console.warn('Error processing invite code in callback:', err);
            // Don't block user from proceeding if invite processing fails
          }
        }
        router.replace('/feed');
      } else {
        timeout = setTimeout(async () => {
          const { data: again } = await supabase.auth.getUser();
          if (again.user) {
            // Same invite code processing for retry
            const inviteCode = (again.user.user_metadata as any)?.invite_code;
            if (inviteCode) {
              try {
                const { data: existingInvite } = await supabase
                  .from('invites')
                  .select('id, status, consumed_by_user_id')
                  .eq('invite_code', inviteCode.toUpperCase())
                  .single();
                
                if (existingInvite && existingInvite.status === 'pending') {
                  const { data: inviteId, error: acceptErr } = await supabase.rpc(
                    'accept_invite_by_code',
                    { invite_code: inviteCode.toUpperCase() }
                  );
                  
                  if (!acceptErr && inviteId) {
                    const { trackInviteAccepted } = await import('@/lib/invite-tracking');
                    await trackInviteAccepted(inviteId, again.user.id);
                  }
                }
              } catch (err) {
                console.warn('Error processing invite code in callback retry:', err);
              }
            }
            router.replace('/feed');
          } else {
            setMessage('You can close this tab and return to the app.');
          }
        }, 2500);
      }
    })();

    return () => {
      listener.subscription.unsubscribe();
      if (timeout) clearTimeout(timeout);
    };
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center text-white/80">
        <div className="mx-auto mb-4 h-8 w-8 rounded-full border-2 border-white/30 border-t-transparent animate-spin" />
        <div>{message}</div>
      </div>
    </div>
  );
}

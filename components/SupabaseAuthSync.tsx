'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

// Keeps server-side auth in sync by mirroring Supabase session tokens into HTTP-only cookies
export default function SupabaseAuthSync() {
  useEffect(() => {
    let mounted = true;

    const sync = async () => {
      const { data } = await supabase.auth.getSession();
      await fetch('/api/auth/set-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ event: 'INITIAL', session: data.session ?? null }),
      });
    };

    // Initial sync
    sync();

    const { data: subscription } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      await fetch('/api/auth/set-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ event, session }),
      });
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  return null;
}

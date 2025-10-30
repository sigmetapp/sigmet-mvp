"use client";
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
      } else {
        setReady(true);
      }
    })();
  }, []);

  if (!ready) return null;
  return <>{children}</>;
}

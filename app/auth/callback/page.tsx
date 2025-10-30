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
        router.replace('/feed');
      } else {
        timeout = setTimeout(async () => {
          const { data: again } = await supabase.auth.getUser();
          if (again.user) {
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

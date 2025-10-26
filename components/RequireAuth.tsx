import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/router';

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) router.replace('/auth');
      else setReady(true);
    })();
  }, [router]);

  if (!ready) return null;
  return <>{children}</>;
}

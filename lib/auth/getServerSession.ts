import { cookies } from 'next/headers';
import { createClient, type Session, type User } from '@supabase/supabase-js';

export type ServerSession = {
  session: Session | null;
  user: User | null;
};

function getAccessTokenFromCookies(): string | undefined {
  const store = cookies();

  // Common cookie names used in Supabase setups
  const direct = store.get('sb-access-token')?.value || store.get('access-token')?.value;
  if (direct) return direct;

  // Try to find a cookie like sb-<ref>-auth-token (set by auth helpers)
  const maybeAuthToken = store
    .getAll()
    .find((c) => c.name.startsWith('sb-') && c.name.endsWith('-auth-token'))?.value;

  if (maybeAuthToken) {
    try {
      const parsed = JSON.parse(maybeAuthToken) as { access_token?: string };
      if (parsed?.access_token) return parsed.access_token;
    } catch {
      // ignore JSON parse errors
    }
  }

  return undefined;
}

export async function getServerSession(): Promise<ServerSession> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

  const accessToken = getAccessTokenFromCookies();
  const headers: Record<string, string> = {};
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  const supabase = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers },
  });

  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return { session: null, user: null };

  // Build a minimal Session-like object when we only have user
  const { data: sess } = await supabase.auth.getSession();
  return { session: sess.session ?? null, user: data.user };
}

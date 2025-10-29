import type { NextApiRequest } from 'next';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

export type AuthedClient = {
  client: SupabaseClient;
  user: User;
};

function getAccessTokenFromRequest(req: NextApiRequest): string | undefined {
  const authHeader = req.headers['authorization'] || req.headers['Authorization' as any];
  if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7);
  }
  // Attempt cookie-based token extraction (common with Supabase SSR setups)
  const cookieToken = (req.cookies?.['sb-access-token'] as string | undefined) ||
    (req.cookies?.['access-token'] as string | undefined);
  return cookieToken;
}

export function createSupabaseForRequest(req: NextApiRequest): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
  const accessToken = getAccessTokenFromRequest(req);

  const headers: Record<string, string> = {};
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers },
  });
}

export async function getAuthedClient(req: NextApiRequest): Promise<AuthedClient> {
  const client = createSupabaseForRequest(req);
  const { data, error } = await client.auth.getUser();
  if (error || !data?.user) {
    throw Object.assign(new Error('Unauthorized'), { status: 401 });
  }
  return { client, user: data.user };
}

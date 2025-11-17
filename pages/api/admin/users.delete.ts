import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient, type PostgrestError } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabaseServer';

const ADMIN_EMAILS = new Set<string>(['seosasha@gmail.com']);

type SupabaseAdminClient = ReturnType<typeof supabaseAdmin>;

const USER_GENERATED_TABLES: Array<{ table: string; columns: string[] }> = [
  { table: 'post_likes', columns: ['user_id'] },
  { table: 'post_reactions', columns: ['user_id'] },
  { table: 'comments', columns: ['author_id', 'user_id'] },
  { table: 'posts', columns: ['author_id', 'user_id'] },
];

function isMissingRelationError(error: PostgrestError | null): boolean {
  if (!error) return false;
  if (error.code === '42P01') return true;
  const message = `${error.message || ''} ${error.details || ''}`.toLowerCase();
  return message.includes('relation') && message.includes('does not exist');
}

function isMissingColumnError(error: PostgrestError | null): boolean {
  if (!error) return false;
  if (error.code === '42703') return true;
  const message = `${error.message || ''} ${error.details || ''}`.toLowerCase();
  return message.includes('column') && message.includes('does not exist');
}

async function deleteUserGeneratedContent(client: SupabaseAdminClient, userId: string) {
  for (const { table, columns } of USER_GENERATED_TABLES) {
    let deleted = false;
    for (const column of columns) {
      const { error } = await client.from(table).delete().eq(column, userId);
      if (!error) {
        deleted = true;
        break;
      }
      if (isMissingRelationError(error) || isMissingColumnError(error)) {
        continue;
      }
      console.error(`Failed to delete ${table} (${column}) for user ${userId}`, error);
      throw new Error(`Failed to delete ${table} for user`);
    }

    // If all attempts failed because columns were missing, log for visibility but continue
    if (!deleted && columns.length > 0) {
      console.warn(`Skipped deleting from ${table} for user ${userId} because none of the expected columns exist`);
    }
  }
}

function getAccessTokenFromRequest(req: NextApiRequest): string | undefined {
  const cookie = req.headers.cookie || '';
  const map = new Map<string, string>();
  cookie.split(';').forEach((p) => {
    const [k, ...rest] = p.trim().split('=');
    if (!k) return;
    map.set(k, decodeURIComponent(rest.join('=')));
  });
  const direct = map.get('sb-access-token') || map.get('access-token');
  if (direct) return direct;
  for (const [k, v] of map.entries()) {
    if (k.startsWith('sb-') && k.endsWith('-auth-token')) {
      try {
        const parsed = JSON.parse(v) as { access_token?: string };
        if (parsed?.access_token) return parsed.access_token;
      } catch {}
    }
  }
  return undefined;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
    const accessToken = getAccessTokenFromRequest(req);
    const supabase = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} },
    });

    const { data: userData } = await supabase.auth.getUser();
    const email = userData?.user?.email || '';
    if (!email || !ADMIN_EMAILS.has(email)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { user_id } = req.body as { user_id: string };
    if (!user_id) return res.status(400).json({ error: 'user_id is required' });

    const admin = supabaseAdmin();
    await deleteUserGeneratedContent(admin, user_id);
    const { error } = await admin.auth.admin.deleteUser(user_id);
    if (error) throw error;

    return res.status(200).json({ ok: true });
  } catch (e: any) {
    console.error('users.delete error', e);
    return res.status(500).json({ error: e?.message || 'Internal error' });
  }
}

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabaseServer';

const ADMIN_EMAILS = new Set<string>(['seosasha@gmail.com']);

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

    const admin = supabaseAdmin();

    // Get all users
    const { data: usersData, error: usersError } = await admin.auth.admin.listUsers();
    if (usersError) throw usersError;

    const users = usersData?.users || [];
    if (users.length === 0) {
      return res.status(200).json({ message: 'No users found', granted: 0 });
    }

    // Get all badge types
    const { data: badgeTypes, error: badgeTypesError } = await admin
      .from('badge_types')
      .select('id');

    if (badgeTypesError) throw badgeTypesError;
    if (!badgeTypes || badgeTypes.length === 0) {
      return res.status(200).json({ message: 'No badge types found', granted: 0 });
    }

    const badgeIds = badgeTypes.map((bt) => bt.id);

    // Grant all badges to all users
    const userBadgesToInsert: Array<{ user_id: string; badge_id: string }> = [];
    for (const user of users) {
      for (const badgeId of badgeIds) {
        userBadgesToInsert.push({
          user_id: user.id,
          badge_id: badgeId,
        });
      }
    }

    // Insert user badges (using upsert to avoid duplicates)
    let grantedCount = 0;
    if (userBadgesToInsert.length > 0) {
      const { error: insertError } = await admin
        .from('user_badges')
        .upsert(userBadgesToInsert, {
          onConflict: 'user_id,badge_id',
        });

      if (insertError) throw insertError;
      grantedCount = userBadgesToInsert.length;
    }

    // Set all badges as displayed for all users
    let displayPreferencesUpdated = 0;
    for (const user of users) {
      const { error: prefError } = await admin
        .from('badge_display_preferences')
        .upsert(
          {
            user_id: user.id,
            displayed_badges: badgeIds,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'user_id',
          }
        );

      if (prefError) {
        console.error(`Error updating display preferences for user ${user.id}:`, prefError);
      } else {
        displayPreferencesUpdated++;
      }
    }

    return res.status(200).json({
      message: 'All badges granted to all users',
      users: users.length,
      badgeTypes: badgeIds.length,
      badgesGranted: grantedCount,
      displayPreferencesUpdated,
    });
  } catch (e: any) {
    console.error('badges.grant-all error', e);
    return res.status(500).json({ error: e?.message || 'Internal error' });
  }
}

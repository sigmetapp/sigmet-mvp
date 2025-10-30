import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth/getServerSession';
import { supabaseAdmin } from '@/lib/supabaseServer';

export default async function MyPage() {
  const { user } = await getServerSession();
  // Layout already enforces auth, but double-guard
  if (!user) redirect('/login');

  // Try to resolve profile username; fall back to metadata or user id
  let slug: string =
    (user.user_metadata as any)?.username || user.email || user.id;

  try {
    const admin = supabaseAdmin();
    const { data } = await admin
      .from('profiles')
      .select('username')
      .eq('user_id', user.id)
      .maybeSingle();
    if (data?.username) slug = data.username;
    else if (!slug) slug = user.id;
  } catch {
    // ignore and use fallback slug
  }

  redirect(`/u/${encodeURIComponent(slug)}`);
}

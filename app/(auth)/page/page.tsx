import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth/getServerSession';
import { supabaseAdmin } from '@/lib/supabaseServer';

export default async function MyPage() {
  const { user } = await getServerSession();
  // Layout already enforces auth, but double-guard
  if (!user) redirect('/login');

  // Resolve profile username; use user_id as fallback if username is missing
  let username: string | null = null;
  try {
    const admin = supabaseAdmin();
    const { data } = await admin
      .from('profiles')
      .select('username')
      .eq('user_id', user.id)
      .maybeSingle();
    if (data?.username && String(data.username).trim() !== '') {
      username = data.username as string;
    }
  } catch {
    // ignore
  }

  // Use username if available, otherwise use user_id as fallback
  const profileSlug = username || user.id;
  redirect(`/u/${encodeURIComponent(profileSlug)}`);
}

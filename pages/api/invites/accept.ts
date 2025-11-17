import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabaseServer';

type ResponseData =
  | { success: true; inviteId: string | null }
  | { success: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { inviteCode, userId } = req.body || {};

  if (!inviteCode || typeof inviteCode !== 'string') {
    return res.status(400).json({ success: false, error: 'inviteCode is required' });
  }
  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ success: false, error: 'userId is required' });
  }

  const normalizedCode = inviteCode.trim().toUpperCase();

  try {
    const supabase = supabaseAdmin();

    const { data: inviteId, error } = await supabase.rpc('accept_invite_for_user', {
      invite_code: normalizedCode,
      target_user_id: userId,
    });

    if (error) {
      console.error('admin accept_invite_for_user error:', error);
      return res.status(400).json({ success: false, error: error.message || 'Failed to accept invite' });
    }

    // Mark invite as synced in user metadata to avoid duplicate attempts
    try {
      const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId);
      if (!userError && userData?.user) {
        const metadata = userData.user.user_metadata || {};
        if (!metadata.invite_synced) {
          await supabase.auth.admin.updateUserById(userId, {
            user_metadata: {
              ...metadata,
              invite_synced: true,
            },
          });
        }
      }
    } catch (metaErr) {
      console.warn('Failed to update user metadata after invite sync:', metaErr);
    }

    return res.status(200).json({ success: true, inviteId });
  } catch (err: any) {
    console.error('admin accept_invite_for_user exception:', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Internal server error',
    });
  }
}

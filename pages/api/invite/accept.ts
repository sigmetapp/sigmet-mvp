import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabaseServer';

type SuccessResponse = { inviteId: string };
type ErrorResponse = { error: string };

const ALREADY_ACCEPTED_MESSAGE = 'invalid or expired invite code';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SuccessResponse | ErrorResponse>
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { inviteCode, userId } = req.body ?? {};

  if (
    !inviteCode ||
    typeof inviteCode !== 'string' ||
    !userId ||
    typeof userId !== 'string'
  ) {
    return res.status(400).json({ error: 'inviteCode and userId are required' });
  }

  try {
    const supabase = supabaseAdmin();
    const normalizedCode = inviteCode.trim().toUpperCase();

    const { data, error } = await supabase.rpc('accept_invite_by_code', {
      invite_code: normalizedCode,
      target_user_id: userId,
    });

    if (error) {
      const message = error.message || 'Failed to accept invite';
      if (message.toLowerCase().includes(ALREADY_ACCEPTED_MESSAGE)) {
        return res.status(409).json({ error: message });
      }
      return res.status(400).json({ error: message });
    }

    if (!data) {
      return res.status(500).json({ error: 'Invite acceptance returned no id' });
    }

    return res.status(200).json({ inviteId: data });
  } catch (err: any) {
    console.error('Invite acceptance API error', err);
    return res
      .status(500)
      .json({ error: err?.message || 'Unable to accept invite' });
  }
}

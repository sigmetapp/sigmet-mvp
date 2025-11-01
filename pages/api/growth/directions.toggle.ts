import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabaseServer';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  // Get current user from session
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  
  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { directionId } = req.body;

  if (!directionId) {
    return res.status(400).json({ error: 'directionId is required' });
  }

  try {
    // Check if direction exists
    const { data: direction, error: dirError } = await supabase
      .from('growth_directions')
      .select('id')
      .eq('id', directionId)
      .single();

    if (dirError || !direction) {
      return res.status(404).json({ error: 'Direction not found' });
    }

    // Check if already selected
    const { data: existing, error: checkError } = await supabase
      .from('user_selected_directions')
      .select('id')
      .eq('user_id', user.id)
      .eq('direction_id', directionId)
      .maybeSingle();

    if (checkError && checkError.code !== 'PGRST116') {
      return res.status(500).json({ error: checkError.message });
    }

    if (existing) {
      // Remove selection
      const { error: deleteError } = await supabase
        .from('user_selected_directions')
        .delete()
        .eq('id', existing.id);

      if (deleteError) {
        return res.status(500).json({ error: deleteError.message });
      }

      return res.status(200).json({ success: true, action: 'removed' });
    } else {
      // Add selection
      const { error: insertError } = await supabase
        .from('user_selected_directions')
        .insert({
          user_id: user.id,
          direction_id: directionId,
          is_primary: true,
        });

      if (insertError) {
        return res.status(500).json({ error: insertError.message });
      }

      return res.status(200).json({ success: true, action: 'added' });
    }
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

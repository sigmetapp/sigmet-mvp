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
      // Check how many primary directions user already has
      const { data: existingSelections, error: countError } = await supabase
        .from('user_selected_directions')
        .select('is_primary')
        .eq('user_id', user.id)
        .eq('is_primary', true);

      if (countError) {
        return res.status(500).json({ error: countError.message });
      }

      // Count primary and secondary directions
      const primaryCount = (existingSelections || []).filter((s) => s.is_primary === true).length;
      const secondaryCount = (existingSelections || []).filter((s) => s.is_primary === false).length;
      
      // Determine if this should be primary or secondary
      // Check if direction has a primary field or use sort_index logic
      const { data: fullDirection, error: dirFullError } = await supabase
        .from('growth_directions')
        .select('sort_index, is_primary')
        .eq('id', directionId)
        .single();

      if (dirFullError) {
        return res.status(500).json({ error: dirFullError.message });
      }

      // Determine is_primary:
      // 1. If direction has explicit is_primary field, use it
      // 2. Otherwise, use sort_index: first 8 directions (sort_index <= 8) are potential primary
      //    But only allow 3 primary total, so if already 3 primary, make this secondary
      // 3. If sort_index > 8, it's always secondary
      let isPrimary = false;
      if (fullDirection.is_primary !== undefined && fullDirection.is_primary !== null) {
        isPrimary = fullDirection.is_primary;
      } else {
        // Use sort_index logic: directions with sort_index <= 8 can be primary
        // But limit to max 3 primary total
        if (fullDirection.sort_index <= 8 && primaryCount < 3) {
          isPrimary = true;
        } else {
          isPrimary = false;
        }
      }

      // Check limits before adding
      if (isPrimary && primaryCount >= 3) {
        return res.status(400).json({ error: 'Cannot add more than 3 primary directions' });
      }
      
      if (!isPrimary && secondaryCount >= 3) {
        return res.status(400).json({ error: 'Cannot add more than 3 additional directions' });
      }

      // Add selection
      const { error: insertError } = await supabase
        .from('user_selected_directions')
        .insert({
          user_id: user.id,
          direction_id: directionId,
          is_primary: isPrimary,
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

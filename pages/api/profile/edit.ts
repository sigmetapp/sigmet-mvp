import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

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
  const { data: { user: editor }, error: authError } = await supabase.auth.getUser(token);
  
  if (authError || !editor) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { targetUserId, updates, comment } = req.body;

  if (!targetUserId || !updates) {
    return res.status(400).json({ error: 'targetUserId and updates are required' });
  }

  // Prevent users from editing their own profile through this endpoint
  // (they should use the regular profile update)
  if (editor.id === targetUserId) {
    return res.status(400).json({ error: 'Cannot edit own profile through this endpoint' });
  }

  try {
    // Get current profile values
    const { data: oldProfile, error: fetchError } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', targetUserId)
      .single();

    if (fetchError || !oldProfile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Prepare update object (only allow specific fields)
    const allowedFields = ['username', 'full_name', 'bio', 'country', 'website_url', 'avatar_url', 'directions_selected'];
    const profileUpdates: any = {};
    
    for (const field of allowedFields) {
      if (field in updates) {
        profileUpdates[field] = updates[field];
      }
    }

    // Log changes before updating (because trigger may not capture editor_id with service role)
    const changesToLog = [];
    for (const field of allowedFields) {
      if (field in updates && 
          String(oldProfile[field] || '') !== String(updates[field] || '')) {
        changesToLog.push({
          target_user_id: targetUserId,
          editor_id: editor.id,
          field_name: field,
          old_value: oldProfile[field] || null,
          new_value: updates[field] || null,
          comment: comment || null,
        });
      }
    }

    // Update profile using service role (bypasses RLS)
    const { data: newProfile, error: updateError } = await supabase
      .from('profiles')
      .update(profileUpdates)
      .eq('user_id', targetUserId)
      .select()
      .single();

    if (updateError) {
      return res.status(500).json({ error: updateError.message });
    }

    // Insert all changes with comment
    if (changesToLog.length > 0) {
      await supabase
        .from('profile_changes')
        .insert(changesToLog);
    }

    return res.status(200).json({ success: true, profile: newProfile });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

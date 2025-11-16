import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';

type ProfilePayload = {
  user_id: string;
  [key: string]: any;
};

const CONFLICT_ERROR_PATTERN = /no unique or exclusion constraint/i;

/**
 * Attempts to upsert a profile row by `user_id`.
 * If the target database is missing the expected unique constraint,
 * falls back to manual update/insert logic so profile saving still works.
 */
export async function upsertProfileByUserId(
  client: SupabaseClient<any, any, any>,
  payload: ProfilePayload
): Promise<{ error: PostgrestError | null }> {
  if (!payload?.user_id) {
    throw new Error('user_id is required to upsert profile');
  }

  const { error } = await client
    .from('profiles')
    .upsert(payload, { onConflict: 'user_id' });

  if (error && error.message && CONFLICT_ERROR_PATTERN.test(error.message)) {
    const { data: existing, error: lookupError } = await client
      .from('profiles')
      .select('user_id')
      .eq('user_id', payload.user_id)
      .maybeSingle();

    if (lookupError) {
      return { error: lookupError };
    }

    if (existing) {
      const { error: updateError } = await client
        .from('profiles')
        .update(payload)
        .eq('user_id', payload.user_id);

      return { error: updateError };
    }

    const { error: insertError } = await client
      .from('profiles')
      .insert(payload);

    return { error: insertError };
  }

  return { error };
}

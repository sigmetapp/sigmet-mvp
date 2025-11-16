import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';

type ProfilePayload = {
  user_id: string;
  [key: string]: any;
};

const CONSTRAINT_ERROR_PATTERN =
  /(duplicate key value|no unique or exclusion constraint)/i;

/**
 * Safe profile upsert helper that works even if the DB instance
 * lacks the expected `user_id` unique constraint.
 */
export async function upsertProfileByUserId(
  client: SupabaseClient<any, any, any>,
  payload: ProfilePayload
): Promise<{ error: PostgrestError | null }> {
  if (!payload?.user_id) {
    throw new Error('user_id is required to upsert profile');
  }

  // Try update first (covers most cases and avoids ON CONFLICT entirely)
  const updateResult = await client
    .from('profiles')
    .update(payload)
    .eq('user_id', payload.user_id)
    .select('user_id');

  if (updateResult.error && !isNoRowsError(updateResult.error)) {
    return { error: updateResult.error };
  }

  const updatedRows = updateResult.data ?? [];
  if (updatedRows.length > 0) {
    return { error: null };
  }

  // No existing row — insert a new one.
  const insertResult = await client.from('profiles').insert(payload);
  if (
    insertResult.error &&
    CONSTRAINT_ERROR_PATTERN.test(insertResult.error.message || '')
  ) {
    // Someone else inserted concurrently or constraint finally exists.
    const retryResult = await client
      .from('profiles')
      .update(payload)
      .eq('user_id', payload.user_id);
    return { error: retryResult.error || null };
  }

  return { error: insertResult.error || null };
}

function isNoRowsError(error: PostgrestError | null) {
  if (!error) return false;
  // PostgREST returns PGRST116 when Prefer: return=representation finds no rows.
  return error.code === 'PGRST116';
}

export type ThreadId = string;

/**
 * Convert an arbitrary value coming from Supabase or user input into a
 * normalized thread ID string. Returns null when the value cannot represent
 * a thread identifier.
 */
export function coerceThreadId(value: unknown): ThreadId | null {
  if (value === null || value === undefined) return null;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return value.toString();
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  return null;
}

/**
 * Ensure a value is a valid thread ID, throwing otherwise so callers can
 * surface an appropriate error to the user.
 */
export function assertThreadId(value: unknown, errorMessage = 'Invalid thread ID'): ThreadId {
  const tid = coerceThreadId(value);
  if (!tid) {
    throw new Error(errorMessage);
  }
  return tid;
}

/**
 * Utility function to merge class names
 * Similar to clsx but simpler
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

/**
 * Normalize avatar URLs coming from the database.
 *
 * Handles absolute URLs, protocol-relative URLs, data URIs, and Supabase Storage
 * object paths (with or without the `storage/v1/object/public` prefix).
 */
export function resolveAvatarUrl(raw?: string | null): string | null {
  if (!raw) {
    return null;
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  // Already a data URI
  if (trimmed.startsWith('data:')) {
    return trimmed;
  }

  // Absolute URL
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  // Protocol-relative URL
  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
  if (!supabaseUrl) {
    // Without a Supabase base URL we have nothing to normalize against; return as-is.
    return trimmed;
  }

  const sanitizePath = (path: string) =>
    path
      .split('/')
      .filter(Boolean)
      .map((segment) => encodeURIComponent(segment))
      .join('/');

  // If path starts with a slash, append directly to Supabase base
  if (trimmed.startsWith('/')) {
    return `${supabaseUrl}${trimmed}`;
  }

  const storagePrefix = 'storage/v1/object/public/';
  const publicPrefix = 'public/';

  let normalizedPath = trimmed.replace(/^\/+/, '');

  if (normalizedPath.startsWith(storagePrefix)) {
    const remainder = normalizedPath.slice(storagePrefix.length);
    return `${supabaseUrl}/${storagePrefix}${sanitizePath(remainder)}`;
  }

  if (normalizedPath.startsWith(publicPrefix)) {
    normalizedPath = normalizedPath.slice(publicPrefix.length);
  }

  return `${supabaseUrl}/${storagePrefix}${sanitizePath(normalizedPath)}`;
}

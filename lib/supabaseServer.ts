import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type Database = any;

// Cache the admin client to reuse connections (only when service role is available)
let adminClient: SupabaseClient<Database, "public", any> | null = null;

interface SupabaseAdminOptions {
  /**
   * Optional user access token. When service role key is not configured,
   * this token is attached to every request so that RLS policies depending on auth.uid() work.
   */
  accessToken?: string;
  /**
   * Force the use of the service role key. If true and the service key is absent,
   * an error is thrown even if the anon key fallback is available.
   */
  requireServiceRole?: boolean;
}

const CACHE_HEADERS = {
  "Cache-Control": "no-cache, no-store, must-revalidate",
  Pragma: "no-cache",
} as const;

function createSupabaseClient(
  url: string,
  key: string,
  accessToken?: string,
): SupabaseClient<Database, "public", any> {
  return createClient(url, key, {
    auth: { persistSession: false },
    db: { schema: "public" },
    global: {
      fetch: (requestUrl, options = {}) => {
        return fetch(requestUrl, {
          ...options,
          cache: "no-store",
          headers: {
            ...options.headers,
            ...CACHE_HEADERS,
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
        });
      },
    },
  });
}

export function supabaseAdmin(
  options: SupabaseAdminOptions = {},
): SupabaseClient<Database, "public", any> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error(
      "Missing Supabase environment variable: NEXT_PUBLIC_SUPABASE_URL is required",
    );
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const shouldUseServiceRole =
    !!serviceRoleKey || options.requireServiceRole === true;

  if (shouldUseServiceRole) {
    if (!serviceRoleKey) {
      throw new Error(
        "Supabase service role key (SUPABASE_SERVICE_ROLE_KEY) is not configured",
      );
    }
    if (!adminClient) {
      adminClient = createSupabaseClient(url, serviceRoleKey);
    }
    return adminClient;
  }

  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) {
    throw new Error(
      "Missing Supabase environment variables: configure either SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  // When falling back to anon key we create a per-request client so that
  // the provided access token (if any) is attached to all queries.
  return createSupabaseClient(url, anonKey, options.accessToken);
}

export function isServiceRoleConfigured(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

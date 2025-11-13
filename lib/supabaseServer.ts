import { createClient } from '@supabase/supabase-js';

// Cache the admin client to reuse connections
let adminClient: ReturnType<typeof createClient> | null = null;

export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!url || !key) {
    throw new Error('Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }
  
  // Reuse the same client instance to ensure we see the latest data
  // This helps with connection pooling and consistency
  if (!adminClient) {
    adminClient = createClient(url, key, { 
      auth: { persistSession: false },
      db: { schema: 'public' },
      global: {
        // Disable fetch caching to ensure we always get fresh data
        // Explicitly add apikey header for Supabase API requests
        fetch: (url, options = {}) => {
          const existingHeaders = options.headers || {};
          const headers = new Headers(existingHeaders);
          
          // Ensure apikey is set (Supabase requires this)
          if (!headers.has('apikey')) {
            headers.set('apikey', key);
          }
          
          // Ensure Authorization is set
          if (!headers.has('Authorization')) {
            headers.set('Authorization', `Bearer ${key}`);
          }
          
          // Add cache control headers
          headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
          headers.set('Pragma', 'no-cache');
          
          return fetch(url, {
            ...options,
            cache: 'no-store',
            headers,
          });
        },
      },
    });
  }
  
  return adminClient;
}

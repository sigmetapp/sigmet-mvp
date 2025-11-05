import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabaseServer';

const ADMIN_EMAILS = new Set<string>(['seosasha@gmail.com']);

function getAccessTokenFromRequest(req: NextApiRequest): string | undefined {
  const cookie = req.headers.cookie || '';
  const map = new Map<string, string>();
  cookie.split(';').forEach((p) => {
    const [k, ...rest] = p.trim().split('=');
    if (!k) return;
    map.set(k, decodeURIComponent(rest.join('=')));
  });
  const direct = map.get('sb-access-token') || map.get('access-token');
  if (direct) return direct;
  for (const [k, v] of map.entries()) {
    if (k.startsWith('sb-') && k.endsWith('-auth-token')) {
      try {
        const parsed = JSON.parse(v) as { access_token?: string };
        if (parsed?.access_token) return parsed.access_token;
      } catch {}
    }
  }
  return undefined;
}

async function measureDbQuery<T>(
  name: string,
  queryFn: () => Promise<T>
): Promise<{ name: string; duration: number; success: boolean; error?: string }> {
  const start = performance.now();
  try {
    await queryFn();
    const duration = performance.now() - start;
    return { name, duration: Math.round(duration * 100) / 100, success: true };
  } catch (error: any) {
    const duration = performance.now() - start;
    return {
      name,
      duration: Math.round(duration * 100) / 100,
      success: false,
      error: error?.message || 'Unknown error',
    };
  }
}

async function measureApiEndpoint(
  name: string,
  url: string,
  options?: RequestInit
): Promise<{ name: string; duration: number; status?: number; size?: number; success: boolean; error?: string }> {
  const start = performance.now();
  try {
    const response = await fetch(url, options);
    const blob = await response.blob();
    const duration = performance.now() - start;
    return {
      name,
      duration: Math.round(duration * 100) / 100,
      status: response.status,
      size: blob.size,
      success: response.ok,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (error: any) {
    const duration = performance.now() - start;
    return {
      name,
      duration: Math.round(duration * 100) / 100,
      success: false,
      error: error?.message || 'Unknown error',
    };
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
    const accessToken = getAccessTokenFromRequest(req);
    const supabase = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} },
    });

    const { data: userData } = await supabase.auth.getUser();
    const email = userData?.user?.email || '';
    if (!email || !ADMIN_EMAILS.has(email)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const admin = supabaseAdmin();
    const baseUrl = req.headers.host?.includes('localhost') 
      ? `http://${req.headers.host}` 
      : `https://${req.headers.host}`;

    // Measure memory usage
    const memoryUsage = process.memoryUsage();
    const memoryMetrics = {
      rss: Math.round(memoryUsage.rss / 1024 / 1024), // MB
      heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
      heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
      external: Math.round(memoryUsage.external / 1024 / 1024), // MB
    };

    // Database performance tests
    const dbTests = await Promise.all([
      // Simple count query
      measureDbQuery('DB: Count profiles', () =>
        admin.from('profiles').select('*', { count: 'exact', head: true })
      ),
      // Complex query with filter
      measureDbQuery('DB: Profiles with filter', () =>
        admin.from('profiles').select('user_id, username').limit(100)
      ),
      // Count posts
      measureDbQuery('DB: Count posts', () =>
        admin.from('posts').select('*', { count: 'exact', head: true })
      ),
      // Recent posts with join (simulated)
      measureDbQuery('DB: Recent posts', () =>
        admin.from('posts').select('id, author_id, created_at').order('created_at', { ascending: false }).limit(50)
      ),
      // Count DM threads
      measureDbQuery('DB: Count DM threads', () =>
        admin.from('dms_threads').select('*', { count: 'exact', head: true })
      ),
      // Count DM messages
      measureDbQuery('DB: Count DM messages', () =>
        admin.from('dms_messages').select('*', { count: 'exact', head: true })
      ),
      // Complex query with date filter
      measureDbQuery('DB: Posts last 24h', () => {
        const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        return admin.from('posts').select('*', { count: 'exact', head: true }).gte('created_at', dayAgo);
      }),
      // Index test - order by with limit
      measureDbQuery('DB: Posts ordered by date', () =>
        admin.from('posts').select('id, created_at').order('created_at', { ascending: false }).limit(100)
      ),
    ]);

    // API endpoints performance tests
    const apiTests = await Promise.all([
      measureApiEndpoint('API: /api/ping', `${baseUrl}/api/ping`),
      measureApiEndpoint('API: /api/admin/stats', `${baseUrl}/api/admin/stats`, {
        headers: {
          Cookie: req.headers.cookie || '',
        },
      }),
      measureApiEndpoint('API: /api/badges/catalog', `${baseUrl}/api/badges/catalog`),
      measureApiEndpoint('API: /api/growth/directions.list', `${baseUrl}/api/growth/directions.list`, {
        headers: {
          Cookie: req.headers.cookie || '',
        },
      }),
    ]);

    // Calculate statistics
    const dbAvg = dbTests.reduce((sum, t) => sum + t.duration, 0) / dbTests.length;
    const dbMax = Math.max(...dbTests.map((t) => t.duration));
    const dbMin = Math.min(...dbTests.map((t) => t.duration));
    const dbSuccess = dbTests.filter((t) => t.success).length;

    const apiAvg = apiTests.reduce((sum, t) => sum + t.duration, 0) / apiTests.length;
    const apiMax = Math.max(...apiTests.map((t) => t.duration));
    const apiMin = Math.min(...apiTests.map((t) => t.duration));
    const apiSuccess = apiTests.filter((t) => t.success).length;

    // Overall server metrics
    const uptime = process.uptime();
    const cpuUsage = process.cpuUsage();

    return res.status(200).json({
      timestamp: new Date().toISOString(),
      server: {
        uptime: Math.round(uptime),
        memory: memoryMetrics,
        cpu: {
          user: Math.round(cpuUsage.user / 1000), // microseconds to milliseconds
          system: Math.round(cpuUsage.system / 1000),
        },
      },
      database: {
        tests: dbTests,
        statistics: {
          average: Math.round(dbAvg * 100) / 100,
          max: Math.round(dbMax * 100) / 100,
          min: Math.round(dbMin * 100) / 100,
          successRate: Math.round((dbSuccess / dbTests.length) * 100),
        },
      },
      api: {
        tests: apiTests,
        statistics: {
          average: Math.round(apiAvg * 100) / 100,
          max: Math.round(apiMax * 100) / 100,
          min: Math.round(apiMin * 100) / 100,
          successRate: Math.round((apiSuccess / apiTests.length) * 100),
        },
      },
    });
  } catch (e: any) {
    console.error('admin.performance error', e);
    return res.status(500).json({ error: e?.message || 'Internal error' });
  }
}

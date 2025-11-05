import type { NextApiRequest, NextApiResponse } from 'next';

function serializeCookie(name: string, value: string, options: {
  maxAge?: number;
  path?: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Lax' | 'Strict' | 'None';
  domain?: string;
} = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  parts.push(`Path=${options.path ?? '/'}`);
  if (options.httpOnly ?? true) parts.push('HttpOnly');
  if (options.secure ?? true) parts.push('Secure');
  parts.push(`SameSite=${options.sameSite ?? 'Lax'}`);
  if (options.domain) parts.push(`Domain=${options.domain}`);
  return parts.join('; ');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, message: 'Method Not Allowed' });
  }

  try {
    const { event, session } = req.body as { event?: string; session?: any | null };

    const cookies: string[] = [];

    if (!session || event === 'SIGNED_OUT') {
      // Clear cookies
      cookies.push(
        serializeCookie('sb-access-token', '', { maxAge: 0 }),
        serializeCookie('sb-refresh-token', '', { maxAge: 0 }),
        serializeCookie('sb-generic-auth-token', '', { maxAge: 0 })
      );
    } else {
      const accessToken: string | undefined = session?.access_token;
      const refreshToken: string | undefined = session?.refresh_token;
      const expiresAt: number | undefined = session?.expires_at; // seconds since epoch

      // Default to 1 hour if unknown
      const maxAgeSeconds = expiresAt
        ? Math.max(0, Math.floor(expiresAt - Date.now() / 1000))
        : 60 * 60;

      if (accessToken) {
        cookies.push(
          serializeCookie('sb-access-token', accessToken, { maxAge: maxAgeSeconds })
        );
        // Add helper-style cookie some server code looks for
        cookies.push(
          serializeCookie('sb-generic-auth-token', JSON.stringify({ access_token: accessToken }), {
            maxAge: maxAgeSeconds,
          })
        );
      }
      if (refreshToken) {
        cookies.push(
          serializeCookie('sb-refresh-token', refreshToken, { maxAge: 60 * 60 * 24 * 7 }) // 7 days
        );
      }
    }

    if (cookies.length > 0) {
      res.setHeader('Set-Cookie', cookies);
    }

    return res.status(200).json({ ok: true });
  } catch (e: any) {
    console.error('auth/set-session error:', e);
    return res.status(500).json({ ok: false, message: e?.message || 'Failed to set session cookies' });
  }
}

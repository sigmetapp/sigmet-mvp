import { NextResponse, type NextRequest } from 'next/server';

// Public routes that should never be blocked by auth
const PUBLIC_PATHS = new Set<string>([
  '/',
  '/login',
  '/auth',
  '/auth/',
]);

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  // Static assets and Next internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/robots') ||
    pathname.startsWith('/sitemap') ||
    /\.(?:js|css|png|jpg|jpeg|gif|svg|webp|ico|txt|json)$/i.test(pathname)
  ) {
    return true;
  }
  return false;
}

function hasSupabaseSessionCookie(req: NextRequest): boolean {
  // Common cookie names
  const direct = req.cookies.get('sb-access-token')?.value || req.cookies.get('access-token')?.value;
  if (direct) return true;
  const authToken = Array.from(req.cookies.getAll()).find((c) => c.name.startsWith('sb-') && c.name.endsWith('-auth-token'))?.value;
  if (authToken) return true;
  return false;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only protect the known authenticated app paths (grouped under (auth) in app router)
  const needsAuth = (
    pathname.startsWith('/feed') ||
    pathname.startsWith('/page') ||
    pathname.startsWith('/connections') ||
    pathname.startsWith('/dm') ||
    pathname.startsWith('/sw') ||
    pathname.startsWith('/growth-directions') ||
    pathname.startsWith('/invite') ||
    pathname.startsWith('/profile')
  );

  if (!needsAuth || isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (!hasSupabaseSessionCookie(req)) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/feed/:path*',
    '/page/:path*',
    '/connections/:path*',
    '/dm/:path*',
    '/sw/:path*',
    '/growth-directions/:path*',
    '/invite/:path*',
    '/profile/:path*',
    // Allow other paths to pass (no-op)
  ],
};

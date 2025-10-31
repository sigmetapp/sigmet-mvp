import { Suspense } from 'react';
import LoginClient from './LoginClient';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-[70vh] flex items-center justify-center text-white/70">Loading…</div>}>
      <LoginClient />
    </Suspense>
  );
}

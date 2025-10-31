'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import Button from '@/components/Button';

type Mode = 'login' | 'signup';

function getRedirectParam(): string {
  if (typeof window === 'undefined') return '/feed';
  const params = new URLSearchParams(window.location.search);
  return params.get('redirect') || '/feed';
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showForgot, setShowForgot] = useState(false);
  const [identifier, setIdentifier] = useState('');
  const [forgotPending, setForgotPending] = useState(false);
  const [forgotMsg, setForgotMsg] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        const redirect = getRedirectParam();
        router.replace(redirect);
      }
    });
  }, [router]);

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (!email || !password) {
      setError('Please enter your email and password.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInErr) throw signInErr;
        // Ensure server cookies are set before redirect
        const { data: sessionData } = await supabase.auth.getSession();
        await fetch('/api/auth/set-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ event: 'SIGNED_IN', session: sessionData.session ?? null }),
        });
        const { data } = await supabase.auth.getUser();
        const mustChange = Boolean((data.user as any)?.user_metadata?.must_change_password);
        if (mustChange) {
          router.replace('/auth/reset');
        } else {
          const redirect = getRedirectParam();
          router.replace(redirect);
        }
      } else {
        const origin = process.env.NEXT_PUBLIC_REDIRECT_ORIGIN || window.location.origin;
        const { error: signUpErr } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${origin}/auth/callback` },
        });
        if (signUpErr) throw signUpErr;
        setNotice('Check your email to confirm your account.');
      }
    } catch (err: any) {
      setError(err?.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  }

  async function onForgotClick() {
    setShowForgot((s) => !s);
    setForgotMsg(null);
    setError(null);
  }

  async function submitTempPasswordRequest(e: React.FormEvent) {
    e.preventDefault();
    setForgotMsg(null);
    setError(null);
    const value = identifier.trim();
    if (!value) {
      setForgotMsg('Please enter your email.');
      return;
    }
    if (!value.includes('@')) {
      setForgotMsg('Please enter the email associated with your account.');
      return;
    }
    setForgotPending(true);
    try {
      const origin = process.env.NEXT_PUBLIC_REDIRECT_ORIGIN || window.location.origin;
      const { error } = await supabase.auth.resetPasswordForEmail(value, {
        redirectTo: `${origin}/auth/reset`,
      });
      if (error) throw error;
      setForgotMsg('If the account exists, a reset link has been sent.');
    } catch (e: any) {
      setForgotMsg(e?.message || 'Failed to send reset link');
    } finally {
      setForgotPending(false);
    }
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 backdrop-blur-md p-6 md:p-8 shadow-[0_8px_40px_rgba(0,0,0,0.25)]">
        <h1 className="text-2xl font-semibold text-white/90 mb-1">
          {mode === 'login' ? 'Log in' : 'Sign up'}
        </h1>
        <p className="text-white/60 text-sm mb-6">
          {mode === 'login'
            ? 'Welcome back! Enter your credentials below.'
            : 'Create your account using email and password.'}
        </p>

        <form onSubmit={handleAuth} className="space-y-4">
          <label className="block">
            <span className="text-sm text-white/70">Email</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-xl bg-transparent border border-white/10 px-3 py-2 outline-none placeholder-white/40 text-white"
              placeholder="you@example.com"
            />
          </label>

          <label className="block">
            <span className="text-sm text-white/70">Password</span>
            <div className="mt-1 relative">
              <input
                type={showPwd ? 'text' : 'password'}
                autoComplete={
                  mode === 'login' ? 'current-password' : 'new-password'
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl bg-transparent border border-white/10 px-3 py-2 pr-10 outline-none placeholder-white/40 text-white"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPwd((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-white/60 hover:text-white"
                aria-label="Toggle password visibility"
              >
                {showPwd ? '🙈' : '👁️'}
              </button>
            </div>
          </label>

          {error && <div className="text-red-400 text-sm">{error}</div>}
          {notice && <div className="text-white/80 text-sm">{notice}</div>}

          <Button type="submit" disabled={loading} variant="primary" className="w-full">
            {loading
              ? mode === 'login'
                ? 'Logging in...'
                : 'Creating...'
              : mode === 'login'
              ? 'Log in'
              : 'Sign up'}
          </Button>
        </form>

        <div className="mt-4 text-sm text-white/70">
          {mode === 'login' ? (
            <>
              Don’t have an account?{' '}
              <Link href="/signup" className="underline hover:no-underline">
                Sign up
              </Link>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                className="underline hover:no-underline"
                onClick={() => {
                  setMode('login');
                  setError(null);
                }}
              >
                Log in
              </button>
            </>
          )}
        </div>

        <div className="mt-2 text-xs text-white/50">
          <button
            type="button"
            className="underline hover:no-underline"
            onClick={onForgotClick}
          >
            Forgot password?
          </button>
        </div>

        {showForgot && (
          <form onSubmit={submitTempPasswordRequest} className="mt-4 space-y-3">
            <label className="block">
              <span className="text-sm text-white/70">Email or username</span>
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="mt-1 w-full rounded-xl bg-transparent border border-white/10 px-3 py-2 outline-none placeholder-white/40 text-white"
                placeholder="you@example.com or your_nickname"
              />
            </label>
            {forgotMsg && <div className="text-white/80 text-sm">{forgotMsg}</div>}
            <Button type="submit" disabled={forgotPending} variant="primary" className="w-full">
              {forgotPending ? 'Sending...' : 'Reset Password'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

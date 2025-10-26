'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '@/lib/supabaseClient';

type Mode = 'login' | 'signup';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Если уже авторизован — уводим в ленту
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) router.replace('/feed');
    });
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    if (!email || !password) {
      setErr('Please enter email and password.');
      return;
    }
    if (!email.includes('@')) {
      setErr('Invalid email.');
      return;
    }
    if (password.length < 6) {
      setErr('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
      }
      router.replace('/feed');
    } catch (e: any) {
      setErr(e?.message || 'Authentication error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[70dvh] flex items-center justify-center">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 backdrop-blur-md p-6 md:p-8 shadow-[0_8px_40px_rgba(0,0,0,0.25)]">
        <h1 className="text-xl md:text-2xl font-semibold text-white/90 mb-1">
          {mode === 'login' ? 'Log in' : 'Sign up'}
        </h1>
        <p className="text-white/60 text-sm mb-6">
          {mode === 'login' ? 'Welcome back! Enter your credentials.' : 'Create your account using email and password.'}
        </p>

        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <span className="text-sm text-white/70">Email</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-xl bg-transparent border border-white/10 px-3 py-2 outline-none placeholder-white/40"
              placeholder="you@example.com"
            />
          </label>

          <label className="block">
            <span className="text-sm text-white/70">Password</span>
            <div className="mt-1 relative">
              <input
                type={showPwd ? 'text' : 'password'}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl bg-transparent border border-white/10 px-3 py-2 pr-10 outline-none placeholder-white/40"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPwd((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-white/60 hover:text-white"
                aria-label={showPwd ? 'Hide password' : 'Show password'}
                title={showPwd ? 'Hide password' : 'Show password'}
              >
                {showPwd ? '🙈' : '👁️'}
              </button>
            </div>
          </label>

          {err && <div className="text-red-400 text-sm">{err}</div>}

          <button
            type="submit"
            disabled={loading}
            className="w-full relative inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-2.5
                       bg-gradient-to-r from-white to-white/90 text-black
                       shadow-[0_8px_24px_rgba(255,255,255,0.25)] hover:shadow-[0_10px_36px_rgba(255,255,255,0.35)]
                       hover:translate-y-[-1px] active:translate-y-0 transition
                       disabled:opacity-60"
          >
            {loading ? (mode === 'login' ? 'Logging in…' : 'Creating…') : (mode === 'login' ? 'Log in' : 'Sign up')}
            <span className="absolute inset-0 rounded-2xl ring-1 ring-white/30 pointer-events-none" />
          </button>
        </form>

        <div className="mt-4 text-sm text-white/70">
          {mode === 'login' ? (
            <>
              Don’t have an account?{' '}
              <button
                className="underline hover:no-underline"
                onClick={() => { setMode('signup'); setErr(null); }}
              >
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                className="underline hover:no-underline"
                onClick={() => { setMode('login'); setErr(null); }}
              >
                Log in
              </button>
            </>
          )}
        </div>

        {/* опционально — ссылка на восстановление пароля */}
        {/* <div className="mt-2 text-xs text-white/50">
          <a className="underline hover:no-underline" href="/reset-password">Forgot password?</a>
        </div> */}
      </div>
    </div>
  );
}

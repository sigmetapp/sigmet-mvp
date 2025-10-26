import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';

export default function AuthPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<string>();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setMsg(undefined);
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMsg('Account created. Please confirm your email.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        window.location.href = '/';
      }
    } catch (err: any) {
      setMsg(err.message || 'Auth error');
    } finally { setPending(false); }
  }

  async function resetPassword() {
    setPending(true);
    setMsg(undefined);
    try {
      const origin = process.env.NEXT_PUBLIC_REDIRECT_ORIGIN || window.location.origin;
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/reset` });
      if (error) throw error;
      setMsg('Password reset link has been sent to your email.');
    } catch (err: any) { setMsg(err.message || 'Failed to send reset link'); }
    finally { setPending(false); }
  }

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <div className="hidden md:flex flex-col justify-between p-10 bg-sigmet">
        <Link href="/" className="text-white/90 text-xl font-semibold">Sigmet</Link>
        <div>
          <h1 className="text-white text-4xl font-semibold mb-4">Welcome back</h1>
          <p className="text-white/70">Sign in with email and password. Magic links are disabled.</p>
        </div>
        <div className="text-white/40 text-xs">© {new Date().getFullYear()} Sigmet</div>
      </div>

      <div className="flex items-center justify-center p-6 md:p-12 bg-base.bg">
        <div className="w-full max-w-md">
          <div className="flex gap-2 bg-white/5 p-1 rounded-xl mb-6">
            <button onClick={()=>setMode('signin')} className={`flex-1 py-2 rounded-lg text-sm ${mode==='signin'?'bg-white text-black':'text-white/80'}`}>Sign in</button>
            <button onClick={()=>setMode('signup')} className={`flex-1 py-2 rounded-lg text-sm ${mode==='signup'?'bg-white text-black':'text-white/80'}`}>Create account</button>
          </div>

          <form onSubmit={onSubmit} className="card p-6 space-y-4">
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="you@example.com"/>
            </div>
            <div>
              <label className="label">Password</label>
              <input className="input" type="password" value={password} onChange={e=>setPassword(e.target.value)} required placeholder="Minimum 6 characters"/>
            </div>

            {msg && <div className="text-white/80 text-sm">{msg}</div>}

            <button type="submit" disabled={pending} className="btn btn-primary w-full disabled:opacity-60">
              {pending ? 'Please wait' : (mode==='signin' ? 'Sign in' : 'Create account')}
            </button>

            <button type="button" onClick={resetPassword} className="w-full text-white/70 text-sm hover:text-white mt-2">
              Forgot password
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

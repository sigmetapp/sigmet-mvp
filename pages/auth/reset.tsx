import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<string>();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setMsg(undefined);
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) throw error;
      if (!user) throw new Error('No user in session');
      const { error: updErr } = await supabase.auth.updateUser({ password });
      if (updErr) throw updErr;
      setMsg('Password updated. You can sign in now.');
    } catch (err: any) {
      setMsg(err.message || 'Error');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0f1c] p-6">
      <form onSubmit={onSubmit} className="w-full max-w-md bg-white/5 border border-white/10 rounded-2xl p-6">
        <h1 className="text-white text-2xl mb-4">Set a new password</h1>
        <input
          className="w-full rounded-xl bg-white/10 text-white px-3 py-3 focus:ring-2 focus:ring-white/30"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="New password"
          required
        />
        {msg && <div className="text-white/80 text-sm mt-3">{msg}</div>}
        <button
          className="w-full rounded-xl py-3 bg-white text-black font-medium mt-4 disabled:opacity-60"
          disabled={pending}
        >
          {pending ? 'Please wait' : 'Update password'}
        </button>
      </form>
    </div>
  );
}

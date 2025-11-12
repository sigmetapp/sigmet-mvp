'use client';

import Head from 'next/head';
import Link from 'next/link';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import Button from '@/components/Button';
import { useTheme } from '@/components/ThemeProvider';
import { useSiteSettings } from '@/components/SiteSettingsContext';

export default function SignupPage() {
  const router = useRouter();
  const { theme } = useTheme();
  const { invites_only } = useSiteSettings();
  const isLight = theme === "light";

  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [agree, setAgree] = useState(true);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const container: React.CSSProperties = {
    maxWidth: '1000px',
    margin: '0 auto',
    padding: '40px 24px',
    width: '100%',
    boxSizing: 'border-box',
  };

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMsg(null);
    setNotice(null);

    if (!email || !password) {
      setErrorMsg('Please enter both email and password.');
      return;
    }
    if (!agree) {
      setErrorMsg('You must agree to the Terms and Privacy Policy.');
      return;
    }

    // Check if invite-only registration is enabled
    if (invites_only && (!inviteCode || !inviteCode.trim())) {
      setErrorMsg('An invite code is required to register. Please enter a valid invite code.');
      return;
    }

    setLoading(true);
    try {
      // If invite-only registration is enabled, validate the invite code BEFORE creating the user
      if (invites_only && inviteCode && inviteCode.trim()) {
        const { data: isValid, error: validateErr } = await supabase.rpc('validate_invite_code', {
          invite_code: inviteCode.trim().toUpperCase()
        });
        
        if (validateErr) {
          console.error('Invite code validation error:', validateErr);
          throw new Error(validateErr.message || 'Failed to validate invite code. Please try again.');
        }
        
        if (!isValid) {
          throw new Error('Invalid or expired invite code. Registration requires a valid invite code.');
        }
      }

      const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : undefined;

      const { data: signData, error: signErr } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectTo,
          data: { full_name: fullName || null },
        },
      });
      if (signErr) throw signErr;

      // If invite code was provided, try to accept the invite after signup
      let inviteAccepted = false;
      if (inviteCode && inviteCode.trim() && signData?.user) {
        try {
          const { data: inviteId, error: inviteErr } = await supabase.rpc('accept_invite_by_code', {
            invite_code: inviteCode.trim().toUpperCase()
          });
          
          if (!inviteErr && inviteId) {
            inviteAccepted = true;
            // Track invite acceptance
            const { trackInviteAccepted } = await import('@/lib/invite-tracking');
            await trackInviteAccepted(inviteId, signData.user.id);
          }
          // If invite code is invalid and invites_only is enabled, this is an error
          // (This should not happen if validation passed, but handle it just in case)
          if (inviteErr) {
            if (invites_only) {
              throw new Error('Invalid or expired invite code. Registration requires a valid invite code.');
            } else {
              console.warn('Invalid invite code:', inviteErr.message);
            }
          }
        } catch (inviteErr: any) {
          if (invites_only) {
            throw inviteErr;
          }
          console.warn('Error accepting invite:', inviteErr);
        }
      }

      setNotice(
        inviteAccepted 
          ? 'Invite accepted! Please check your email inbox. A confirmation link has been sent.'
          : 'Please check your email inbox. A confirmation link has been sent.'
      );

      try {
        await fetch('/api/notify-signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, fullName }),
        });
      } catch {}

    } catch (err: any) {
      console.error('signup error', err);
      setErrorMsg(err?.message || 'Signup failed.');
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setErrorMsg(null);
    try {
      await supabase.auth.resend({
        type: 'signup',
        email,
        options: {
          emailRedirectTo: typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : undefined,
        },
      });
      setNotice('Confirmation email re-sent. Please check your inbox/spam folder.');
    } catch (e: any) {
      console.error('resend error', e);
      setErrorMsg(e?.message || 'Resend failed.');
    }
  }

  return (
    <div className={isLight ? "bg-primary-gradient" : "bg-sigmet"} style={{ minHeight: '100vh' }}>
      <Head>
        <title>Sign up | Sigmet</title>
        <meta name="description" content="Create your Sigmet account" />
      </Head>

      <main style={container}>
        <section className="grid">
          <div className="left">
            <h1 className={`title ${isLight ? "text-primary-text" : "text-primary-text"}`}>Create your Sigmet account</h1>
            <p className={`subtitle ${isLight ? "text-primary-text-secondary" : "text-primary-text-secondary"}`}>
              Join Sigmet to build your social weight through growth and purpose.
            </p>

            <form onSubmit={handleSubmit} className={`formCard ${isLight ? "card-glow-primary" : "card-glow-primary"}`}>
              <div className="formRow">
                <label htmlFor="fullName" className="label">Full name</label>
                <input
                  id="fullName"
                  type="text"
                  className="input"
                  placeholder="Alex Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>

              <div className="formRow">
                <label htmlFor="email" className="label">Email</label>
                <input
                  id="email"
                  type="email"
                  className="input"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="formRow">
                <label htmlFor="password" className="label">Password</label>
                <input
                  id="password"
                  type="password"
                  className="input"
                  placeholder="Minimum 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <div className="formRow">
                <label htmlFor="inviteCode" className="label">
                  Invite Code {!invites_only && <span className="text-white/50 text-xs">(optional)</span>}
                  {invites_only && <span className="text-red-400 text-xs">(required)</span>}
                </label>
                <input
                  id="inviteCode"
                  type="text"
                  className="input"
                  placeholder="ABCD1234"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  maxLength={8}
                  required={invites_only}
                  style={{ textTransform: 'uppercase', fontFamily: 'monospace', letterSpacing: '2px' }}
                />
                <p className="text-white/50 text-xs mt-1">
                  {invites_only 
                    ? 'Registration is currently invite-only. Please enter a valid invite code to create an account.'
                    : 'If you have an invite code from a friend, enter it here.'}
                </p>
              </div>

              <div className="checkboxRow">
                <input
                  id="agree"
                  type="checkbox"
                  checked={agree}
                  onChange={(e) => setAgree(e.target.checked)}
                />
                <label htmlFor="agree">
                  I agree to the <Link href="/terms">Terms</Link> and{' '}
                  <Link href="/privacy">Privacy Policy</Link>.
                </label>
              </div>

              {errorMsg && <div className="alert error">{errorMsg}</div>}

              {notice && (
                <div className="alert notice">
                  {notice}
                  <button type="button" onClick={handleResend} className="btnSecondary sm" style={{ marginLeft: 8 }}>
                    Resend
                  </button>
                </div>
              )}

              <div className="actions">
                <Button type="submit" disabled={loading} variant="primary">
                  {loading ? 'Creating...' : 'Create account'}
                </Button>
                <Button href="/login" variant="orange">
                  I already have an account
                </Button>
              </div>
            </form>

            <div className={`tipsCard ${isLight ? "card-glow-primary" : "card-glow-primary"}`}>
              <h3 className={isLight ? "text-primary-text" : "text-primary-text"}>Quick tips</h3>
              <ul className={isLight ? "text-primary-text-secondary" : "text-primary-text-secondary"}>
                <li>Use a valid email to receive the confirmation link.</li>
                <li>After confirming, you can complete your profile setup.</li>
                <li>Choose 3 growth areas to personalize your experience.</li>
              </ul>
            </div>
          </div>

          <div className="right">
            <div className={`infoCard ${isLight ? "card-glow-primary" : "card-glow-primary"}`}>
              <h3 className={isLight ? "text-primary-text" : "text-primary-text"}>Why Sigmet</h3>
              <ul className={isLight ? "text-primary-text-secondary" : "text-primary-text-secondary"}>
                <li>Communities built on purpose, not popularity.</li>
                <li>Transparent and fair social weight system.</li>
                <li>Insightful analytics for creators and members.</li>
              </ul>
              <div className={`smallNote ${isLight ? "text-primary-text-secondary" : "text-primary-text-secondary"}`}>
                A verification email will be sent to ensure account security.
              </div>
            </div>
          </div>
        </section>
      </main>

      <style jsx>{`
        .grid { display: grid; grid-template-columns: 1.2fr 1fr; gap: 32px; }
        .title { font-size: 32px; font-weight: 700; margin: 0 0 8px; }
        .subtitle { margin: 0 0 20px; line-height: 1.7; }
        .formCard, .tipsCard, .infoCard { border-radius: 12px; padding: 24px; }
        .formCard { margin-top: 8px; }
        .tipsCard { margin-top: 20px; }
        .infoCard { position: sticky; top: 24px; }
        .formRow { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
        label { font-size: 14px; }
        input[type='text'], input[type='email'], input[type='password'] { padding: 12px 14px; border-radius: 10px; outline: none; transition: border .15s ease, box-shadow .15s ease; }
        input::placeholder { }
        input:focus { border-color: rgba(51, 144, 236, 0.4); box-shadow: 0 0 0 3px rgba(51, 144, 236, 0.15); }
        .checkboxRow { display: flex; align-items: center; gap: 10px; margin: 8px 0 12px; }
        .alert { border-radius: 10px; padding: 12px 14px; font-size: 14px; margin: 8px 0 12px; }
        .alert.error { background: rgba(248,81,73,0.1); border: 1px solid #f85149; }
        .alert.notice { background: rgba(46,160,67,0.12); border: 1px solid #2ea043; }
        .actions { display: flex; gap: 12px; margin-top: 8px; flex-wrap: wrap; }
        .btnSecondary { text-decoration: none; font-weight: 600; border-radius: 10px; padding: 12px 16px; display: inline-flex; align-items: center; transition: transform .15s ease, background .15s ease; }
        .btnSecondary:hover { transform: translateY(-1px); }
        .btnSecondary.sm { padding: 8px 12px; font-weight: 600; }
        ul { margin: 0; padding-left: 20px; line-height: 1.8; }
        .smallNote { margin-top: 12px; font-size: 13px; }
        @media (max-width: 1024px) { 
          .grid { grid-template-columns: 1fr; } 
          .infoCard { position: static; } 
        }
        @media (max-width: 640px) {
          .container { padding: 20px 16px; }
          .title { font-size: 24px; }
          .subtitle { font-size: 14px; }
          .formCard, .tipsCard, .infoCard { padding: 16px; }
          .actions { flex-direction: column; }
          .actions button { width: 100%; }
        }
      `}</style>
    </div>
  );
}

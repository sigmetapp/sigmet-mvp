// pages/signup.tsx
import Head from 'next/head';
import Link from 'next/link';
import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '@/lib/supabaseClient';

export default function SignupPage() {
  const router = useRouter();

  const colors = {
    bg: '#0d1117',
    surface: '#161b22',
    text: '#c9d1d9',
    muted: '#8b949e',
    border: '#30363d',
    primary: '#2ea043',
    primaryHover: '#3fb950',
    accent: '#58a6ff',
    danger: '#f85149',
  };

  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [agree, setAgree] = useState(true);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const container: React.CSSProperties = {
    maxWidth: '1000px',
    margin: '0 auto',
    padding: '40px 24px',
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

    setLoading(true);
    try {
      const redirectTo =
        typeof window !== 'undefined'
          ? `${window.location.origin}/auth/callback`
          : undefined;

      // 1) Sign up the user with Supabase Auth
      const { data: signData, error: signErr } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectTo,
          data: { full_name: fullName || null },
        },
      });
      if (signErr) throw signErr;

      // 2) Create a profile record
      const userId = signData.user?.id;
      if (userId) {
        const { error: insertErr } = await supabase
          .from('profiles')
          .insert([{ id: userId, email, full_name: fullName || null }]);
        if (insertErr && !/duplicate key|23505/i.test(insertErr.message)) {
          console.warn('profiles insert error:', insertErr.message);
        }
      }

      // 3) Notify admin via API route
      try {
        await fetch('/api/notify-signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, fullName }),
        });
      } catch {
        // Ignore silently if no SMTP configured
      }

      setNotice(
        'Please check your email inbox. A confirmation link has been sent.'
      );
    } catch (err: any) {
      setErrorMsg(err?.message || 'Signup failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ backgroundColor: colors.bg, minHeight: '100vh', color: colors.text }}>
      <Head>
        <title>Sign up | Sigmet</title>
        <meta name="description" content="Create your Sigmet account" />
      </Head>

      <main style={container}>
        <section className="grid">
          <div className="left">
            <h1 className="title">Create your Sigmet account</h1>
            <p className="subtitle">
              Join Sigmet to build your social weight through growth and purpose.
            </p>

            <form onSubmit={handleSubmit} className="formCard">
              <div className="formRow">
                <label htmlFor="fullName">Full name</label>
                <input
                  id="fullName"
                  type="text"
                  placeholder="Alex Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>

              <div className="formRow">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="formRow">
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  type="password"
                  placeholder="Minimum 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
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
              {notice && <div className="alert notice">{notice}</div>}

              <div className="actions">
                <button className="btnPrimary" disabled={loading}>
                  {loading ? 'Creating...' : 'Create account'}
                </button>
                <Link className="btnSecondary" href="/login">
                  I already have an account
                </Link>
              </div>
            </form>

            <div className="tipsCard">
              <h3>Quick tips</h3>
              <ul>
                <li>Use a valid email to receive the confirmation link.</li>
                <li>After confirming, you can complete your profile setup.</li>
                <li>Choose 3 growth areas to personalize your experience.</li>
              </ul>
            </div>
          </div>

          <div className="right">
            <div className="infoCard">
              <h3>Why Sigmet</h3>
              <ul>
                <li>Communities built on purpose, not popularity.</li>
                <li>Transparent and fair social weight system.</li>
                <li>Insightful analytics for creators and members.</li>
              </ul>
              <div className="smallNote">
                A verification email will be sent to ensure account security.
              </div>
            </div>
          </div>
        </section>
      </main>

      <style jsx>{`
        .grid {
          display: grid;
          grid-template-columns: 1.2fr 1fr;
          gap: 32px;
        }
        .title {
          font-size: 32px;
          font-weight: 700;
          margin: 0 0 8px;
        }
        .subtitle {
          color: ${colors.muted};
          margin: 0 0 20px;
          line-height: 1.7;
        }
        .formCard, .tipsCard, .infoCard {
          background: ${colors.surface};
          border: 1px solid ${colors.border};
          border-radius: 12px;
          padding: 24px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.25);
        }
        .formCard { margin-top: 8px; }
        .tipsCard { margin-top: 20px; }
        .infoCard { position: sticky; top: 24px; }
        .formRow {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 16px;
        }
        label {
          font-size: 14px;
          color: ${colors.muted};
        }
        input[type="text"],
        input[type="email"],
        input[type="password"] {
          background: #0b1320;
          border: 1px solid ${colors.border};
          color: ${colors.text};
          padding: 12px 14px;
          border-radius: 10px;
          outline: none;
          transition: border .15s ease, box-shadow .15s ease;
        }
        input::placeholder { color: #6b7280; }
        input:focus {
          border-color: ${colors.accent};
          box-shadow: 0 0 0 3px rgba(88,166,255,0.2);
        }
        .checkboxRow {
          display: flex;
          align-items: center;
          gap: 10px;
          margin: 8px 0 12px;
          color: ${colors.muted};
        }
        .alert {
          border-radius: 10px;
          padding: 12px 14px;
          font-size: 14px;
          margin: 8px 0 12px;
        }
        .alert.error {
          background: rgba(248,81,73,0.1);
          border: 1px solid ${colors.danger};
        }
        .alert.notice {
          background: rgba(46,160,67,0.12);
          border: 1px solid ${colors.primary};
        }
        .actions {
          display: flex;
          gap: 12px;
          margin-top: 8px;
        }
        .btnPrimary {
          background: ${colors.primary};
          border: none;
          color: #fff;
          font-weight: 700;
          border-radius: 10px;
          padding: 12px 18px;
          cursor: pointer;
          transition: transform .15s ease, background .15s ease, box-shadow .15s ease;
          box-shadow: 0 6px 16px rgba(46,160,67,0.25);
        }
        .btnPrimary:hover { background: ${colors.primaryHover}; transform: translateY(-1px); }
        .btnPrimary:disabled { opacity: .7; cursor: not-allowed; }
        .btnSecondary {
          text-decoration: none;
          background: rgba(88,166,255,0.08);
          border: 1px solid ${colors.accent};
          color: ${colors.accent};
          font-weight: 600;
          border-radius: 10px;
          padding: 12px 16px;
          display: inline-flex;
          align-items: center;
          transition: transform .15s ease, background .15s ease;
        }
        .btnSecondary:hover { background: rgba(88,166,255,0.15); transform: translateY(-1px); }
        ul {
          margin: 0;
          padding-left: 20px;
          line-height: 1.8;
          color: ${colors.muted};
        }
        .smallNote {
          margin-top: 12px;
          font-size: 13px;
          color: ${colors.muted};
        }

        @media (max-width: 1024px) {
          .grid { grid-template-columns: 1fr; }
          .infoCard { position: static; }
        }
      `}</style>
    </div>
  );
}

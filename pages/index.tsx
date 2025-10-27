// pages/index.tsx
import Head from 'next/head';
import Link from 'next/link';
import React from 'react';

export default function Home() {
  const colors = {
    bg: '#0d1117',
    surface: '#161b22',
    text: '#c9d1d9',
    muted: '#8b949e',
    border: '#30363d',
    primary: '#2ea043',
    primaryHover: '#3fb950',
    accent: '#58a6ff',
  };

  const container: React.CSSProperties = {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '40px 24px',
  };

  const card: React.CSSProperties = {
    backgroundColor: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: 12,
    padding: 24,
    boxShadow: '0 2px 10px rgba(0,0,0,0.25)',
    transition: 'transform .2s ease, box-shadow .2s ease',
  };

  const list: React.CSSProperties = {
    color: colors.muted,
    lineHeight: 1.8,
    paddingLeft: 20,
  };

  return (
    <div style={{ backgroundColor: colors.bg, minHeight: '100vh', color: colors.text }}>
      <Head>
        <title>Sigmet</title>
        <meta name="description" content="Sigmet social network" />
      </Head>

      <main style={container}>
        {/* HERO */}
        <section className="hero">
          <div className="hero-grid">
            <div>
              <h1 className="title">
                Build your <span className="accent">social weight</span> with real progress
              </h1>
              <p className="subtitle">
                Sigmet helps you grow with purpose. Share content, track goals, and see your evolution through data.
              </p>
              <div className="cta">
                <Link href="/feed" className="btnPrimary">Go to feed</Link>
                <Link href="/docs" className="btnSecondary">Learn more</Link>
              </div>
            </div>

            <div>
              <div style={card} className="hoverCard">
                <h3 style={{ marginTop: 0 }}>Quick start</h3>
                <ol style={list}>
                  <li>Sign up and confirm your email</li>
                  <li>Set your profile and avatar</li>
                  <li>Select 3 key growth directions</li>
                  <li>Start sharing and tracking progress</li>
                </ol>
                <Link href="/signup" className="btnPrimary sm">Create account</Link>
              </div>
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section className="features">
          <div style={card} className="hoverCard">
            <h3>🎯 Purpose-driven communities</h3>
            <p style={{ color: colors.muted }}>
              Focus on what matters. Join groups that align with your goals — less noise, more meaning.
            </p>
          </div>

          <div style={card} className="hoverCard">
            <h3>⚖️ Transparent social weight</h3>
            <p style={{ color: colors.muted }}>
              Reputation built from verified activity, contributions, and learning.
            </p>
          </div>

          <div style={card} className="hoverCard">
            <h3>🪶 Creator-first ecosystem</h3>
            <p style={{ color: colors.muted }}>
              Full analytics, fair authorship, and visibility for every creator.
            </p>
          </div>
        </section>

        {/* UPDATES */}
        <section style={{ ...card, marginTop: 40 }} className="hoverCard">
          <h3>📢 Latest updates</h3>
          <ul style={list}>
            <li>New profile dashboard with analytics</li>
            <li>Faster content loading in feed</li>
            <li>Improved onboarding flow</li>
          </ul>
          <Link href="/changelog" className="btnSecondary sm">View changelog</Link>
        </section>
      </main>

      <style jsx>{`
        .hero-grid {
          display: grid;
          grid-template-columns: 1.2fr 1fr;
          gap: 32px;
        }
        .title {
          font-size: 36px;
          font-weight: 700;
          margin: 0;
          line-height: 1.25;
        }
        .accent {
          color: ${colors.accent};
        }
        .subtitle {
          color: ${colors.muted};
          margin-top: 12px;
          font-size: 17px;
          line-height: 1.7;
        }
        .cta {
          display: flex;
          gap: 16px;
          margin-top: 24px;
        }
        .btnPrimary {
          background: ${colors.primary};
          border: none;
          color: #fff;
          font-weight: 600;
          border-radius: 8px;
          padding: 12px 20px;
          text-decoration: none;
          transition: background .2s ease, transform .2s ease;
        }
        .btnPrimary:hover {
          background: ${colors.primaryHover};
          transform: translateY(-1px);
        }
        .btnSecondary {
          background: rgba(88,166,255,0.1);
          border: 1px solid ${colors.accent};
          color: ${colors.accent};
          font-weight: 500;
          border-radius: 8px;
          padding: 12px 20px;
          text-decoration: none;
          transition: background .2s ease, transform .2s ease;
        }
        .btnSecondary:hover {
          background: rgba(88,166,255,0.15);
          transform: translateY(-1px);
        }
        .btnPrimary.sm, .btnSecondary.sm {
          padding: 8px 14px;
          margin-top: 14px;
        }
        .features {
          margin-top: 48px;
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 24px;
        }
        .hoverCard:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 16px rgba(0,0,0,0.3);
        }

        /* Responsive */
        @media (max-width: 1024px) {
          .hero-grid {
            grid-template-columns: 1fr;
          }
          .features {
            grid-template-columns: 1fr 1fr;
          }
        }
        @media (max-width: 640px) {
          .features {
            grid-template-columns: 1fr;
          }
          .title {
            font-size: 28px;
          }
        }
      `}</style>
    </div>
  );
}

// pages/index.tsx
import Head from 'next/head';
import Link from 'next/link';
import React from 'react';

export default function Home() {
  // GitHub Dark palette
  const colors = {
    bg: '#0d1117',
    surface: '#161b22',
    text: '#c9d1d9',
    muted: '#8b949e',
    border: '#30363d',
    primary: '#238636',
    primaryBorder: '#2ea043',
    buttonHover: '#2ea043',
    link: '#58a6ff',
  };

  const container: React.CSSProperties = {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '40px 24px',
  };

  const card: React.CSSProperties = {
    backgroundColor: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    padding: 24,
  };

  const muted: React.CSSProperties = { color: colors.muted };

  return (
    <div style={{ backgroundColor: colors.bg, minHeight: '100vh', color: colors.text }}>
      <Head>
        <title>Sigmet</title>
        <meta name="description" content="Sigmet social network" />
      </Head>

      {/* MAIN CONTENT ONLY. Header and Footer are rendered elsewhere */}
      <main style={container}>
        {/* Hero */}
        <section className="hero">
          <div className="hero-grid">
            <div>
              <h1 className="title">
                Build your social weight with real progress
              </h1>
              <p className="subtitle">
                Sigmet is a modern social network where your actions shape reputation and growth.
                Create posts, track achievements, join focused communities, and see your value grow.
              </p>
              <div className="cta">
                <Link href="/feed" className="btnPrimary">Go to feed</Link>
                <Link href="/docs" className="btnGhost">Learn more</Link>
              </div>
            </div>

            <div>
              <div style={card}>
                <h3 style={{ marginTop: 0, marginBottom: 8, color: colors.text }}>Quick start</h3>
                <ol style={{ ...muted, paddingLeft: 18, margin: 0, lineHeight: 1.7 }}>
                  <li>Create an account</li>
                  <li>Complete basic profile</li>
                  <li>Pick 3 growth directions</li>
                  <li>Post your first update</li>
                </ol>
                <Link href="/signup" className="btnPrimary sm">Create account</Link>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="features">
          <div style={card}>
            <h3 className="cardTitle">Communities by purpose</h3>
            <p style={{ ...muted, margin: 0 }}>
              Tune your feed with topics that matter. Less noise, more depth.
            </p>
          </div>

          <div style={card}>
            <h3 className="cardTitle">Social weight</h3>
            <p style={{ ...muted, margin: 0 }}>
              A transparent score based on activity, contributions, learning, and impact.
            </p>
          </div>

          <div style={card}>
            <h3 className="cardTitle">Creator first</h3>
            <p style={{ ...muted, margin: 0 }}>
              Fair authorship and analytics for posts, media, and long form content.
            </p>
          </div>
        </section>

        {/* Updates */}
        <section style={{ ...card, marginTop: 32 }}>
          <h3 style={{ marginTop: 0, color: colors.text }}>Latest updates</h3>
          <ul style={{ ...muted, paddingLeft: 18, margin: 0, lineHeight: 1.8 }}>
            <li>Profile header redesign</li>
            <li>Feed performance improvements</li>
            <li>Early Social Weight dashboard</li>
          </ul>
        </section>
      </main>

      {/* PAGE SCOPED STYLES */}
      <style jsx>{`
        .hero-grid {
          display: grid;
          grid-template-columns: 1.2fr 1fr;
          gap: 24px;
        }
        .title {
          margin: 0;
          font-size: 32px;
          line-height: 1.2;
        }
        .subtitle {
          margin-top: 12px;
          font-size: 16px;
          line-height: 1.7;
          color: ${colors.muted};
        }
        .cta {
          display: flex;
          gap: 12px;
          margin-top: 16px;
        }
        .btnPrimary {
          display: inline-block;
          text-decoration: none;
          background: ${colors.primary};
          border: 1px solid ${colors.primaryBorder};
          color: #fff;
          border-radius: 6px;
          padding: 10px 16px;
          font-weight: 600;
        }
        .btnPrimary.sm {
          margin-top: 14px;
          padding: 8px 12px;
        }
        .btnPrimary:hover {
          background: ${colors.buttonHover};
        }
        .btnGhost {
          display: inline-block;
          text-decoration: none;
          background: transparent;
          border: 1px solid ${colors.border};
          color: ${colors.text};
          border-radius: 6px;
          padding: 10px 16px;
          font-weight: 500;
        }
        .btnGhost:hover {
          background: rgba(255, 255, 255, 0.04);
        }
        .features {
          margin-top: 32px;
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 24px;
        }
        .cardTitle {
          margin-top: 0;
          margin-bottom: 8px;
        }
        a {
          color: ${colors.link};
        }
        a:hover {
          opacity: 0.95;
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
            font-size: 26px;
          }
        }
      `}</style>
    </div>
  );
}

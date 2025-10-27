// pages/index.tsx
import Head from 'next/head';
import Link from 'next/link';
import React from 'react';

export default function Home() {
  const container: React.CSSProperties = {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '0 24px',
  };

  const card: React.CSSProperties = {
    backgroundColor: '#ffffff',
    border: '1px solid #d0d7de',
    borderRadius: 8,
    padding: 24,
  };

  const muted: React.CSSProperties = { color: '#57606a' };

  return (
    <div style={{ backgroundColor: '#f6f8fa', minHeight: '100vh' }}>
      <Head>
        <title>Sigmet</title>
        <meta name="description" content="Sigmet social network" />
      </Head>

      {/* Header */}
      <header
        style={{
          backgroundColor: '#ffffff',
          borderBottom: '1px solid #d0d7de',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <div style={{ ...container, display: 'flex', alignItems: 'center', height: 56 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              aria-label="Sigmet"
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                border: '1px solid #d0d7de',
                background: 'linear-gradient(180deg,#fafbfc,#eff2f6)',
              }}
            />
            <Link href="/" style={{ textDecoration: 'none' }}>
              <span style={{ fontSize: 18, fontWeight: 600, color: '#24292f' }}>Sigmet</span>
            </Link>
          </div>

          <nav style={{ marginLeft: 24, display: 'flex', gap: 16 }}>
            <Link href="/feed" style={{ color: '#24292f', textDecoration: 'none' }}>Feed</Link>
            <Link href="/profile" style={{ color: '#24292f', textDecoration: 'none' }}>Profile</Link>
            <Link href="/sw" style={{ color: '#24292f', textDecoration: 'none' }}>Social Weight</Link>
            <Link href="/about" style={{ color: '#24292f', textDecoration: 'none' }}>About</Link>
          </nav>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 12 }}>
            <Link
              href="/login"
              style={{
                border: '1px solid #d0d7de',
                borderRadius: 6,
                padding: '6px 12px',
                color: '#24292f',
                textDecoration: 'none',
                backgroundColor: '#fafbfc',
              }}
            >
              Login
            </Link>
            <Link
              href="/signup"
              style={{
                border: '1px solid #1f883d',
                backgroundColor: '#2da44e',
                color: '#ffffff',
                borderRadius: 6,
                padding: '6px 12px',
                textDecoration: 'none',
                fontWeight: 600,
              }}
            >
              Sign up
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main style={{ ...container, paddingTop: 40, paddingBottom: 40 }}>
        <section style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 24 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32, lineHeight: 1.2, color: '#24292f' }}>
              Build your social weight with real progress
            </h1>
            <p style={{ ...muted, marginTop: 12, fontSize: 16, lineHeight: 1.7 }}>
              Sigmet is a modern social network where your actions shape reputation and growth.
              Create posts, track achievements, join focused communities, and see your value grow.
            </p>
            <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
              <Link
                href="/feed"
                style={{
                  backgroundColor: '#2da44e',
                  color: '#fff',
                  border: '1px solid #1f883d',
                  borderRadius: 6,
                  padding: '10px 16px',
                  textDecoration: 'none',
                  fontWeight: 600,
                }}
              >
                Go to feed
              </Link>
              <Link
                href="/docs"
                style={{
                  backgroundColor: '#ffffff',
                  color: '#24292f',
                  border: '1px solid #d0d7de',
                  borderRadius: 6,
                  padding: '10px 16px',
                  textDecoration: 'none',
                  fontWeight: 500,
                }}
              >
                Learn more
              </Link>
            </div>
          </div>

          <div>
            <div style={{ ...card }}>
              <h3 style={{ marginTop: 0, marginBottom: 8, color: '#24292f' }}>Quick start</h3>
              <ol style={{ ...muted, paddingLeft: 18, margin: 0, lineHeight: 1.7 }}>
                <li>Create an account</li>
                <li>Complete basic profile</li>
                <li>Pick 3 growth directions</li>
                <li>Post your first update</li>
              </ol>
              <Link
                href="/signup"
                style={{
                  display: 'inline-block',
                  marginTop: 14,
                  textDecoration: 'none',
                  border: '1px solid #1f883d',
                  backgroundColor: '#2da44e',
                  color: '#fff',
                  borderRadius: 6,
                  padding: '8px 12px',
                  fontWeight: 600,
                }}
              >
                Create account
              </Link>
            </div>
          </div>
        </section>

        {/* Feature cards */}
        <section style={{ marginTop: 32, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24 }}>
          <div style={card}>
            <h3 style={{ marginTop: 0, marginBottom: 8, color: '#24292f' }}>Communities by purpose</h3>
            <p style={{ ...muted, margin: 0 }}>
              Tune your feed with topics that matter. Less noise, more depth.
            </p>
          </div>

          <div style={card}>
            <h3 style={{ marginTop: 0, marginBottom: 8, color: '#24292f' }}>Social weight</h3>
            <p style={{ ...muted, margin: 0 }}>
              A transparent score based on activity, contributions, learning, and impact.
            </p>
          </div>

          <div style={card}>
            <h3 style={{ marginTop: 0, marginBottom: 8, color: '#24292f' }}>Creator first</h3>
            <p style={{ ...muted, margin: 0 }}>
              Fair authorship and analytics for posts, media, and long form content.
            </p>
          </div>
        </section>

        {/* Secondary section */}
        <section style={{ marginTop: 32, ...card }}>
          <h3 style={{ marginTop: 0, color: '#24292f' }}>Latest updates</h3>
          <ul style={{ ...muted, paddingLeft: 18, margin: 0, lineHeight: 1.8 }}>
            <li>Profile header redesign</li>
            <li>Feed performance improvements</li>
            <li>Early Social Weight dashboard</li>
          </ul>
        </section>
      </main>

      {/* Footer */}
      <footer
        style={{
          backgroundColor: '#ffffff',
          borderTop: '1px solid #d0d7de',
          marginTop: 40,
        }}
      >
        <div style={{ ...container, paddingTop: 16, paddingBottom: 16, textAlign: 'center' }}>
          <p style={{ ...muted, margin: 0 }}>
            © {new Date().getFullYear()} Sigmet. All rights reserved.
          </p>
        </div>
      </footer>

      {/* Small responsive tweaks */}
      <style jsx>{`
        @media (max-width: 1024px) {
          main > section:first-of-type {
            grid-template-columns: 1fr;
          }
          main > section:nth-of-type(2) {
            grid-template-columns: 1fr 1fr;
          }
        }
        @media (max-width: 640px) {
          main > section:nth-of-type(2) {
            grid-template-columns: 1fr;
          }
        }
        a:hover { opacity: 0.9; }
        nav a:hover { text-decoration: underline; }
      `}</style>
    </div>
  );
}

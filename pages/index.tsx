// pages/index.tsx
import Head from "next/head";
import Link from "next/link";

export default function Home() {
  return (
    <>
      <Head>
        <title>Sigmet</title>
        <meta name="description" content="Sigmet social network" />
      </Head>

      <section className="relative overflow-hidden">
        {/* ambient color wash */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "radial-gradient(600px 300px at 10% -10%, rgba(88,166,255,.5), transparent), radial-gradient(600px 300px at 90% -10%, rgba(46,160,67,.5), transparent)",
          }}
        />

        <div className="relative max-w-7xl mx-auto px-4 py-16 md:py-24">
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70 mb-4">
                New: Faster feed and analytics
              </div>
              <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight">
                Build your <span className="gradient-text">social weight</span> with real progress
              </h1>
              <p className="mt-4 text-white/70 text-lg">
                Sigmet helps you grow with purpose. Share content, track goals, and see your evolution through data.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/feed" className="btn btn-primary">Go to feed</Link>
                <Link href="/signup" className="btn border border-white/20 text-white/80 hover:bg-white/10">Create account</Link>
              </div>
            </div>

            <div>
              <div className="card p-6 md:p-8">
                <h3 className="text-white text-xl font-semibold">Quick start</h3>
                <ol className="mt-4 space-y-2 text-white/70 list-decimal list-inside">
                  <li>Sign up and confirm your email</li>
                  <li>Set your profile and avatar</li>
                  <li>Select 3 key growth directions</li>
                  <li>Start sharing and tracking progress</li>
                </ol>
                <Link href="/signup" className="btn btn-primary mt-4">Get started</Link>
              </div>
            </div>
          </div>

          <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="card p-6 transition-shadow hover:shadow-[0_10px_40px_rgba(0,0,0,0.35)]">
              <h3 className="text-white font-semibold text-lg">🎯 Purpose-driven communities</h3>
              <p className="mt-2 text-white/70">Focus on what matters. Join groups that align with your goals — less noise, more meaning.</p>
            </div>
            <div className="card p-6 transition-shadow hover:shadow-[0_10px_40px_rgba(0,0,0,0.35)]">
              <h3 className="text-white font-semibold text-lg">⚖️ Transparent social weight</h3>
              <p className="mt-2 text-white/70">Reputation built from verified activity, contributions, and learning.</p>
            </div>
            <div className="card p-6 transition-shadow hover:shadow-[0_10px_40px_rgba(0,0,0,0.35)]">
              <h3 className="text-white font-semibold text-lg">🪶 Creator-first ecosystem</h3>
              <p className="mt-2 text-white/70">Full analytics, fair authorship, and visibility for every creator.</p>
            </div>
          </div>

          <div className="mt-16 card p-6 md:p-8">
            <h3 className="text-white text-xl font-semibold">📢 Latest updates</h3>
            <ul className="mt-3 text-white/70 list-disc list-inside space-y-1">
              <li>New profile dashboard with analytics</li>
              <li>Faster content loading in feed</li>
              <li>Improved onboarding flow</li>
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}

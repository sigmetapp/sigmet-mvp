import Link from 'next/link';

export default function Home() {
  return (
    <main className="grid gap-6">
      <div className="card">
        <h1 className="text-2xl font-semibold mb-2">Welcome to Sigmet MVP</h1>
        <p className="text-sm text-[var(--muted)]">Minimal build to test profiles, feed, messages, invites and SW score.</p>
        <div className="mt-4 flex gap-3">
          <Link className="btn" href="/dashboard">Open feed</Link>
          <Link className="btn" href="/profile">Edit profile</Link>
        </div>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <div className="card"><b>1. Auth</b><p className="text-sm text-[var(--muted)] mt-1">Connect Supabase Auth and run SQL schema.</p></div>
        <div className="card"><b>2. Feed</b><p className="text-sm text-[var(--muted)] mt-1">Create posts with text or media and see them in the feed.</p></div>
        <div className="card"><b>3. SW v0</b><p className="text-sm text-[var(--muted)] mt-1">Basic score increments on key actions.</p></div>
      </div>
    </main>
  );
}

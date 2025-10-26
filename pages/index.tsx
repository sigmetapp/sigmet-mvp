import Link from "next/link";

export default function Home() {
  return (
    <div className="grid gap-6 md:grid-cols-2 items-stretch">
      <div className="card p-6 shadow-soft">
        <h1 className="text-3xl font-semibold mb-3">Welcome to Sigmet</h1>
        <p className="text-muted">
          Personal feed, profile and simple posting — all in a focused dark UI.
        </p>
        <div className="mt-6 flex gap-3">
          <Link href="/feed" className="btn btn-primary">Open Feed</Link>
          <Link href="/profile" className="btn bg-white/10 text-white border border-white/10">Edit Profile</Link>
        </div>
      </div>
      <div className="card p-6 shadow-soft">
        <h2 className="text-xl font-semibold mb-3">What’s inside</h2>
        <ul className="list-disc pl-5 space-y-2 text-white/80 text-sm">
          <li>Email + password auth (no magic links)</li>
          <li>Profile with avatar (Supabase Storage)</li>
          <li>Public feed with image cover</li>
          <li>Clean, minimal dark design</li>
        </ul>
        <div className="mt-6 text-dim text-xs">
          Tip: Add your Supabase keys in Environment Variables.
        </div>
      </div>
    </div>
  );
}

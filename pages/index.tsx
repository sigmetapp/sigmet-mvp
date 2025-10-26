import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<any | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setUserEmail(user.email ?? null);
      const { data } = await supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
      setProfile(data || null);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="p-6 text-white/70">Loading...</div>;

  if (userEmail && profile) {
    return (
      <main className="grid gap-6 md:grid-cols-2 items-stretch">
        <section className="card p-6 shadow-soft">
          <h1 className="text-2xl font-semibold mb-4">Your profile</h1>
          <div className="flex items-center gap-4 mb-4">
            <img
              src={profile.avatar_url || "/avatar-fallback.png"}
              className="w-16 h-16 rounded-full object-cover"
              alt="avatar"
            />
            <div>
              <div className="text-white font-medium">{profile.full_name || "No name"}</div>
              <div className="text-white/70 text-sm">@{profile.username || "username"}</div>
              <div className="text-white/50 text-xs mt-1">{userEmail}</div>
            </div>
          </div>
          {profile.bio && (
            <p className="text-white/80 text-sm whitespace-pre-wrap">{profile.bio}</p>
          )}
          <div className="mt-6 flex gap-3">
            <Link href="/profile" className="btn btn-primary">Edit profile</Link>
            <Link href="/feed" className="btn bg-white/10 text-white border border-white/10">Open feed</Link>
          </div>
        </section>

        <section className="card p-6 shadow-soft">
          <h2 className="text-xl font-semibold mb-3">Shortcuts</h2>
          <ul className="list-disc pl-5 space-y-2 text-white/80 text-sm">
            <li>Update your avatar and bio in <span className="font-medium">Profile settings</span></li>
            <li>Create posts with an image cover in <span className="font-medium">Feed</span></li>
            <li>Sign out via the top-right menu</li>
          </ul>
        </section>
      </main>
    );
  }

  return (
    <main className="grid gap-6 md:grid-cols-2 items-stretch">
      <section className="card p-6 shadow-soft">
        <h1 className="text-3xl font-semibold mb-3">Welcome to Sigmet</h1>
        <p className="text-white/70">
          Personal feed, profile and simple posting — all in a focused dark UI.
        </p>
        <div className="mt-6 flex gap-3">
          <Link href="/auth" className="btn btn-primary">Sign in</Link>
          <Link href="/feed" className="btn bg-white/10 text-white border border-white/10">Browse feed</Link>
        </div>
      </section>

      <section className="card p-6 shadow-soft">
        <h2 className="text-xl font-semibold mb-3">What’s inside</h2>
        <ul className="list-disc pl-5 space-y-2 text-white/80 text-sm">
          <li>Email + password auth (no magic links)</li>
          <li>Profile with avatar (Supabase Storage)</li>
          <li>Public feed with image cover</li>
          <li>Clean, minimal dark design</li>
        </ul>
        <div className="mt-6 text-white/50 text-xs">
          Tip: Add your Supabase keys in Environment Variables.
        </div>
      </section>
    </main>
  );
}

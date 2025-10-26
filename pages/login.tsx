// pages/login.tsx
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({ provider: "google" });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white">
      <div className="p-6 rounded-2xl border border-white/10 bg-white/5 text-center space-y-4">
        <h1 className="text-xl font-medium">Login</h1>
        <button
          onClick={signInWithGoogle}
          className="px-4 py-2 rounded-xl bg-white/90 text-black hover:bg-white transition"
        >
          Continue with Google
        </button>
      </div>
    </div>
  );
}

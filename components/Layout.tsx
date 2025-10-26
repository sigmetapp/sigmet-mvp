import Link from "next/link";
import { UserMenu } from "@/components/UserMenu";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-sigmet text-white">
      <Header />
      <main className="container pt-6 pb-12">{children}</main>
      <Footer />
    </div>
  );
}

function Header() {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserEmail(user?.email ?? null);
    })();
  }, []);
  return (
    <header className="sticky top-0 z-40 backdrop-blur-sm bg-base.panel/60 border-b border-white/10">
      <div className="container h-16 flex items-center justify-between">
        <Link href="/" className="text-white/90 text-lg font-semibold">Sigmet</Link>
        <nav className="flex items-center gap-6">
          <Link href="/feed" className="text-white/80 hover:text-white text-sm">Feed</Link>
          <Link href="/profile" className="text-white/80 hover:text-white text-sm">Profile</Link>
          {userEmail ? (
            <UserMenu />
          ) : (
            <Link href="/auth" className="btn btn-primary text-sm">Sign in</Link>
          )}
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-12 border-t border-white/10">
      <div className="container py-8 text-dim text-sm">
        © {new Date().getFullYear()} Sigmet
      </div>
    </footer>
  );
}

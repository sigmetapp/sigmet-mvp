import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { useSiteSettings } from "@/components/SiteSettingsContext";
import { supabase } from "@/lib/supabaseClient";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/feed", label: "Feed" },
  { href: "/profile", label: "Profile" },
  { href: "/settings", label: "Settings" },
];

export default function Header() {
  const { logo_url, site_name } = useSiteSettings();
  const [user, setUser] = useState<any>(null);
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-black/30 backdrop-blur supports-[backdrop-filter]:bg-black/30">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-3">
        {/* LOGO + TITLE */}
        <Link href="/" className="flex items-center gap-2 group">
          {logo_url ? (
            <Image
              src={logo_url}
              alt="Logo"
              width={36}
              height={36}
              className="rounded-md"
            />
          ) : (
            <div className="h-9 w-9 rounded-md bg-white/10 grid place-items-center border border-white/10">S</div>
          )}
          <span className="text-white/90 font-semibold tracking-tight">
            {site_name || "SIGMET"}
          </span>
        </Link>

        {/* MAIN NAV */}
        <nav className="ml-auto flex items-center gap-1">
          {navLinks.map((l) => {
            const active = router.pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`px-3 py-1.5 rounded-lg text-sm transition ${
                  active
                    ? "bg-white text-black"
                    : "text-white/75 hover:text-white hover:bg-white/10"
                }`}
              >
                {l.label}
              </Link>
            );
          })}

          {/* AUTH LINKS */}
          {!user ? (
            <>
              <Link
                href="/login"
                className="ml-2 px-3 py-1.5 rounded-lg text-sm border border-white/20 text-white/80 hover:bg-white/10 transition"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="ml-2 px-3 py-1.5 rounded-lg text-sm bg-white text-black hover:opacity-90 transition"
              >
                Sign up
              </Link>
            </>
          ) : (
            <button
              onClick={handleLogout}
              className="ml-2 px-3 py-1.5 rounded-lg text-sm border border-white/20 text-white/80 hover:bg-white/10 transition"
            >
              Logout
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}

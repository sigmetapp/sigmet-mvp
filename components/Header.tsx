"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSiteSettings } from "@/components/SiteSettingsContext";
import { supabase } from "@/lib/supabaseClient";
import { useTheme } from "@/components/ThemeProvider";
import { Sun, Moon } from "lucide-react";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/feed", label: "Feed" },
  { href: "/profile", label: "Profile" },
];

export default function Header() {
  const { logo_url, site_name } = useSiteSettings();
  const [user, setUser] = useState<any>(null);
  const [pathname, setPathname] = useState<string>("");
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    setPathname(typeof window !== "undefined" ? window.location.pathname : "");
    return () => listener.subscription.unsubscribe();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
  }

  const isLight = theme === "light";

  return (
    <header
      className={`sticky top-0 z-50 backdrop-blur supports-[backdrop-filter]:bg-black/30 ${
        isLight ? "border-b border-black/10 bg-white/70 supports-[backdrop-filter]:bg-white/60" : "border-b border-white/10 bg-black/30"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-3">
        {/* LOGO + TITLE */}
        <Link href="/" className="flex items-center gap-2 group">
          {logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logo_url}
              alt="Logo"
              width={36}
              height={36}
              className="rounded-md"
            />
          ) : (
            <div className="h-9 w-9 rounded-md bg-white/10 grid place-items-center border border-white/10">S</div>
          )}
          <span className={`${isLight ? "text-black/90" : "text-white/90"} font-semibold tracking-tight`}>
            {site_name || "SIGMET"}
          </span>
        </Link>

        {/* MAIN NAV */}
        <nav className="ml-auto flex items-center gap-1">
          {navLinks.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`px-3 py-1.5 rounded-lg text-sm transition ${
                  active
                    ? "bg-white text-black"
                    : isLight
                    ? "text-black/70 hover:text-black hover:bg-black/5"
                    : "text-white/75 hover:text-white hover:bg-white/10"
                }`}
              >
                {l.label}
              </Link>
            );
          })}

          {/* THEME TOGGLE */}
          <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className={`ml-2 h-9 w-9 grid place-items-center rounded-lg border transition ${
              isLight
                ? "border-black/10 text-black/70 hover:bg-black/5"
                : "border-white/20 text-white/80 hover:bg-white/10"
            }`}
            title={isLight ? "Switch to dark" : "Switch to light"}
          >
            {isLight ? <Moon size={16} /> : <Sun size={16} />}
          </button>

          {/* AUTH LINKS */}
          {!user ? (
            <>
              <Link
                href="/login"
                className={`ml-2 px-3 py-1.5 rounded-lg text-sm border transition ${
                  isLight
                    ? "border-black/10 text-black/70 hover:bg-black/5"
                    : "border-white/20 text-white/80 hover:bg-white/10"
                }`}
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
              className={`ml-2 px-3 py-1.5 rounded-lg text-sm border transition ${
                isLight
                  ? "border-black/10 text-black/70 hover:bg-black/5"
                  : "border-white/20 text-white/80 hover:bg-white/10"
              }`}
            >
              Logout
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}

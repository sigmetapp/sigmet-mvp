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
      className={`sticky top-0 z-50 backdrop-blur-md transition-colors ${
        isLight 
          ? "border-b border-telegram-blue/15 bg-white/80 supports-[backdrop-filter]:bg-white/70" 
          : "border-b border-telegram-blue/20 bg-[rgba(15,22,35,0.8)] supports-[backdrop-filter]:bg-[rgba(15,22,35,0.7)]"
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
            <div className={`h-9 w-9 rounded-md grid place-items-center border ${
              isLight 
                ? "bg-telegram-blue/10 border-telegram-blue/20 text-telegram-blue" 
                : "bg-telegram-blue/20 border-telegram-blue/30 text-telegram-blue-light"
            }`}>
              S
            </div>
          )}
          <span className={`${isLight ? "text-telegram-text" : "text-telegram-text"} font-semibold tracking-tight`}>
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
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  active
                    ? isLight
                      ? "bg-telegram-blue text-white shadow-[0_2px_8px_rgba(51,144,236,0.25)]"
                      : "bg-telegram-blue text-white shadow-[0_2px_8px_rgba(51,144,236,0.3)]"
                    : isLight
                    ? "text-telegram-text-secondary hover:text-telegram-blue hover:bg-telegram-blue/10"
                    : "text-telegram-text-secondary hover:text-telegram-blue-light hover:bg-telegram-blue/15"
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
                ? "border-telegram-blue/20 text-telegram-blue hover:bg-telegram-blue/10"
                : "border-telegram-blue/30 text-telegram-blue-light hover:bg-telegram-blue/20"
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
                className={`ml-2 px-3 py-1.5 rounded-lg text-sm font-medium border-2 transition ${
                  isLight
                    ? "border-telegram-blue text-telegram-blue hover:bg-telegram-blue/10"
                    : "border-telegram-blue text-telegram-blue-light hover:bg-telegram-blue/15"
                }`}
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className={`ml-2 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  isLight
                    ? "bg-telegram-blue text-white hover:bg-telegram-blue-dark shadow-[0_2px_8px_rgba(51,144,236,0.25)]"
                    : "bg-telegram-blue text-white hover:bg-telegram-blue-dark shadow-[0_2px_8px_rgba(51,144,236,0.3)]"
                }`}
              >
                Sign up
              </Link>
            </>
          ) : (
            <button
              onClick={handleLogout}
              className={`ml-2 px-3 py-1.5 rounded-lg text-sm font-medium border-2 transition ${
                isLight
                  ? "border-telegram-blue/30 text-telegram-text-secondary hover:text-telegram-blue hover:bg-telegram-blue/10"
                  : "border-telegram-blue/30 text-telegram-text-secondary hover:text-telegram-blue-light hover:bg-telegram-blue/15"
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

"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSiteSettings } from "@/components/SiteSettingsContext";
import { supabase } from "@/lib/supabaseClient";
import { useTheme } from "@/components/ThemeProvider";
import { Sun, Moon, Home, Rss, UserPlus } from "lucide-react";
import SearchInput from "@/components/SearchInput";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/feed", label: "Feed" },
  { href: "/invite", label: "Invite" },
];

export default function Header() {
  const { logo_url, site_name } = useSiteSettings();
  const [user, setUser] = useState<any>(null);
  const [pathname, setPathname] = useState<string>("");
  // Mobile menu removed in favor of inline icons
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
      <div className="max-w-7xl mx-auto px-4 h-14 relative">
        {/* LOGO + TITLE (DESKTOP) */}
        <Link href="/" className="hidden md:flex absolute left-4 items-center gap-2 group flex-shrink-0 h-14">
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
          <span className={`${isLight ? "text-telegram-text" : "text-telegram-text"} font-semibold tracking-tight hidden sm:inline`}>
            {site_name || "SIGMET"}
          </span>
          <span className={`px-2 py-0.5 rounded-md text-xs font-normal tracking-wide hidden sm:inline-flex items-center border ${
            isLight
              ? "border-orange-500/60 text-orange-600"
              : "border-orange-500/70 text-orange-400"
          }`}>
            Pre-Alpha
          </span>
        </Link>

        {/* SEARCH INPUT - CENTERED (DESKTOP) */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 hidden md:block">
          <SearchInput />
        </div>

        {/* DESKTOP NAV */}
        <nav className="absolute right-4 top-1/2 -translate-y-1/2 hidden md:flex items-center gap-1 flex-shrink-0">
          {navLinks.map((l) => {
            const active = pathname === l.href;
            const isExternal = l.href.startsWith("http");
            const className = `px-3 py-1.5 rounded-lg text-sm font-medium transition ${
              active
                ? isLight
                  ? "bg-telegram-blue text-white shadow-[0_2px_8px_rgba(51,144,236,0.25)]"
                  : "bg-telegram-blue text-white shadow-[0_2px_8px_rgba(51,144,236,0.3)]"
                : isLight
                ? "text-telegram-text-secondary hover:text-telegram-blue hover:bg-telegram-blue/10"
                : "text-telegram-text-secondary hover:text-telegram-blue-light hover:bg-telegram-blue/15"
            }`;
            return isExternal ? (
              <a
                key={l.href}
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                className={className}
              >
                {l.label}
              </a>
            ) : (
              <Link
                key={l.href}
                href={l.href}
                className={className}
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

        {/* MOBILE SINGLE ROW LAYOUT */}
        <div className="md:hidden h-14 flex items-center gap-2">
          {/* Mobile logo + brand */}
          <Link href="/" className="flex items-center gap-2 flex-shrink-0">
            {logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logo_url}
                alt="Logo"
                width={28}
                height={28}
                className="rounded-md"
              />
            ) : (
              <div className={`h-7 w-7 rounded-md grid place-items-center border ${
                isLight 
                  ? "bg-telegram-blue/10 border-telegram-blue/20 text-telegram-blue" 
                  : "bg-telegram-blue/20 border-telegram-blue/30 text-telegram-blue-light"
              }`}>
                S
              </div>
            )}
            <span className={`${isLight ? "text-telegram-text" : "text-telegram-text"} font-semibold tracking-tight text-sm`}>{site_name || "SIGMET"}</span>
          </Link>

          {/* Search inline and flexible */}
          <SearchInput className="flex-1 min-w-0 w-auto" />

          {/* Icon nav for Home / Feed / Invite */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <Link
              href="/"
              aria-label="Home"
              className={`h-9 w-9 grid place-items-center rounded-lg border transition ${
                isLight
                  ? "border-telegram-blue/20 text-telegram-text-secondary hover:bg-telegram-blue/10 hover:text-telegram-blue"
                  : "border-telegram-blue/30 text-telegram-text-secondary hover:bg-telegram-blue/20 hover:text-telegram-blue-light"
              }`}
            >
              <Home size={18} />
            </Link>
            <Link
              href="/feed"
              aria-label="Feed"
              className={`h-9 w-9 grid place-items-center rounded-lg border transition ${
                isLight
                  ? "border-telegram-blue/20 text-telegram-text-secondary hover:bg-telegram-blue/10 hover:text-telegram-blue"
                  : "border-telegram-blue/30 text-telegram-text-secondary hover:bg-telegram-blue/20 hover:text-telegram-blue-light"
              }`}
            >
              <Rss size={18} />
            </Link>
            <Link
              href="/invite"
              aria-label="Invite"
              className={`h-9 w-9 grid place-items-center rounded-lg border transition ${
                isLight
                  ? "border-telegram-blue/20 text-telegram-text-secondary hover:bg-telegram-blue/10 hover:text-telegram-blue"
                  : "border-telegram-blue/30 text-telegram-text-secondary hover:bg-telegram-blue/20 hover:text-telegram-blue-light"
              }`}
            >
              <UserPlus size={18} />
            </Link>

            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className={`h-9 w-9 grid place-items-center rounded-lg border transition ${
                isLight
                  ? "border-telegram-blue/20 text-telegram-blue hover:bg-telegram-blue/10"
                  : "border-telegram-blue/30 text-telegram-blue-light hover:bg-telegram-blue/20"
              }`}
              title={isLight ? "Switch to dark" : "Switch to light"}
            >
              {isLight ? <Moon size={16} /> : <Sun size={16} />}
            </button>
          </div>
        </div>
      </div>

    </header>
  );
}

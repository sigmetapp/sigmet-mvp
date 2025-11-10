"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useSiteSettings } from "@/components/SiteSettingsContext";
import { useTheme } from "@/components/ThemeProvider";

export default function Footer() {
  const ADMIN_EMAILS = new Set<string>(['seosasha@gmail.com']);
  const { site_name, logo_url } = useSiteSettings();
  const { theme } = useTheme();
  const isLight = theme === "light";
  const year = new Date().getFullYear();
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const email = data.user?.email || null;
      setIsAdmin(!!email && ADMIN_EMAILS.has(email));
    });
  }, []);

  return (
    <footer className={`${isLight ? "border-t border-black/10 bg-white/70" : "border-t border-white/10 bg-black/30"}`}>
      <div className={`max-w-[1088px] mx-auto px-4 py-10 text-sm ${isLight ? "text-black/60" : "text-white/70"}`}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div>
            <a href="https://sigmet.app" target="_blank" rel="noreferrer" className="flex items-center gap-2 mb-3">
              {logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logo_url}
                  alt="Logo"
                  width={32}
                  height={32}
                  className="rounded-md"
                />
              ) : (
                <div className={`h-8 w-8 rounded-md grid place-items-center border ${
                  isLight 
                    ? "bg-primary-blue/10 border-primary-blue/20 text-primary-blue" 
                    : "bg-primary-blue/20 border-primary-blue/30 text-primary-blue-light"
                }`}>
                  S
                </div>
              )}
              <span className={`${isLight ? "text-black" : "text-white"} font-semibold tracking-tight`}>Sigmet.app</span>
            </a>
            <p className={`${isLight ? "text-black/50" : "text-white/50"} max-w-xs`}>
              Build your social weight with meaningful progress and transparent reputation.
            </p>
            {isAdmin && (
              <button
                onClick={() => setAdminOpen(true)}
                className={`mt-3 px-3 py-1.5 rounded-full text-xs border transition ${
                  isLight
                    ? 'text-primary-blue border-primary-blue/25 hover:bg-primary-blue/10'
                    : 'text-primary-blue-light border-primary-blue/30 hover:bg-primary-blue/15'
                }`}
              >
                Admin
              </button>
            )}
          </div>

          <div>
            <div className={`${isLight ? "text-black/80" : "text-white/80"} font-medium mb-3`}>Product</div>
            <ul className="space-y-2">
              <li><Link className={`${isLight ? "hover:text-black" : "hover:text-white"}`} href="/feed">Feed</Link></li>
              <li><Link className={`${isLight ? "hover:text-black" : "hover:text-white"}`} href="/profile">Profile</Link></li>
              <li><Link className={`${isLight ? "hover:text-black" : "hover:text-white"}`} href="/blog">Blog</Link></li>
            </ul>
          </div>

          <div>
            <div className={`${isLight ? "text-black/80" : "text-white/80"} font-medium mb-3`}>Company</div>
            <ul className="space-y-2">
              <li><a className={`${isLight ? "hover:text-black" : "hover:text-white"}`} href="https://sigmet.app" target="_blank" rel="noreferrer">Website</a></li>
              <li><a className={`${isLight ? "hover:text-black" : "hover:text-white"}`} href="mailto:hello@sigmet.app">Contact</a></li>
            </ul>
          </div>

          <div>
            <div className={`${isLight ? "text-black/80" : "text-white/80"} font-medium mb-3`}>Support</div>
            <ul className="space-y-2">
              <li><Link className={`${isLight ? "hover:text-black" : "hover:text-white"}`} href="/tickets">Report Issue</Link></li>
            </ul>
          </div>
        </div>

        <div className={`mt-8 pt-4 flex items-center justify-between gap-3 text-xs md:text-sm ${isLight ? "border-t border-black/10" : "border-t border-white/10"}`}>
          <span>© {year} {site_name || "SIGMET"}. All rights reserved.</span>
        </div>
      </div>

      {/* Admin sheet */}
      {isAdmin && adminOpen && (
        <div className="fixed inset-0 z-[9995]">
          <div
            className={`${isLight ? 'bg-black/40' : 'bg-black/60'} absolute inset-0`}
            onClick={() => setAdminOpen(false)}
          />
          <div className="absolute bottom-0 left-0 right-0 p-3">
            <div className={`mx-auto max-w-[1088px] rounded-2xl border shadow-xl p-3 ${
              isLight ? 'bg-white border-primary-blue/15' : 'bg-[rgba(15,22,35,0.98)] border-primary-blue/20'
            }`}>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <Link href="/settings" className={`px-4 py-3 rounded-xl text-sm text-center transition ${
                  isLight ? 'text-primary-text-secondary border border-primary-blue/20 hover:bg-primary-blue/10 hover:text-primary-blue'
                          : 'text-primary-text-secondary border border-primary-blue/30 hover:bg-primary-blue/15 hover:text-primary-blue-light'
                }`} onClick={() => setAdminOpen(false)}>Settings</Link>
                <Link href="/admin/users" className={`px-4 py-3 rounded-xl text-sm text-center transition ${
                  isLight ? 'text-primary-text-secondary border border-primary-blue/20 hover:bg-primary-blue/10 hover:text-primary-blue'
                          : 'text-primary-text-secondary border border-primary-blue/30 hover:bg-primary-blue/15 hover:text-primary-blue-light'
                }`} onClick={() => setAdminOpen(false)}>Users</Link>
                <Link href="/admin/stats" className={`px-4 py-3 rounded-xl text-sm text-center transition ${
                  isLight ? 'text-primary-text-secondary border border-primary-blue/20 hover:bg-primary-blue/10 hover:text-primary-blue'
                          : 'text-primary-text-secondary border border-primary-blue/30 hover:bg-primary-blue/15 hover:text-primary-blue-light'
                }`} onClick={() => setAdminOpen(false)}>Stats</Link>
                <Link href="/admin/tickets" className={`px-4 py-3 rounded-xl text-sm text-center transition ${
                  isLight ? 'text-primary-text-secondary border border-primary-blue/20 hover:bg-primary-blue/10 hover:text-primary-blue'
                          : 'text-primary-text-secondary border border-primary-blue/30 hover:bg-primary-blue/15 hover:text-primary-blue-light'
                }`} onClick={() => setAdminOpen(false)}>Tickets</Link>
                <Link href="/blog/admin/create" className={`px-4 py-3 rounded-xl text-sm text-center transition ${
                  isLight ? 'text-primary-text-secondary border border-primary-blue/20 hover:bg-primary-blue/10 hover:text-primary-blue'
                          : 'text-primary-text-secondary border border-primary-blue/30 hover:bg-primary-blue/15 hover:text-primary-blue-light'
                }`} onClick={() => setAdminOpen(false)}>New Post</Link>
                <Link href="/sw/weights" className={`px-4 py-3 rounded-xl text-sm text-center transition ${
                  isLight ? 'text-primary-text-secondary border border-primary-blue/20 hover:bg-primary-blue/10 hover:text-primary-blue'
                          : 'text-primary-text-secondary border border-primary-blue/30 hover:bg-primary-blue/15 hover:text-primary-blue-light'
                }`} onClick={() => setAdminOpen(false)}>SW Weights</Link>
                <Link href="/test" className={`px-4 py-3 rounded-xl text-sm text-center transition ${
                  isLight ? 'text-primary-text-secondary border border-primary-blue/20 hover:bg-primary-blue/10 hover:text-primary-blue'
                          : 'text-primary-text-secondary border border-primary-blue/30 hover:bg-primary-blue/15 hover:text-primary-blue-light'
                }`} onClick={() => setAdminOpen(false)}>Performance</Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </footer>
  );
}

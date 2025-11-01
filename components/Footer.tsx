"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSiteSettings } from "@/components/SiteSettingsContext";
import { useTheme } from "@/components/ThemeProvider";
import { supabase } from "@/lib/supabaseClient";

export default function Footer() {
  const { site_name, logo_url } = useSiteSettings();
  const { theme } = useTheme();
  const isLight = theme === "light";
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const year = new Date().getFullYear();

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const email = data?.user?.email || "";
      setIsAdmin(email === "seosasha@gmail.com");
    })();
  }, []);

  return (
    <footer className={`${isLight ? "border-t border-black/10 bg-white/70" : "border-t border-white/10 bg-black/30"}`}>
      <div className={`max-w-7xl mx-auto px-4 py-10 text-sm ${isLight ? "text-black/60" : "text-white/70"}`}>
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
                    ? "bg-telegram-blue/10 border-telegram-blue/20 text-telegram-blue" 
                    : "bg-telegram-blue/20 border-telegram-blue/30 text-telegram-blue-light"
                }`}>
                  S
                </div>
              )}
              <span className={`${isLight ? "text-black" : "text-white"} font-semibold tracking-tight`}>Sigmet.app</span>
            </a>
            <p className={`${isLight ? "text-black/50" : "text-white/50"} max-w-xs`}>
              Build your social weight with meaningful progress and transparent reputation.
            </p>
          </div>

          <div>
            <div className={`${isLight ? "text-black/80" : "text-white/80"} font-medium mb-3`}>Product</div>
            <ul className="space-y-2">
              <li><Link className={`${isLight ? "hover:text-black" : "hover:text-white"}`} href="/feed">Feed</Link></li>
              <li><Link className={`${isLight ? "hover:text-black" : "hover:text-white"}`} href="/profile">Profile</Link></li>
              {isAdmin && (
                <li><Link className={`${isLight ? "hover:text-black" : "hover:text-white"}`} href="/settings">Settings</Link></li>
              )}
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

        <div className={`mt-8 pt-4 flex items-center justify-between text-xs md:text-sm ${isLight ? "border-t border-black/10" : "border-t border-white/10"}`}>
          <span>© {year} {site_name || "SIGMET"}. All rights reserved.</span>
          <div className="flex items-center gap-3">
            {isAdmin && (
              <>
                <Link href="/settings" className={`${isLight ? "hover:text-black" : "hover:text-white"}`}>Settings</Link>
                <span className={isLight ? "text-black/30" : "text-white/30"}>•</span>
                <Link href="/admin/tickets" className={`${isLight ? "hover:text-black" : "hover:text-white"}`}>Ticket Management</Link>
              </>
            )}
            <a href="https://sigmet.app" target="_blank" rel="noreferrer" className={isLight ? "hover:text-black" : "hover:text-white"}>
              sigmet.app
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

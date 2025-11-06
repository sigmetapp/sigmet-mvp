"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import type { User } from '@supabase/supabase-js';
import Sidebar from './Sidebar';
import { useTheme } from '@/components/ThemeProvider';
import { useSiteSettings } from '@/components/SiteSettingsContext';

export default function SidebarShell({ user, children }: { user: User; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { theme } = useTheme();
  const { logo_url, site_name } = useSiteSettings();
  const isLight = theme === "light";

  return (
    <div className={`min-h-screen w-full transition-colors ${
      isLight ? "bg-telegram-gradient text-telegram-text" : "bg-sigmet text-telegram-text"
    }`}>
      {/* Mobile top bar */}
      <div className={`sticky top-0 z-30 flex items-center gap-3 border-b backdrop-blur-md px-3 py-2 lg:hidden transition-colors ${
        isLight
          ? "border-telegram-blue/15 bg-white/80"
          : "border-telegram-blue/20 bg-[rgba(15,22,35,0.8)]"
      }`}>
        <button
          aria-label="Open menu"
          className={`rounded-lg border px-3 py-1.5 text-sm transition relative z-10 ${
            isLight
              ? "border-telegram-blue/20 text-telegram-blue hover:bg-telegram-blue/10"
              : "border-telegram-blue/30 text-telegram-blue-light hover:bg-telegram-blue/15"
          }`}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
          }}
        >
          ☰
        </button>
        <Link href="/" className="flex items-center gap-2 flex-1 min-w-0">
          {logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logo_url}
              alt="Logo"
              width={24}
              height={24}
              className="rounded-md flex-shrink-0"
            />
          ) : (
            <div className={`h-6 w-6 rounded-md grid place-items-center border flex-shrink-0 ${
              isLight 
                ? "bg-telegram-blue/10 border-telegram-blue/20 text-telegram-blue" 
                : "bg-telegram-blue/20 border-telegram-blue/30 text-telegram-blue-light"
            }`}>
              <span className="text-xs font-semibold">S</span>
            </div>
          )}
          <span className={`${isLight ? "text-telegram-text" : "text-telegram-text"} font-semibold tracking-tight text-sm truncate`}>
            {site_name || "SIGMET"}
          </span>
          <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold tracking-wide flex-shrink-0 ${
            isLight
              ? "bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-[0_2px_6px_rgba(249,115,22,0.3)]"
              : "bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-[0_2px_6px_rgba(249,115,22,0.4)]"
          }`}>
            Pre-Alpha
          </span>
        </Link>
      </div>

      <div className="mx-auto flex max-w-7xl">
        {/* Desktop sidebar */}
        <div className="hidden h-[calc(100vh-0px)] shrink-0 lg:block lg:sticky lg:top-0">
          <Sidebar user={user} />
        </div>

        {/* Mobile drawer */}
        {open && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className={`absolute inset-0 ${isLight ? "bg-black/40" : "bg-black/60"}`} onClick={() => setOpen(false)} />
            <div className="absolute left-0 top-0 h-full w-64">
              <Sidebar user={user} />
            </div>
          </div>
        )}

        {/* Main content */}
        <main
          data-scroll-container="true"
          className={`min-h-screen flex-1 overflow-y-auto px-4 pt-4 pb-4 lg:px-8 lg:py-6 lg:pt-6 transition-colors relative z-0 ${
          isLight ? "text-telegram-text" : "text-telegram-text"
          }`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}

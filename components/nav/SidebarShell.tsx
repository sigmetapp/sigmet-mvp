"use client";

import React, { useState } from 'react';
import type { User } from '@supabase/supabase-js';
import Sidebar from './Sidebar';
import { useTheme } from '@/components/ThemeProvider';
import MobileBottomNav from './MobileBottomNav';

export default function SidebarShell({ user, children }: { user: User; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { theme } = useTheme();
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
        <div className={`text-sm pointer-events-none ${isLight ? "text-telegram-text-secondary" : "text-telegram-text-secondary"}`}>Menu</div>
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
          className={`min-h-screen flex-1 overflow-y-auto px-4 pt-4 pb-24 lg:pb-6 lg:px-8 lg:py-6 lg:pt-6 transition-colors relative z-0 ${
          isLight ? "text-telegram-text" : "text-telegram-text"
          }`}
        >
          {children}
        </main>

        {/* Mobile bottom navigation (non-admin quick actions) */}
        <MobileBottomNav user={user} />
      </div>
    </div>
  );
}

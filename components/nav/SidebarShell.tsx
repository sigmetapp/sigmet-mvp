"use client";

import React from 'react';
import type { User } from '@supabase/supabase-js';
import Sidebar from './Sidebar';
import { useTheme } from '@/components/ThemeProvider';
import MobileBottomNav from './MobileBottomNav';

export default function SidebarShell({ user, children }: { user: User; children: React.ReactNode }) {
  const { theme } = useTheme();
  const isLight = theme === "light";

  return (
    <div className={`min-h-screen w-full transition-colors ${
      isLight ? "bg-telegram-gradient text-telegram-text" : "bg-sigmet text-telegram-text"
    }`}>
      {/* Mobile top bar removed */}

      <div className="mx-auto flex max-w-[1088px]">
        {/* Desktop sidebar */}
        <div className="hidden h-[calc(100vh-0px)] shrink-0 lg:block lg:sticky lg:top-0">
          <Sidebar user={user} />
        </div>

        {/* Mobile drawer removed */}

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

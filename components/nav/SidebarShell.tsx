"use client";

import React, { useState } from 'react';
import type { User } from '@supabase/supabase-js';
import Sidebar from './Sidebar';

export default function SidebarShell({ user, children }: { user: User; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen w-full bg-[#0b1220] text-[#e5edf7]">
      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-white/10 bg-[#0b1220] px-3 py-2 lg:hidden">
        <button
          aria-label="Open menu"
          className="rounded-lg border border-white/10 px-3 py-1.5 text-sm hover:bg-white/10"
          onClick={() => setOpen(true)}
        >
          ☰
        </button>
        <div className="text-sm text-white/70">Menu</div>
      </div>

      <div className="mx-auto flex max-w-7xl">
        {/* Desktop sidebar */}
        <div className="hidden h-[calc(100vh-0px)] shrink-0 lg:block lg:sticky lg:top-0">
          <Sidebar user={user} />
        </div>

        {/* Mobile drawer */}
        {open && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
            <div className="absolute left-0 top-0 h-full w-64">
              <Sidebar user={user} />
            </div>
          </div>
        )}

        {/* Main content */}
        <main className="min-h-screen flex-1 overflow-y-auto px-4 py-4 lg:px-8 lg:py-6">
          {children}
        </main>
      </div>
    </div>
  );
}

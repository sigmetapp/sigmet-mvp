"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React, { useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { useTheme } from '@/components/ThemeProvider';

type BottomNavProps = { user: User };

// Admin controls moved to Footer; no admin UI here

const menu = [
  { label: 'SW', href: '/sw' },
  { label: 'Feed', href: '/feed' },
  { label: 'Profile', href: '/page' },
  { label: 'Dms', href: '/dms' },
];


export default function MobileBottomNav({ user }: BottomNavProps) {
  const pathname = usePathname() || '/';
  const { theme } = useTheme();
  const isLight = theme === 'light';
  // Admin UI handled by Footer

  return (
    <div>
      {/* Bottom fixed bar */}
      <nav
        className={`fixed bottom-0 left-0 right-0 z-40 border-t backdrop-blur-md px-2 py-2 safe-bottom ${
          isLight
            ? 'bg-white/90 border-telegram-blue/15'
            : 'bg-[rgba(15,22,35,0.9)] border-telegram-blue/20'
        }`}
      >
        <div className="mx-auto max-w-7xl flex items-center justify-center gap-2">
          <div className="flex items-center gap-2 lg:hidden">
          {menu.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-4 py-2 rounded-full text-sm transition ${
                  active
                    ? isLight
                      ? 'bg-telegram-blue text-white shadow-[0_2px_8px_rgba(51,144,236,0.25)]'
                      : 'bg-telegram-blue/25 text-telegram-blue-light'
                    : isLight
                    ? 'text-telegram-text-secondary border border-telegram-blue/20 hover:bg-telegram-blue/10 hover:text-telegram-blue'
                    : 'text-telegram-text-secondary border border-telegram-blue/30 hover:bg-telegram-blue/15 hover:text-telegram-blue-light'
                }`}
              >
                <span className="leading-none">{item.label}</span>
              </Link>
            );
          })}
          </div>

          {/* Admin button removed from fixed bar */}
        </div>
      </nav>

      {/* Admin sheet removed from bottom bar */}
    </div>
  );
}

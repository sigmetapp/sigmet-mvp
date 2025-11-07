"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React, { useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { useTheme } from '@/components/ThemeProvider';

type BottomNavProps = { user: User };

const ADMIN_EMAILS = new Set<string>(['seosasha@gmail.com']);

const menu = [
  { label: 'SW', href: '/sw', icon: '🏆' },
  { label: 'Feed', href: '/feed', icon: '📜' },
  { label: 'Profile', href: '/page', icon: '👤' },
  { label: 'Dms', href: '/dms', icon: '✉️' },
];

const adminMenu = [
  { label: 'Settings', href: '/settings', icon: '⚙️' },
  { label: 'Users', href: '/admin/users', icon: '👥' },
  { label: 'Stats', href: '/admin/stats', icon: '📊' },
  { label: 'Tickets', href: '/admin/tickets', icon: '🎫' },
  { label: 'SW Weights', href: '/sw/weights', icon: '⚖️' },
  { label: 'Performance', href: '/test', icon: '⚡' },
];

export default function MobileBottomNav({ user }: BottomNavProps) {
  const pathname = usePathname() || '/';
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const [adminOpen, setAdminOpen] = useState(false);
  const isAdmin = !!user.email && ADMIN_EMAILS.has(user.email);

  return (
    <div className="lg:hidden">
      {/* Bottom fixed bar */}
      <nav
        className={`fixed bottom-0 left-0 right-0 z-40 border-t backdrop-blur-md px-2 py-2 safe-bottom ${
          isLight
            ? 'bg-white/90 border-telegram-blue/15'
            : 'bg-[rgba(15,22,35,0.9)] border-telegram-blue/20'
        }`}
      >
        <div className="mx-auto max-w-7xl flex items-center justify-around gap-2">
          {menu.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center px-3 py-2 rounded-xl text-xs transition min-w-[64px] ${
                  active
                    ? isLight
                      ? 'bg-telegram-blue text-white shadow-[0_2px_8px_rgba(51,144,236,0.25)]'
                      : 'bg-telegram-blue/20 text-telegram-blue-light'
                    : isLight
                    ? 'text-telegram-text-secondary hover:bg-telegram-blue/10 hover:text-telegram-blue'
                    : 'text-telegram-text-secondary hover:bg-telegram-blue/15 hover:text-telegram-blue-light'
                }`}
              >
                <span className="text-base" aria-hidden>
                  {item.icon}
                </span>
                <span className="mt-0.5 leading-none">{item.label}</span>
              </Link>
            );
          })}

          {isAdmin && (
            <button
              aria-label="Admin menu"
              onClick={() => setAdminOpen((v) => !v)}
              className={`px-3 py-2 rounded-xl text-xs flex flex-col items-center justify-center min-w-[64px] transition ${
                isLight
                  ? 'text-telegram-text-secondary hover:bg-telegram-blue/10 hover:text-telegram-blue'
                  : 'text-telegram-text-secondary hover:bg-telegram-blue/15 hover:text-telegram-blue-light'
              }`}
            >
              <span className="text-base">☰</span>
              <span className="mt-0.5 leading-none">Admin</span>
            </button>
          )}
        </div>
      </nav>

      {/* Admin sheet */}
      {isAdmin && adminOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className={`${isLight ? 'bg-black/40' : 'bg-black/60'} absolute inset-0`}
            onClick={() => setAdminOpen(false)}
          />
          <div className="absolute bottom-0 left-0 right-0 p-3">
            <div
              className={`mx-auto max-w-7xl rounded-2xl border shadow-xl p-2 ${
                isLight ? 'bg-white border-telegram-blue/15' : 'bg-[rgba(15,22,35,0.98)] border-telegram-blue/20'
              }`}
            >
              <div className="grid grid-cols-3 gap-2">
                {adminMenu.map((it) => (
                  <Link
                    key={it.href}
                    href={it.href}
                    className={`flex flex-col items-center justify-center px-3 py-3 rounded-xl text-xs transition ${
                      pathname.startsWith(it.href)
                        ? isLight
                          ? 'bg-telegram-blue text-white'
                          : 'bg-telegram-blue/20 text-telegram-blue-light'
                        : isLight
                        ? 'text-telegram-text-secondary hover:bg-telegram-blue/10 hover:text-telegram-blue'
                        : 'text-telegram-text-secondary hover:bg-telegram-blue/15 hover:text-telegram-blue-light'
                    }`}
                    onClick={() => setAdminOpen(false)}
                  >
                    <span className="text-base">{it.icon}</span>
                    <span className="mt-0.5 leading-none text-center">{it.label}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

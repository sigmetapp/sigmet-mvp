"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React from 'react';
import { Trophy, Rss, User, Users, MessageSquare, Sprout, Settings as SettingsIcon } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { useTheme } from '@/components/ThemeProvider';
import { useUnreadDmCount } from '@/hooks/useUnreadDmCount';

type BottomNavProps = { user: User };

// Admin controls moved to Footer; no admin UI here

const menu: Array<{ label: string; href: string; icon: React.ReactNode; badgeKey?: 'unreadDM' }> = [
  { label: 'SW', href: '/sw', icon: <Trophy size={18} /> },
  { label: 'Feeds', href: '/feed', icon: <Rss size={18} /> },
  { label: 'Page', href: '/page', icon: <User size={18} /> },
  { label: 'Connections', href: '/connections', icon: <Users size={18} /> },
  { label: 'Messages', href: '/dms', icon: <MessageSquare size={18} />, badgeKey: 'unreadDM' },
  { label: 'Growth 8', href: '/growth-directions', icon: <Sprout size={18} /> },
  { label: 'Settings', href: '/profile', icon: <SettingsIcon size={18} /> },
];


export default function MobileBottomNav({ user }: BottomNavProps) {
  const pathname = usePathname() || '/';
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const { unreadCount: unreadDM } = useUnreadDmCount();
  // Admin UI handled by Footer

  return (
    <div className="lg:hidden">
      {/* Bottom fixed bar */}
      <nav
        className={`fixed bottom-0 left-0 right-0 z-40 border-t backdrop-blur-md px-2 py-2 safe-bottom ${
          isLight
            ? 'bg-white/90 border-primary-blue/15'
            : 'bg-[rgba(15,22,35,0.9)] border-primary-blue/20'
        }`}
      >
        <div className="mx-auto max-w-[1088px]">
          <div className="grid grid-cols-7 gap-2">
          {menu.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            const badgeCount = item.badgeKey === 'unreadDM' ? unreadDM : undefined;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative h-10 w-full grid place-items-center rounded-lg border transition ${
                  active
                    ? isLight
                      ? 'bg-primary-blue text-white shadow-[0_2px_8px_rgba(51,144,236,0.25)] border-primary-blue'
                      : 'bg-primary-blue/25 text-primary-blue-light border-primary-blue/40'
                    : isLight
                    ? 'text-primary-text-secondary border-primary-blue/20 hover:bg-primary-blue/10 hover:text-primary-blue'
                    : 'text-primary-text-secondary border-primary-blue/30 hover:bg-primary-blue/15 hover:text-primary-blue-light'
                }`}
              >
                <span aria-hidden>{item.icon}</span>
                <span className="sr-only">{item.label}</span>
                {typeof badgeCount === 'number' && badgeCount > 0 && (
                  <span className={`absolute -top-1 -right-1 inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                    isLight ? 'bg-primary-blue text-white' : 'bg-primary-blue-light text-white'
                  }`}>
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </span>
                )}
              </Link>
            );
          })}
          </div>
        </div>
      </nav>

      {/* Admin sheet removed from bottom bar */}
    </div>
  );
}

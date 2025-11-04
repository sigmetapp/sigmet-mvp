"use client";
import React from 'react';
import type { User } from '@supabase/supabase-js';
import NavItem from './NavItem';
import SignOutButton from './SignOutButton';
import { useTheme } from '@/components/ThemeProvider';

export type SidebarProps = {
  user: User;
};

const ADMIN_EMAILS = new Set<string>(['seosasha@gmail.com']);

const menu = [
  { label: 'Feeds', href: '/feed', icon: '📜' },
  { label: 'Page', href: '/page', icon: '👤' },
  { label: 'Connections/Follow', href: '/connections', icon: '🔗' },
  { label: 'Messages', href: '/dms', icon: '✉️', badgeKey: 'unreadDM' as const },
  { label: 'SW', href: '/sw', icon: '⚖️' },
  { label: 'Growth 8', href: '/growth-directions', icon: '🌱' },
  { label: 'Invite systems', href: '/invite', icon: '🎟️' },
  { label: 'Settings', href: '/profile', icon: '⚙️' },
];

const adminMenu = [
  { label: 'Settings', href: '/settings', icon: '⚙️' },
  { label: 'Users', href: '/admin/users', icon: '👥' },
  { label: 'Stats', href: '/admin/stats', icon: '📊' },
  { label: 'Tickets', href: '/admin/tickets', icon: '🎫' },
  { label: 'SW Weights', href: '/sw/weights', icon: '⚖️' },
];

export default function Sidebar({ user }: SidebarProps) {
  const { theme } = useTheme();
  const isLight = theme === "light";
  // Mock badge for now
  const unreadDM = 0;

  const username = (user.user_metadata as any)?.username || user.email || user.id;
  const userEmail = user.email || null;
  const isAdmin = userEmail && ADMIN_EMAILS.has(userEmail);

  return (
    <aside className={`flex h-full w-64 flex-col border-r backdrop-blur-md transition-colors ${
      isLight
        ? "border-telegram-blue/15 bg-white/90 text-telegram-text"
        : "border-telegram-blue/20 bg-[rgba(15,22,35,0.9)] text-telegram-text"
    }`}>
      <div className="px-3 py-3">
        <div className={`text-sm font-semibold tracking-wide ${isLight ? "text-telegram-text-secondary" : "text-telegram-text-secondary"}`}>Menu</div>
      </div>
      <nav className="px-2">
        <ul className="space-y-1">
          {menu.map((item) => (
            <NavItem
              key={item.href}
              label={item.label}
              href={item.href}
              icon={item.icon}
              badgeCount={item.badgeKey === 'unreadDM' ? unreadDM : undefined}
            />
          ))}
        </ul>
      </nav>
      {isAdmin && (
        <>
          <div className={`px-2 py-2 border-t ${isLight ? "border-telegram-blue/15" : "border-telegram-blue/20"}`}>
            <div className={`text-xs font-semibold tracking-wide px-2 py-1 ${isLight ? "text-telegram-text-secondary" : "text-telegram-text-secondary"}`}>
              Admin
            </div>
            <ul className="space-y-1 mt-1 ml-4 pl-2 border-l-2 border-telegram-blue/20">
              {adminMenu.map((item) => (
                <NavItem
                  key={item.href}
                  label={item.label}
                  href={item.href}
                  icon={item.icon}
                />
              ))}
            </ul>
          </div>
          <div className={`px-2 py-2 border-t ${isLight ? "border-telegram-blue/15" : "border-telegram-blue/20"}`}>
            <div className={`text-xs font-semibold tracking-wide px-2 py-1 ${isLight ? "text-telegram-text-secondary" : "text-telegram-text-secondary"}`}>
              Soon...
            </div>
            <ul className="space-y-1 mt-1">
              <NavItem
                label="Badges/Rewards"
                href="/badges"
                icon="🏅"
              />
            </ul>
          </div>
        </>
      )}
      <div className={`mt-auto px-3 py-3 border-t ${isLight ? "border-telegram-blue/15" : "border-telegram-blue/20"}`}>
        <div className="flex items-center gap-3">
          <div className={`h-8 w-8 rounded-full flex items-center justify-center border ${
            isLight
              ? "bg-telegram-blue/10 border-telegram-blue/20 text-telegram-blue"
              : "bg-telegram-blue/20 border-telegram-blue/30 text-telegram-blue-light"
          }`}>
            <span aria-hidden>👤</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className={`truncate text-sm ${isLight ? "text-telegram-text" : "text-telegram-text"}`}>{username}</div>
          </div>
        </div>
        <div className="mt-2">
          <SignOutButton />
        </div>
      </div>
    </aside>
  );
}

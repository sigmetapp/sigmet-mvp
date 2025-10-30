import React from 'react';
import type { User } from '@supabase/supabase-js';
import NavItem from './NavItem';
import SignOutButton from './SignOutButton';

export type SidebarProps = {
  user: User;
};

const menu = [
  { label: 'Feeds', href: '/feed', icon: '📜' },
  { label: 'Page', href: '/page', icon: '👤' },
  { label: 'Connections/Follow', href: '/connections', icon: '🔗' },
  { label: 'Messages', href: '/dm', icon: '✉️', badgeKey: 'unreadDM' as const },
  { label: 'SW', href: '/sw', icon: '⚖️' },
  { label: '12 Growth Directions', href: '/growth-directions', icon: '🌱' },
  { label: 'Invite systems', href: '/invite', icon: '🎟️' },
  { label: 'Settings', href: '/profile', icon: '⚙️' },
];

export default function Sidebar({ user }: SidebarProps) {
  // Mock badge for now
  const unreadDM = 0;

  const username = (user.user_metadata as any)?.username || user.email || user.id;

  return (
    <aside className="flex h-full w-64 flex-col border-r border-white/10 bg-[#0b1220] text-[#e5edf7]">
      <div className="px-3 py-3">
        <div className="text-sm font-semibold tracking-wide text-white/70">SIGMET</div>
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
      <div className="mt-auto px-3 py-3 border-t border-white/10">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center border border-white/10">
            <span aria-hidden>👤</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm text-white/90">{username}</div>
          </div>
        </div>
        <div className="mt-2">
          <SignOutButton />
        </div>
      </div>
    </aside>
  );
}

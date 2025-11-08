"use client";
import React from 'react';
import type { User } from '@supabase/supabase-js';
import { Trophy, Rss, User, Users, MessageSquare, Sprout, Settings as SettingsIcon } from 'lucide-react';
import NavItem from './NavItem';
import { useTheme } from '@/components/ThemeProvider';
import { useUnreadDmCount } from '@/hooks/useUnreadDmCount';

export type SidebarProps = {
  user: User;
};

const ADMIN_EMAILS = new Set<string>(['seosasha@gmail.com']);

const menu = [
  { label: 'SW', href: '/sw', icon: <Trophy size={18} />, bordered: true },
  { label: 'Feeds', href: '/feed', icon: <Rss size={18} /> },
  { label: 'Page', href: '/page', icon: <User size={18} /> },
  { label: 'Connections', href: '/connections', icon: <Users size={18} /> },
  { label: 'Messages', href: '/dms', icon: <MessageSquare size={18} />, badgeKey: 'unreadDM' as const },
  { label: 'Growth 8', href: '/growth-directions', icon: <Sprout size={18} /> },
  { label: 'Settings', href: '/profile', icon: <SettingsIcon size={18} /> },
];

const adminMenu = [
  { label: 'Settings', href: '/settings', icon: '⚙️' },
  { label: 'Users', href: '/admin/users', icon: '👥' },
  { label: 'Stats', href: '/admin/stats', icon: '📊' },
  { label: 'Tickets', href: '/admin/tickets', icon: '🎫' },
  { label: 'SW Weights', href: '/sw/weights', icon: '⚖️' },
  { label: 'Performance', href: '/test', icon: '⚡' },
];

export default function Sidebar({ user }: SidebarProps) {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const { unreadCount: unreadDM } = useUnreadDmCount();

  const userEmail = user.email || null;
  const isAdmin = userEmail && ADMIN_EMAILS.has(userEmail);

  return (
    <aside className={`flex h-full w-[218px] flex-col border-r backdrop-blur-md transition-colors ${
      isLight
        ? "border-primary-blue/15 bg-white/90 text-primary-text"
        : "border-primary-blue/20 bg-[rgba(15,22,35,0.9)] text-primary-text"
    }`}>
      <div className="px-3 py-3">
        <div className={`text-xs font-semibold tracking-wide px-2 py-1 ${isLight ? "text-primary-text-secondary" : "text-primary-text-secondary"}`}>Menu</div>
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
              bordered={item.bordered}
            />
          ))}
        </ul>
      </nav>
      {/* Admin menu moved to footer hamburger on all breakpoints */}
    </aside>
  );
}

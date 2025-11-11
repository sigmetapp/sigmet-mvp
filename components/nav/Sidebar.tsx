"use client";
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { User } from '@supabase/supabase-js';
import Link from 'next/link';
import { Trophy, Rss, User, Users, MessageSquare, Sprout, Settings as SettingsIcon } from 'lucide-react';
import NavItem from './NavItem';
import { useTheme } from '@/components/ThemeProvider';

export type SidebarProps = {
  user: User;
};

const ADMIN_EMAILS = new Set<string>(['seosasha@gmail.com']);

const menu = [
  { label: 'SW', href: '/sw', icon: <Trophy size={18} />, bordered: true },
  { label: 'Feeds', href: '/feed', icon: <Rss size={18} /> },
  { label: 'Page', href: '/page', icon: <User size={18} /> },
  { label: 'Connections', href: '/connections', icon: <Users size={18} /> },
  { label: 'Messages', href: '/dms', icon: <MessageSquare size={18} /> },
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
  const [adminOpen, setAdminOpen] = useState(false);
  const [canRenderPortal, setCanRenderPortal] = useState(false);

  const userEmail = user.email || null;
  const isAdmin = userEmail && ADMIN_EMAILS.has(userEmail);

  useEffect(() => {
    setCanRenderPortal(true);
  }, []);

  return (
    <>
      <aside className={`flex h-full w-[218px] flex-col border-r backdrop-blur-md transition-colors ${
        isLight
          ? "border-primary-blue/15 bg-white/90 text-primary-text"
          : "border-primary-blue/20 bg-[rgba(15,22,35,0.9)] text-primary-text"
      }`}>
        <div className="px-3 py-3">
          <div className="flex items-center justify-between">
            <div className={`text-xs font-semibold tracking-wide px-2 py-1 ${isLight ? "text-primary-text-secondary" : "text-primary-text-secondary"}`}>Menu</div>
          </div>
        </div>
        <nav className="px-2">
          <ul className="space-y-1">
            {menu.map((item) => (
              <NavItem
                key={item.href}
                label={item.label}
                href={item.href}
                icon={item.icon}
                bordered={item.bordered}
              />
            ))}
          </ul>
        </nav>
        {isAdmin && (
          <div className="px-2 mt-2">
            <button
              onClick={() => setAdminOpen(true)}
              className={`w-full flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${
                isLight
                  ? 'text-primary-text-secondary hover:bg-primary-blue/10 hover:text-primary-blue border border-primary-blue/25'
                  : 'text-primary-text-secondary hover:bg-primary-blue/15 hover:text-primary-blue-light border border-primary-blue/30'
              }`}
            >
              <span className="shrink-0 text-base leading-none">⚙️</span>
              <span className="truncate">Admin</span>
            </button>
          </div>
        )}
      </aside>

      {/* Admin sheet - rendered via portal to escape stacking context */}
      {isAdmin && adminOpen && canRenderPortal && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[99999]">
          <div
            className={`${isLight ? 'bg-black/40' : 'bg-black/60'} absolute inset-0`}
            onClick={() => setAdminOpen(false)}
          />
          <div className="absolute bottom-0 left-0 right-0 p-3 z-[99999]">
            <div className={`mx-auto max-w-[1088px] rounded-2xl border shadow-xl p-3 relative z-[99999] ${
              isLight ? 'bg-white border-primary-blue/15' : 'bg-[rgba(15,22,35,0.98)] border-primary-blue/20'
            }`}>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <Link href="/settings" className={`px-4 py-3 rounded-xl text-sm text-center transition ${
                  isLight ? 'text-primary-text-secondary border border-primary-blue/20 hover:bg-primary-blue/10 hover:text-primary-blue'
                          : 'text-primary-text-secondary border border-primary-blue/30 hover:bg-primary-blue/15 hover:text-primary-blue-light'
                }`} onClick={() => setAdminOpen(false)}>Settings</Link>
                <Link href="/admin/users" className={`px-4 py-3 rounded-xl text-sm text-center transition ${
                  isLight ? 'text-primary-text-secondary border border-primary-blue/20 hover:bg-primary-blue/10 hover:text-primary-blue'
                          : 'text-primary-text-secondary border border-primary-blue/30 hover:bg-primary-blue/15 hover:text-primary-blue-light'
                }`} onClick={() => setAdminOpen(false)}>Users</Link>
                <Link href="/admin/stats" className={`px-4 py-3 rounded-xl text-sm text-center transition ${
                  isLight ? 'text-primary-text-secondary border border-primary-blue/20 hover:bg-primary-blue/10 hover:text-primary-blue'
                          : 'text-primary-text-secondary border border-primary-blue/30 hover:bg-primary-blue/15 hover:text-primary-blue-light'
                }`} onClick={() => setAdminOpen(false)}>Stats</Link>
                <Link href="/admin/tickets" className={`px-4 py-3 rounded-xl text-sm text-center transition ${
                  isLight ? 'text-primary-text-secondary border border-primary-blue/20 hover:bg-primary-blue/10 hover:text-primary-blue'
                          : 'text-primary-text-secondary border border-primary-blue/30 hover:bg-primary-blue/15 hover:text-primary-blue-light'
                }`} onClick={() => setAdminOpen(false)}>Tickets</Link>
                <Link href="/blog/admin/create" className={`px-4 py-3 rounded-xl text-sm text-center transition ${
                  isLight ? 'text-primary-text-secondary border border-primary-blue/20 hover:bg-primary-blue/10 hover:text-primary-blue'
                          : 'text-primary-text-secondary border border-primary-blue/30 hover:bg-primary-blue/15 hover:text-primary-blue-light'
                }`} onClick={() => setAdminOpen(false)}>New Post</Link>
                <Link href="/sw/weights" className={`px-4 py-3 rounded-xl text-sm text-center transition ${
                  isLight ? 'text-primary-text-secondary border border-primary-blue/20 hover:bg-primary-blue/10 hover:text-primary-blue'
                          : 'text-primary-text-secondary border border-primary-blue/30 hover:bg-primary-blue/15 hover:text-primary-blue-light'
                }`} onClick={() => setAdminOpen(false)}>SW Weights</Link>
                <Link href="/test" className={`px-4 py-3 rounded-xl text-sm text-center transition ${
                  isLight ? 'text-primary-text-secondary border border-primary-blue/20 hover:bg-primary-blue/10 hover:text-primary-blue'
                          : 'text-primary-text-secondary border border-primary-blue/30 hover:bg-primary-blue/15 hover:text-primary-blue-light'
                }`} onClick={() => setAdminOpen(false)}>Performance</Link>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

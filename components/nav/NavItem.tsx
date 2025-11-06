"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React from 'react';
import { useTheme } from '@/components/ThemeProvider';

export type NavItemProps = {
  label: string;
  href: string;
  icon?: React.ReactNode;
  badgeCount?: number;
  highlighted?: boolean;
};

export default function NavItem({ label, href, icon, badgeCount, highlighted }: NavItemProps) {
  const pathname = usePathname() || '/';
  const isActive = pathname === href || pathname.startsWith(href + '/');
  const { theme } = useTheme();
  const isLight = theme === "light";

  return (
    <li>
      <Link
        href={href}
        aria-current={isActive ? 'page' : undefined}
        className={`group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors outline-none
          ${isActive
            ? isLight
              ? "bg-telegram-blue text-white shadow-[0_2px_8px_rgba(51,144,236,0.25)]"
              : "bg-telegram-blue/20 text-telegram-blue-light"
            : highlighted
            ? isLight
              ? "bg-yellow-500/10 text-yellow-600 font-semibold hover:bg-yellow-500/20 hover:text-yellow-700"
              : "bg-yellow-500/15 text-yellow-400 font-semibold hover:bg-yellow-500/25 hover:text-yellow-300"
            : isLight
            ? "text-telegram-text-secondary hover:bg-telegram-blue/10 hover:text-telegram-blue"
            : "text-telegram-text-secondary hover:bg-telegram-blue/15 hover:text-telegram-blue-light"
          }`}
      >
        {/* left accent for active item */}
        {isActive && (
          <span className={`pointer-events-none absolute left-0 top-1.5 bottom-1.5 w-1 ${
            isLight ? "bg-telegram-blue" : "bg-telegram-blue-light"
          }`} />
        )}
        <span className="shrink-0 text-base leading-none" aria-hidden>
          {icon}
        </span>
        <span className={`truncate ${isActive ? isLight ? "text-white" : "text-telegram-blue-light" : ""}`}>{label}</span>
        {typeof badgeCount === 'number' && badgeCount > 0 && (
          <span className={`ml-auto inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
            isLight ? "bg-telegram-blue text-white" : "bg-telegram-blue-light text-white"
          }`}>
            {badgeCount}
          </span>
        )}
      </Link>
    </li>
  );
}

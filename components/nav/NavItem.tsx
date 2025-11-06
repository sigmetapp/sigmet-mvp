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
  bordered?: boolean;
};

export default function NavItem({ label, href, icon, badgeCount, bordered }: NavItemProps) {
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
          ${bordered ? 'border-2' : ''}
          ${isActive
            ? isLight
              ? "bg-telegram-blue text-white shadow-[0_2px_8px_rgba(51,144,236,0.25)]"
              : "bg-telegram-blue/20 text-telegram-blue-light"
            : isLight
            ? "text-telegram-text-secondary hover:bg-telegram-blue/10 hover:text-telegram-blue"
            : "text-telegram-text-secondary hover:bg-telegram-blue/15 hover:text-telegram-blue-light"
          }`}
        style={bordered ? { borderColor: 'rgb(0, 255, 200)' } : undefined}
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

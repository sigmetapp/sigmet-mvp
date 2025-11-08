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
          ${isActive
            ? isLight
              ? "bg-primary-blue text-white shadow-[0_2px_8px_rgba(51,144,236,0.25)]"
              : "bg-primary-blue/20 text-primary-blue-light"
            : isLight
            ? "text-primary-text-secondary hover:bg-primary-blue/10 hover:text-primary-blue"
            : "text-primary-text-secondary hover:bg-primary-blue/15 hover:text-primary-blue-light"
          }
          ${bordered && isActive ? (isLight ? "border-b-2 border-primary-blue" : "border-b-2 border-primary-blue-light") : ""}
        `}
      >
        {/* left accent for active item */}
        {isActive && !bordered && (
          <span className={`pointer-events-none absolute left-0 top-1.5 bottom-1.5 w-1 ${
            isLight ? "bg-primary-blue" : "bg-primary-blue-light"
          }`} />
        )}
        <span className="shrink-0 text-base leading-none" aria-hidden>
          {icon}
        </span>
        <span className={`truncate ${isActive ? isLight ? "text-white" : "text-primary-blue-light" : ""}`}>{label}</span>
        {typeof badgeCount === 'number' && badgeCount > 0 && (
          <span className={`ml-auto inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
            isLight ? "bg-primary-blue text-white" : "bg-primary-blue-light text-white"
          }`}>
            {badgeCount}
          </span>
        )}
      </Link>
    </li>
  );
}

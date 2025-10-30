"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React from 'react';

export type NavItemProps = {
  label: string;
  href: string;
  icon?: React.ReactNode;
  badgeCount?: number;
};

export default function NavItem({ label, href, icon, badgeCount }: NavItemProps) {
  const pathname = usePathname() || '/';
  const isActive = pathname === href || pathname.startsWith(href + '/');

  return (
    <li>
      <Link
        href={href}
        aria-current={isActive ? 'page' : undefined}
        className={`group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors
          hover:bg-white/10 focus:bg-white/10 outline-none
          ${isActive ? 'bg-white/10' : ''}`}
      >
        {/* left accent for active item */}
        {isActive && (
          <span className="pointer-events-none absolute left-0 top-1.5 bottom-1.5 w-1 bg-emerald-400" />
        )}
        <span className="shrink-0 text-base leading-none" aria-hidden>
          {icon}
        </span>
        <span className="truncate text-[#e5edf7]">{label}</span>
        {typeof badgeCount === 'number' && badgeCount > 0 && (
          <span className="ml-auto inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-semibold text-black">
            {badgeCount}
          </span>
        )}
      </Link>
    </li>
  );
}

"use client";

import React from 'react';

export type BadgeData = {
  id: string;
  name: string;
  emoji: string;
  description: string;
  requirement_description: string;
  earned: boolean;
  displayed: boolean;
};

type BadgeProps = {
  badge: BadgeData;
  onClick?: () => void;
  size?: 'sm' | 'md' | 'lg';
  interactive?: boolean;
};

export default function Badge({ badge, onClick, size = 'md', interactive = false }: BadgeProps) {
  const sizeClasses = {
    sm: 'w-16 h-16 text-2xl',
    md: 'w-20 h-20 text-3xl',
    lg: 'w-24 h-24 text-4xl',
  };

  const containerSizeClasses = {
    sm: 'p-2',
    md: 'p-3',
    lg: 'p-4',
  };

  const badgeClasses = `
    ${sizeClasses[size]}
    ${containerSizeClasses[size]}
    rounded-2xl border-2 flex items-center justify-center
    transition-all duration-200
    ${badge.earned 
      ? 'bg-gradient-to-br from-white/20 to-white/10 border-white/30 shadow-lg' 
      : 'bg-white/5 border-white/10 opacity-50 grayscale'
    }
    ${interactive && badge.earned ? 'cursor-pointer hover:scale-110 hover:border-white/50 hover:shadow-xl' : ''}
    ${onClick && badge.earned ? 'cursor-pointer' : ''}
  `;

  return (
    <div
      className={badgeClasses}
      onClick={onClick && badge.earned ? onClick : undefined}
      role={onClick && badge.earned ? 'button' : undefined}
      tabIndex={onClick && badge.earned ? 0 : undefined}
      title={badge.earned ? `${badge.name}: ${badge.description}` : `Locked: ${badge.requirement_description}`}
    >
      <span className="leading-none">{badge.emoji}</span>
    </div>
  );
}

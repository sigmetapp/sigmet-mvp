"use client";

import React from 'react';
import * as Icons from 'lucide-react';
import { motion } from 'framer-motion';

export interface BadgeCardData {
  key: string;
  title: string;
  description: string;
  how_to_get: string;
  icon: string;
  color_start: string;
  color_end: string;
  shape: 'circle' | 'hex' | 'shield' | 'ribbon' | 'badge' | 'medal';
  earned: boolean;
  progress: number; // 0-1
  currentValue: number;
  threshold: number;
  awardedAt?: string;
  is_active?: boolean;
}

interface BadgeCardProps {
  badge: BadgeCardData;
  onClick?: () => void;
  size?: 'sm' | 'md' | 'lg';
  showProgress?: boolean;
  variant?: 'default' | 'compact';
}

export default function BadgeCard({
  badge,
  onClick,
  size = 'md',
  showProgress = true,
  variant = 'default',
}: BadgeCardProps) {
  // Get icon component dynamically
  const IconComponent =
    (Icons as any)[badge.icon] || Icons.Award;

  const resolvedSize = variant === 'compact' ? 'sm' : size;

  const sizeClasses = {
    sm: 'w-20 h-20 text-2xl',
    md: 'w-24 h-24 text-3xl',
    lg: 'w-32 h-32 text-4xl',
  };

  const containerSizeClasses = {
    sm: 'p-2',
    md: 'p-3',
    lg: 'p-4',
  };

  const iconPixelSize = resolvedSize === 'sm' ? 24 : resolvedSize === 'md' ? 32 : 40;
  const wrapperSpacing = variant === 'compact' ? 'gap-2' : 'gap-3';
  const wrapperWidth = variant === 'compact' ? 'w-[140px] shrink-0' : '';
  const titleClass = variant === 'compact'
    ? 'text-white font-semibold text-xs leading-tight'
    : 'text-white font-medium text-sm';
  const subtitleClass = variant === 'compact'
    ? 'text-white/60 text-[11px]'
    : 'text-white/60 text-xs';
  const progressTextClass = variant === 'compact'
    ? 'text-white/50 text-[10px]'
    : 'text-white/50 text-xs';
  const progressBarHeight = variant === 'compact' ? 'h-1' : 'h-1.5';

  // Shape-specific classes
  const shapeClasses = {
    circle: 'rounded-full',
    hex: 'hex-shape',
    shield: 'shield-shape',
    ribbon: 'ribbon-shape',
    badge: 'rounded-lg',
    medal: 'medal-shape',
  };

  // Gradient classes - map color strings to Tailwind classes
  const colorMap: Record<string, string> = {
    'indigo-500': 'from-indigo-500',
    'purple-500': 'to-purple-500',
    'sky-500': 'from-sky-500',
    'emerald-500': 'to-emerald-500',
    'violet-500': 'from-violet-500',
    'fuchsia-500': 'to-fuchsia-500',
    'cyan-500': 'from-cyan-500',
    'blue-500': 'to-blue-500',
    'red-500': 'from-red-500',
    'rose-500': 'to-rose-500',
    'amber-500': 'from-amber-500',
    'orange-500': 'to-orange-500',
    'slate-500': 'from-slate-500',
    'zinc-500': 'to-zinc-500',
    'yellow-500': 'from-yellow-500',
    'lime-500': 'to-lime-500',
    'green-500': 'to-green-500',
    'teal-500': 'from-teal-500',
    'pink-500': 'to-pink-500',
    'stone-500': 'from-stone-500',
    'neutral-500': 'to-neutral-500',
  };

  const gradientFrom = colorMap[badge.color_start] || `from-${badge.color_start}`;
  const gradientTo = colorMap[badge.color_end] || `to-${badge.color_end}`;
  const gradientClasses = `bg-gradient-to-br ${gradientFrom} ${gradientTo}`;

  const badgeClasses = `
    ${sizeClasses[resolvedSize]}
    ${containerSizeClasses[resolvedSize]}
    ${shapeClasses[badge.shape]}
    flex items-center justify-center
    transition-all duration-300
    ${
      badge.earned
        ? 'border-2 border-white/40 shadow-lg shadow-white/10'
        : 'border-2 border-white/10 opacity-60 grayscale'
    }
    ${onClick && badge.earned ? 'cursor-pointer hover:scale-110' : ''}
    ${badge.earned ? 'hover:shadow-xl hover:shadow-white/20' : ''}
  `;

  const progressPercent = Math.round(badge.progress * 100);
  const statusLabel = badge.earned
    ? 'Earned'
    : badge.progress > 0
    ? `${progressPercent}%`
    : 'Locked';

  return (
    <div className={`flex flex-col items-center ${wrapperSpacing} ${wrapperWidth}`}>
      <motion.div
        initial={badge.earned ? { scale: 0 } : false}
        animate={badge.earned ? { scale: 1 } : {}}
        transition={badge.earned ? { type: 'spring', duration: 0.6 } : {}}
        className={badgeClasses}
        onClick={onClick && badge.earned ? onClick : undefined}
        style={{
          background: badge.earned
            ? undefined
            : 'linear-gradient(to bottom right, rgba(255,255,255,0.1), rgba(255,255,255,0.05))',
        }}
      >
        {badge.earned ? (
          <div
            className={`w-full h-full ${gradientClasses} ${shapeClasses[badge.shape]} flex items-center justify-center`}
          >
            <IconComponent className="text-white" size={iconPixelSize} />
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <IconComponent className="text-white/40" size={iconPixelSize} />
          </div>
        )}
      </motion.div>

      <div className="text-center space-y-1 w-full">
        <div className={titleClass}>{badge.title}</div>
        <div className={subtitleClass}>{statusLabel}</div>
        {showProgress && !badge.earned && badge.progress > 0 && (
          <div className={`mt-2 space-y-1 ${variant === 'compact' ? 'px-1' : ''}`}>
            <div className={`w-full bg-white/10 rounded-full ${progressBarHeight} overflow-hidden`}>
              <div
                className={`h-full bg-gradient-to-r ${gradientFrom} ${gradientTo}`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className={progressTextClass}>
              {badge.currentValue} / {badge.threshold} ({progressPercent}%)
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

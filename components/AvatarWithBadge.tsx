'use client';

import React from 'react';
import { getSWLevel, getLevelColorScheme, shouldShowBadge, type SWLevel } from '@/lib/swLevels';

type AvatarWithBadgeProps = {
  avatarUrl: string;
  swScore?: number;
  swLevels?: SWLevel[];
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  alt?: string;
  onClick?: () => void;
  href?: string;
};

const sizeClasses = {
  sm: 'h-10 w-10',
  md: 'h-12 w-12',
  lg: 'h-16 w-16',
};

export default function AvatarWithBadge({
  avatarUrl,
  swScore = 0,
  swLevels,
  size = 'md',
  className = '',
  alt = 'avatar',
  onClick,
  href,
}: AvatarWithBadgeProps) {
  const showBadge = shouldShowBadge(swScore, swLevels);
  const level = getSWLevel(swScore, swLevels);
  const colorScheme = getLevelColorScheme(level.name);

  const avatarElement = (
    <div className={`relative inline-block ${sizeClasses[size]} ${className}`}>
      <img
        src={avatarUrl}
        alt={alt}
        className={`${sizeClasses[size]} rounded-full object-cover shrink-0 ${
          showBadge && colorScheme
            ? 'border-2'
            : 'border border-white/10'
        }`}
        style={
          showBadge && colorScheme
            ? {
                borderColor: colorScheme.hex,
              }
            : undefined
        }
        title={showBadge && colorScheme ? level.name : undefined}
      />
    </div>
  );

  if (href) {
    return (
      <a href={href} onClick={onClick} className="flex-shrink-0" data-prevent-card-navigation="true">
        {avatarElement}
      </a>
    );
  }

  if (onClick) {
    return (
      <div onClick={onClick} className="flex-shrink-0 cursor-pointer" data-prevent-card-navigation="true">
        {avatarElement}
      </div>
    );
  }

  return <div className="flex-shrink-0">{avatarElement}</div>;
}

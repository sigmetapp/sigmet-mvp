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

const badgeSizeClasses = {
  sm: 'h-3 w-3',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
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
        className={`${sizeClasses[size]} rounded-full object-cover border border-white/10 shrink-0`}
      />
      {showBadge && colorScheme && (
        <div
          className={`absolute -bottom-0.5 -right-0.5 ${badgeSizeClasses[size]} rounded-full border-2 border-white/90 dark:border-black/90`}
          style={{
            backgroundColor: colorScheme.hex,
          }}
          title={level.name}
        />
      )}
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

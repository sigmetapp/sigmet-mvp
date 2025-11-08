'use client';

import React from 'react';
import { getSWLevel, getLevelColorScheme, shouldShowBadge, type SWLevel } from '@/lib/swLevels';
import { resolveAvatarUrl } from '@/lib/utils';

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
  sm: 'h-[50px] w-[50px]', // 40px (h-10) * 1.25 = 50px
  md: 'h-[60px] w-[60px]', // 48px (h-12) * 1.25 = 60px
  lg: 'h-[80px] w-[80px]', // 64px (h-16) * 1.25 = 80px
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
  priority = false,
}: AvatarWithBadgeProps & { priority?: boolean }) {
  const showBadge = shouldShowBadge(swScore, swLevels);
  const level = getSWLevel(swScore, swLevels);
  const colorScheme = getLevelColorScheme(level.name);
  const normalizedAvatarUrl = resolveAvatarUrl(avatarUrl) ?? avatarUrl;
  const AVATAR_FALLBACK = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='100%' height='100%' fill='%23222'/><circle cx='32' cy='24' r='14' fill='%23555'/><rect x='12' y='44' width='40' height='12' rx='6' fill='%23555'/></svg>";

  const avatarElement = (
    <div className={`relative inline-block ${sizeClasses[size]} ${className}`}>
      {/* Actual image */}
      <img
        key={normalizedAvatarUrl}
        src={normalizedAvatarUrl || AVATAR_FALLBACK}
        alt={alt}
        width={size === 'sm' ? 50 : size === 'md' ? 60 : 80}
        height={size === 'sm' ? 50 : size === 'md' ? 60 : 80}
        className={`${sizeClasses[size]} rounded-full shrink-0 object-cover ${
          showBadge && colorScheme
            ? 'border-2'
            : 'border border-white/10'
        }`}
        style={
          showBadge && colorScheme
            ? {
                borderColor: colorScheme.hex,
                boxShadow: `0 0 8px ${colorScheme.hex}40, 0 0 12px ${colorScheme.hex}30`,
              }
            : undefined
        }
        title={showBadge && colorScheme ? level.name : undefined}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        fetchPriority={priority ? 'high' : 'auto'}
        onError={(e) => {
          const target = e.target as HTMLImageElement;
          if (target.src !== AVATAR_FALLBACK) {
            target.src = AVATAR_FALLBACK;
          }
        }}
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

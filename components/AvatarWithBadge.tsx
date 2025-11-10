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

// Progressive glow parameters by level
function getProgressiveGlowParameters(levelName: string, colorScheme: { hex: string }) {
  const levelParams = {
    'Growing': {
      borderWidth: 1.5,
      outerGlow: { r1: 8, r2: 12, r3: 16, o1: '30', o2: '20', o3: '15' },
      imageGlow: { r1: 6, r2: 10, r3: 14, r4: 4, o1: '40', o2: '30', o3: '20', o4: '10' },
      gradient: '15'
    },
    'Advance': {
      borderWidth: 2,
      outerGlow: { r1: 10, r2: 16, r3: 22, o1: '40', o2: '28', o3: '20' },
      imageGlow: { r1: 8, r2: 14, r3: 20, r4: 5, o1: '50', o2: '38', o3: '28', o4: '15' },
      gradient: '20'
    },
    'Expert': {
      borderWidth: 2.5,
      outerGlow: { r1: 12, r2: 20, r3: 28, o1: '50', o2: '36', o3: '25' },
      imageGlow: { r1: 10, r2: 18, r3: 26, r4: 6, o1: '60', o2: '46', o3: '36', o4: '20' },
      gradient: '25'
    },
    'Leader': {
      borderWidth: 3,
      outerGlow: { r1: 14, r2: 24, r3: 34, o1: '60', o2: '44', o3: '30' },
      imageGlow: { r1: 12, r2: 22, r3: 32, r4: 7, o1: '70', o2: '54', o3: '44', o4: '25' },
      gradient: '30'
    },
    'Angel': {
      borderWidth: 3.5,
      outerGlow: { r1: 16, r2: 28, r3: 40, o1: '70', o2: '52', o3: '35' },
      imageGlow: { r1: 14, r2: 26, r3: 38, r4: 8, o1: '80', o2: '62', o3: '52', o4: '30' },
      gradient: '35'
    }
  };

  const params = levelParams[levelName as keyof typeof levelParams] || levelParams['Growing'];
  const og = params.outerGlow;
  const ig = params.imageGlow;

  return {
    borderWidth: `${params.borderWidth}px`,
    outerGlow: {
      boxShadow: `0 0 ${og.r1}px ${colorScheme.hex}${og.o1}, 0 0 ${og.r2}px ${colorScheme.hex}${og.o2}, 0 0 ${og.r3}px ${colorScheme.hex}${og.o3}`,
      background: `radial-gradient(circle at center, ${colorScheme.hex}${params.gradient}, transparent 70%)`
    },
    imageGlow: `0 0 ${ig.r1}px ${colorScheme.hex}${ig.o1}, 0 0 ${ig.r2}px ${colorScheme.hex}${ig.o2}, 0 0 ${ig.r3}px ${colorScheme.hex}${ig.o3}, inset 0 0 ${ig.r4}px ${colorScheme.hex}${ig.o4}`
  };
}

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

  const glowParams = showBadge && colorScheme ? getProgressiveGlowParameters(level.name, colorScheme) : null;

  const avatarElement = (
    <div className={`relative inline-block ${sizeClasses[size]} ${className}`}>
      {/* Glow effect ring - outer glow layer */}
      {glowParams && (
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            boxShadow: glowParams.outerGlow.boxShadow,
            background: glowParams.outerGlow.background,
          }}
        />
      )}
      {/* Actual image */}
      <img
        key={normalizedAvatarUrl}
        src={normalizedAvatarUrl || AVATAR_FALLBACK}
        alt={alt}
        width={size === 'sm' ? 50 : size === 'md' ? 60 : 80}
        height={size === 'sm' ? 50 : size === 'md' ? 60 : 80}
        className={`${sizeClasses[size]} rounded-full shrink-0 object-cover relative z-10 ${
          showBadge && colorScheme
            ? ''
            : 'border border-white/10'
        }`}
        style={
          glowParams && colorScheme
            ? {
                border: `${glowParams.borderWidth} solid ${colorScheme.hex}`,
                boxShadow: glowParams.imageGlow,
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

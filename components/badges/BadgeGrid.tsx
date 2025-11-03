"use client";

import React from 'react';
import BadgeCard, { BadgeCardData } from './BadgeCard';

interface BadgeGridProps {
  badges: BadgeCardData[];
  earnedFirst?: boolean;
  columns?: 2 | 3 | 4 | 5;
  onBadgeClick?: (badge: BadgeCardData) => void;
  cardVariant?: 'default' | 'compact';
}

export default function BadgeGrid({
  badges,
  earnedFirst = true,
  columns = 3,
  onBadgeClick,
  cardVariant = 'default',
}: BadgeGridProps) {
  // Sort badges: earned first if enabled
  const sortedBadges = earnedFirst
    ? [...badges].sort((a, b) => {
        if (a.earned && !b.earned) return -1;
        if (!a.earned && b.earned) return 1;
        return 0;
      })
    : badges;

  const gridCols = {
    2: 'grid-cols-2 sm:grid-cols-3',
    3: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-3',
    4: 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-4',
    5: 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-5',
  };

  if (badges.length === 0) {
    return (
      <div className="text-center text-white/60 py-12">
        <p>No badges available</p>
      </div>
    );
  }

  const cardSize = cardVariant === 'compact' ? 'sm' : 'md';
  const gapClass = cardVariant === 'compact' ? 'gap-[18px]' : 'gap-[24px]';
  const placementClass = cardVariant === 'compact' ? 'place-items-center' : '';

  return (
    <div className={`grid ${gridCols[columns]} ${gapClass} ${placementClass}`}>
      {sortedBadges.map((badge) => (
        <BadgeCard
          key={badge.key}
          badge={badge}
          onClick={onBadgeClick ? () => onBadgeClick(badge) : undefined}
          size={cardSize}
          variant={cardVariant}
          showProgress={!badge.earned}
        />
      ))}
    </div>
  );
}

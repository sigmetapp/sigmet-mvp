"use client";

import React from 'react';
import BadgeCard, { BadgeCardData } from './BadgeCard';

interface BadgeGridProps {
  badges: BadgeCardData[];
  earnedFirst?: boolean;
  columns?: 2 | 3 | 4 | 5;
  onBadgeClick?: (badge: BadgeCardData) => void;
}

export default function BadgeGrid({
  badges,
  earnedFirst = true,
  columns = 3,
  onBadgeClick,
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
    2: 'grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-2 sm:grid-cols-2 lg:grid-cols-4',
    5: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5',
  };

  if (badges.length === 0) {
    return (
      <div className="text-center text-white/60 py-12">
        <p>No badges available</p>
      </div>
    );
  }

  return (
    <div className={`grid ${gridCols[columns]} gap-6`}>
      {sortedBadges.map((badge) => (
        <BadgeCard
          key={badge.key}
          badge={badge}
          onClick={onBadgeClick ? () => onBadgeClick(badge) : undefined}
          size="md"
          showProgress={!badge.earned}
        />
      ))}
    </div>
  );
}

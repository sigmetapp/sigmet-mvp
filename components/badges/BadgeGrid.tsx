"use client";

import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import BadgeCard, { BadgeCardData } from './BadgeCard';

interface BadgeGridProps {
  badges: BadgeCardData[];
  earnedFirst?: boolean;
  columns?: 2 | 3 | 4 | 5;
  onBadgeClick?: (badge: BadgeCardData) => void;
  layout?: 'grid' | 'carousel';
}

export default function BadgeGrid({
  badges,
  earnedFirst = true,
  columns = 3,
  onBadgeClick,
  layout = 'grid',
}: BadgeGridProps) {
  // Sort badges: earned first if enabled
  const sortedBadges = earnedFirst
    ? [...badges].sort((a, b) => {
        if (a.earned && !b.earned) return -1;
        if (!a.earned && b.earned) return 1;
        return 0;
      })
    : badges;

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const scrollBy = (direction: -1 | 1) => {
    const node = scrollRef.current;
    if (!node) return;
    const amount = node.clientWidth * 0.7 || 320;
    node.scrollBy({ left: amount * direction, behavior: 'smooth' });
  };

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

  if (layout === 'carousel') {
    return (
      <div className="relative group">
        <button
          type="button"
          className="hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 z-10 h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
          onClick={() => scrollBy(-1)}
          aria-label="Scroll badges left"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scroll-smooth -mx-1 px-1"
        >
          {sortedBadges.map((badge) => (
            <div key={badge.key} className="snap-start">
              <BadgeCard
                badge={badge}
                onClick={onBadgeClick ? () => onBadgeClick(badge) : undefined}
                size="sm"
                variant="compact"
                showProgress={!badge.earned}
              />
            </div>
          ))}
        </div>

        <button
          type="button"
          className="hidden md:flex absolute right-0 top-1/2 -translate-y-1/2 z-10 h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
          onClick={() => scrollBy(1)}
          aria-label="Scroll badges right"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className={`grid ${gridCols[columns]} gap-5`}>
      {sortedBadges.map((badge) => (
        <BadgeCard
          key={badge.key}
          badge={badge}
          onClick={onBadgeClick ? () => onBadgeClick(badge) : undefined}
          size="md"
          variant="default"
          showProgress={!badge.earned}
        />
      ))}
    </div>
  );
}

"use client";

import React, { useEffect, useState } from 'react';
import BadgeGrid from './BadgeGrid';
import BadgeDetail from './BadgeDetail';
import { BadgeCardData } from './BadgeCard';

interface ProfileBadgesProps {
  userId: string;
  showAll?: boolean;
  limit?: number;
}

export default function ProfileBadges({
  userId,
  showAll = false,
  limit = 6,
}: ProfileBadgesProps) {
  const [badges, setBadges] = useState<BadgeCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBadge, setSelectedBadge] = useState<BadgeCardData | null>(
    null
  );

  useEffect(() => {
    loadBadges();
  }, [userId]);

  async function loadBadges() {
    try {
      const response = await fetch(`/api/badges/user/${userId}`);
      if (!response.ok) {
        console.error('Failed to load badges');
        setLoading(false);
        return;
      }

      const data = await response.json();
      const badgesToShow = showAll
        ? data.all || []
        : [...(data.earned || []), ...(data.nextToEarn || [])].slice(0, limit);

      setBadges(badgesToShow);
      setLoading(false);
    } catch (error) {
      console.error('Error loading badges:', error);
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="text-center text-white/60 py-8">
        <p>Loading badges...</p>
      </div>
    );
  }

  if (badges.length === 0) {
    return (
      <div className="text-center text-white/60 py-8">
        <p>No badges yet</p>
      </div>
    );
  }

  const earnedCount = badges.filter((b) => b.earned).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Badges</h3>
          <p className="text-white/60 text-sm">
            {earnedCount} of {badges.length} earned
          </p>
        </div>
      </div>

      <BadgeGrid
        badges={badges}
        earnedFirst={true}
        columns={3}
        onBadgeClick={setSelectedBadge}
      />

      {selectedBadge && (
        <BadgeDetail
          badge={selectedBadge}
          onClose={() => setSelectedBadge(null)}
        />
      )}
    </div>
  );
}

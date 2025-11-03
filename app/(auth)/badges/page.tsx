"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import BadgeGrid from '@/components/badges/BadgeGrid';
import BadgeDetail from '@/components/badges/BadgeDetail';
import { BadgeCardData } from '@/components/badges/BadgeCard';
import Button from '@/components/Button';

const ADMIN_EMAILS = new Set<string>(['seosasha@gmail.com']);

export default function BadgesPage() {
  const [loading, setLoading] = useState(true);
  const [badges, setBadges] = useState<BadgeCardData[]>([]);
  const [note, setNote] = useState<string | undefined>();
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [selectedBadge, setSelectedBadge] = useState<BadgeCardData | null>(
    null
  );
  const [recomputing, setRecomputing] = useState(false);

  useEffect(() => {
    loadBadges();
  }, []);

  async function loadBadges() {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      setUserId(user.id);
      setUserEmail(user.email || null);

      const response = await fetch(`/api/badges/user/${user.id}`);
      if (!response.ok) {
        const error = await response.json();
        setNote(error.error || 'Failed to load badges');
        setLoading(false);
        return;
      }

      const data = await response.json();
      setBadges(data.all || []);
      setLoading(false);
    } catch (error: any) {
      console.error('Error loading badges:', error);
      setNote(error.message || 'Failed to load badges');
      setLoading(false);
    }
  }

  async function recomputeBadges() {
    if (!userEmail || !ADMIN_EMAILS.has(userEmail)) {
      setNote('Only admins can recompute badges');
      return;
    }

    setRecomputing(true);
    setNote(undefined);

    try {
      const response = await fetch('/api/badges/recompute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user_id: userId }),
      });

      const data = await response.json();

      if (!response.ok) {
        setNote(data.error || 'Failed to recompute badges');
      } else {
        setNote('Badges recomputed successfully');
        // Reload badges
        await loadBadges();
      }
    } catch (error: any) {
      setNote(error.message || 'Failed to recompute badges');
    } finally {
      setRecomputing(false);
    }
  }

  const earnedCount = badges.filter((b) => b.earned).length;
  const totalCount = badges.length;
  const isAdmin = userEmail && ADMIN_EMAILS.has(userEmail);
  const [grantingBadge, setGrantingBadge] = useState<string | null>(null);

  async function grantOrRevokeBadge(badgeKey: string, action: 'grant' | 'revoke') {
    if (!isAdmin || !userId) return;

    setGrantingBadge(badgeKey);
    try {
      const response = await fetch('/api/badges/grant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: userId,
          badge_key: badgeKey,
          action,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setNote(data.error || `Failed to ${action} badge`);
      } else {
        setNote(`Badge ${action === 'grant' ? 'granted' : 'revoked'}`);
        await loadBadges();
      }
    } catch (error: any) {
      setNote(error.message || `Failed to ${action} badge`);
    } finally {
      setGrantingBadge(null);
    }
  }

  // Group badges by category
  const badgesByCategory = badges.reduce(
    (acc, badge) => {
      if (!acc[badge.category]) {
        acc[badge.category] = [];
      }
      acc[badge.category].push(badge);
      return acc;
    },
    {} as Record<string, BadgeCardData[]>
  );

  const categories = ['activity', 'community', 'growth', 'consistency'];

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="text-white/70">Loading badges…</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-white">Badges</h1>
            <p className="text-white/70 text-sm mt-2">
              Earn badges for your achievements and track your progress.
            </p>
          </div>
          {isAdmin && (
            <Button
              onClick={recomputeBadges}
              variant="secondary"
              disabled={recomputing}
              className="ml-4 whitespace-nowrap"
            >
              {recomputing ? 'Recomputing...' : 'Recompute Badges'}
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="card p-4">
        <div className="grid grid-cols-2 gap-4 text-white/90">
          <div>
            <div className="text-white/60 text-sm">Earned</div>
            <div className="text-2xl font-semibold">
              {earnedCount} / {totalCount}
            </div>
          </div>
          <div>
            <div className="text-white/60 text-sm">Progress</div>
            <div className="text-2xl font-semibold">
              {totalCount > 0
                ? Math.round((earnedCount / totalCount) * 100)
                : 0}
              %
            </div>
          </div>
        </div>
      </div>

      {note && (
        <div className="card p-4 bg-white/5">
          <div className="text-white/80 text-sm">{note}</div>
        </div>
      )}

      {/* Badges by Category */}
      <div className="space-y-8">
        {categories.map((category) => {
          const categoryBadges = badgesByCategory[category] || [];
          if (categoryBadges.length === 0) return null;

          return (
            <div key={category} className="card p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium text-white capitalize">
                  {category}
                </h2>
              </div>
              <BadgeGrid
                badges={categoryBadges}
                earnedFirst={true}
                columns={3}
                onBadgeClick={setSelectedBadge}
              />
              {isAdmin && (
                <div className="pt-4 border-t border-white/10 space-y-2">
                  <h3 className="text-sm font-medium text-white/60 mb-2">
                    Admin Controls - Grant/Revoke Badges
                  </h3>
                  {categoryBadges.map((badge) => {
                    const isEarned = badge.earned;
                    return (
                      <div
                        key={badge.key}
                        className="flex items-center justify-between p-2 rounded bg-white/5"
                      >
                        <span className="text-white/80 text-sm">
                          {badge.title}
                          {isEarned && (
                            <span className="ml-2 text-xs text-emerald-400">
                              (Earned)
                            </span>
                          )}
                        </span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => grantOrRevokeBadge(badge.key, 'grant')}
                            disabled={grantingBadge === badge.key || isEarned}
                            className="px-3 py-1 rounded text-xs transition bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {grantingBadge === badge.key ? '...' : 'Grant'}
                          </button>
                          <button
                            onClick={() => grantOrRevokeBadge(badge.key, 'revoke')}
                            disabled={grantingBadge === badge.key || !isEarned}
                            className="px-3 py-1 rounded text-xs transition bg-red-500/20 text-red-300 hover:bg-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {grantingBadge === badge.key ? '...' : 'Revoke'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {selectedBadge && (
        <BadgeDetail
          badge={selectedBadge}
          onClose={() => setSelectedBadge(null)}
        />
      )}
    </div>
  );
}

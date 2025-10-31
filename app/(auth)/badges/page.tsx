"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Badge, { type BadgeData } from '@/components/Badge';
import Button from '@/components/Button';

export default function BadgesPage() {
  const [loading, setLoading] = useState(true);
  const [badges, setBadges] = useState<BadgeData[]>([]);
  const [note, setNote] = useState<string | undefined>();
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      // Load all badge types
      const { data: badgeTypes } = await supabase
        .from('badge_types')
        .select('*')
        .order('sort_order', { ascending: true });

      // Load user's earned badges
      const { data: earnedBadges } = await supabase
        .from('user_badges')
        .select('badge_id')
        .eq('user_id', user.id);

      const earnedBadgeIds = new Set((earnedBadges || []).map((b) => b.badge_id));

      // Load user's display preferences
      const { data: displayPrefs } = await supabase
        .from('badge_display_preferences')
        .select('displayed_badges')
        .eq('user_id', user.id)
        .maybeSingle();

      const displayedBadgeIds = new Set(displayPrefs?.displayed_badges || []);

      // Combine badge types with earned/displayed status
      const combinedBadges: BadgeData[] = (badgeTypes || []).map((bt) => ({
        id: bt.id,
        name: bt.name,
        emoji: bt.emoji,
        description: bt.description,
        requirement_description: bt.requirement_description,
        earned: earnedBadgeIds.has(bt.id),
        displayed: displayedBadgeIds.has(bt.id),
      }));

      setBadges(combinedBadges);
      setLoading(false);
    })();
  }, []);

  async function toggleBadgeDisplay(badgeId: string) {
    if (!userId) return;
    const badge = badges.find((b) => b.id === badgeId);
    if (!badge || !badge.earned) return;

    const currentDisplayed = new Set(
      badges.filter((b) => b.displayed).map((b) => b.id)
    );

    if (currentDisplayed.has(badgeId)) {
      currentDisplayed.delete(badgeId);
    } else {
      currentDisplayed.add(badgeId);
    }

    const displayedArray = Array.from(currentDisplayed);

    const { error } = await supabase
      .from('badge_display_preferences')
      .upsert(
        {
          user_id: userId,
          displayed_badges: displayedArray,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

    if (error) {
      setNote(error.message);
    } else {
      setNote(undefined);
      setBadges((prev) =>
        prev.map((b) => ({
          ...b,
          displayed: currentDisplayed.has(b.id),
        }))
      );
    }
  }

  async function save() {
    if (!userId) return;
    const displayedArray = badges.filter((b) => b.displayed).map((b) => b.id);

    const { error } = await supabase
      .from('badge_display_preferences')
      .upsert(
        {
          user_id: userId,
          displayed_badges: displayedArray,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

    setNote(error ? error.message : 'Saved');
  }

  const earnedCount = badges.filter((b) => b.earned).length;
  const displayedCount = badges.filter((b) => b.displayed).length;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Badges & Rewards</h1>
        <p className="text-white/70 text-sm mt-2">
          Earn badges for your achievements and choose which ones to display on your profile.
        </p>
      </div>

      {loading ? (
        <div className="text-white/70">Loading badges…</div>
      ) : (
        <div className="space-y-6">
          {/* Stats */}
          <div className="card p-4">
            <div className="grid grid-cols-2 gap-4 text-white/90">
              <div>
                <div className="text-white/60 text-sm">Earned</div>
                <div className="text-2xl font-semibold">{earnedCount} / {badges.length}</div>
              </div>
              <div>
                <div className="text-white/60 text-sm">Displayed on Profile</div>
                <div className="text-2xl font-semibold">{displayedCount}</div>
              </div>
            </div>
          </div>

          {/* Badges Grid */}
          <div className="card p-6 space-y-6">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-medium text-white">All Badges</h2>
              {note && <div className="text-white/60 text-sm">{note}</div>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {badges.map((badge) => (
                <div
                  key={badge.id}
                  className={`
                    rounded-2xl border p-4 transition
                    ${badge.displayed && badge.earned
                      ? 'border-white/40 bg-white/10'
                      : 'border-white/10 bg-white/5'
                    }
                  `}
                >
                  <div className="flex flex-col items-center gap-4">
                    <div className="relative">
                      <Badge
                        badge={badge}
                        size="lg"
                        interactive={badge.earned}
                        onClick={() => badge.earned && toggleBadgeDisplay(badge.id)}
                      />
                      {badge.displayed && badge.earned && (
                        <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-emerald-500 border-2 border-white/20 flex items-center justify-center">
                          <span className="text-xs">✓</span>
                        </div>
                      )}
                    </div>
                    <div className="text-center space-y-2 w-full">
                      <div className="text-white font-medium">{badge.name}</div>
                      <div className="text-white/70 text-sm">{badge.description}</div>
                      {!badge.earned && (
                        <div className="text-white/50 text-xs mt-2 pt-2 border-t border-white/10">
                          {badge.requirement_description}
                        </div>
                      )}
                      {badge.earned && (
                        <button
                          onClick={() => toggleBadgeDisplay(badge.id)}
                          className={`
                            w-full mt-3 px-3 py-2 rounded-lg text-sm border transition
                            ${badge.displayed
                              ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-300'
                              : 'border-white/20 bg-white/5 text-white/70 hover:border-white/30'
                            }
                          `}
                        >
                          {badge.displayed ? '✓ Displayed' : 'Display on Profile'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-white/10">
              <Button onClick={save} variant="primary" className="w-full">
                Save Display Preferences
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

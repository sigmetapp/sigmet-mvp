"use client";

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { RequireAuth } from '@/components/RequireAuth';
import Button from '@/components/Button';
import Link from 'next/link';
import { useTheme } from '@/components/ThemeProvider';
import { captureServer } from '@/lib/analytics.server';

type Direction = {
  id: string;
  slug: string;
  title: string;
  emoji: string;
  sort_index: number;
  isSelected: boolean;
  isPrimary: boolean;
  stats: {
    activeHabits: number;
    activeGoals: number;
    maxStreak: number;
    swPoints: number;
  };
};

type Filter = 'all' | 'habits' | 'goals' | 'active' | 'completed' | 'this_week';

export default function GrowthPage() {
  return (
    <RequireAuth>
      <GrowthInner />
    </RequireAuth>
  );
}

function GrowthInner() {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const [loading, setLoading] = useState(true);
  const [directions, setDirections] = useState<Direction[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [toggling, setToggling] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadDirections();
  }, []);

  async function loadDirections() {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch('/api/growth/directions.list', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!res.ok) {
        throw new Error('Failed to load directions');
      }

      const { directions: dirs } = await res.json();
      setDirections(dirs || []);
    } catch (error: any) {
      console.error('Error loading directions:', error);
    } finally {
      setLoading(false);
    }
  }

  async function toggleDirection(directionId: string) {
    if (toggling.has(directionId)) return;
    setToggling((prev) => new Set(prev).add(directionId));

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch('/api/growth/directions.toggle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ directionId }),
      });

      if (!res.ok) {
        throw new Error('Failed to toggle direction');
      }

      const { action } = await res.json();

      // Track analytics
      const { ph } = await import('@/lib/analytics.client');
      if (action === 'added') {
        ph.capture('growth_direction_selected', { direction_id: directionId });
      } else {
        ph.capture('growth_direction_removed', { direction_id: directionId });
      }

      await loadDirections();
    } catch (error: any) {
      console.error('Error toggling direction:', error);
      alert(error.message || 'Failed to toggle direction');
    } finally {
      setToggling((prev) => {
        const next = new Set(prev);
        next.delete(directionId);
        return next;
      });
    }
  }

  const filteredDirections = useMemo(() => {
    if (filter === 'all') return directions;
    // Filtering logic would be applied here based on stats
    // For now, return all
    return directions;
  }, [directions, filter]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 md:py-8">
      {/* Header */}
      <div className="mb-6 md:mb-8">
        <h1 className={`text-2xl md:text-3xl font-semibold tracking-tight ${isLight ? 'bg-gradient-to-r from-telegram-blue to-telegram-blue-light bg-clip-text text-transparent' : 'gradient-text'}`}>
          My Growth
        </h1>
        <p className={`mt-1 ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
          Track your progress across 12 areas of growth.
        </p>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap gap-2">
        {(['All', 'Habits', 'Goals', 'Active', 'Completed', 'This week'] as const).map((label) => {
          const value = label.toLowerCase().replace(' ', '_') as Filter;
          const active = filter === value;
          return (
            <button
              key={label}
              onClick={() => setFilter(value)}
              className={`px-3 py-1.5 rounded-full text-sm transition border ${
                active
                  ? isLight
                    ? 'bg-telegram-blue text-white border-telegram-blue shadow-[0_2px_8px_rgba(51,144,236,0.25)]'
                    : 'bg-telegram-blue text-white border-telegram-blue shadow-[0_2px_8px_rgba(51,144,236,0.3)]'
                  : isLight
                  ? 'text-telegram-text-secondary border-telegram-blue/20 hover:bg-telegram-blue/10 hover:text-telegram-blue'
                  : 'text-telegram-text-secondary border-telegram-blue/30 hover:bg-telegram-blue/15 hover:text-telegram-blue-light'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Directions Grid */}
      {loading ? (
        <div className={`text-center py-12 ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
          Loading?
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredDirections.map((dir) => {
            const isToggling = toggling.has(dir.id);
            const progress = dir.stats.swPoints > 0 ? Math.min((dir.stats.swPoints / 500) * 100, 100) : 0; // Cap at 500 for display

            return (
              <div
                key={dir.id}
                className={`telegram-card-glow p-4 space-y-3 hover:scale-[1.02] transition-transform ${isLight ? '' : ''}`}
              >
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl" aria-hidden>
                      {dir.emoji}
                    </span>
                    <h3 className={`font-semibold ${isLight ? 'text-telegram-text' : 'text-telegram-text'}`}>
                      {dir.title}
                    </h3>
                  </div>
                  <button
                    onClick={() => toggleDirection(dir.id)}
                    disabled={isToggling}
                    className={`px-2 py-1 rounded-full text-xs font-medium transition ${
                      dir.isSelected
                        ? isLight
                          ? 'bg-telegram-blue text-white'
                          : 'bg-telegram-blue text-white'
                        : isLight
                        ? 'border border-telegram-blue/30 text-telegram-blue hover:bg-telegram-blue/10'
                        : 'border border-telegram-blue/30 text-telegram-blue-light hover:bg-telegram-blue/15'
                    }`}
                  >
                    {isToggling ? '?' : dir.isSelected ? 'Selected' : 'Add'}
                  </button>
                </div>

                {/* Progress Bar */}
                {dir.stats.swPoints > 0 && (
                  <div className="space-y-1">
                    <div className={`flex justify-between text-xs ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                      <span>SW Points</span>
                      <span>{dir.stats.swPoints}</span>
                    </div>
                    <div className={`h-2 rounded-full overflow-hidden ${isLight ? 'bg-telegram-bg-secondary' : 'bg-white/10'}`}>
                      <div
                        className="h-full bg-telegram-blue transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Stats */}
                <div className={`flex items-center justify-between text-xs ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                  <div className="flex gap-3">
                    <span>
                      {dir.stats.activeHabits} habit{dir.stats.activeHabits !== 1 ? 's' : ''}
                    </span>
                    <span>
                      {dir.stats.activeGoals} goal{dir.stats.activeGoals !== 1 ? 's' : ''}
                    </span>
                  </div>
                  {dir.stats.maxStreak > 0 && (
                    <span>?? {dir.stats.maxStreak}</span>
                  )}
                </div>

                {/* Open Button */}
                <Link href={`/growth/${dir.slug}`}>
                  <Button variant="secondary" className="w-full" size="sm">
                    Open
                  </Button>
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

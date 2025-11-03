"use client";

import React from 'react';
import * as Icons from 'lucide-react';
import BadgeCard, { BadgeCardData } from './BadgeCard';

interface BadgeDetailProps {
  badge: BadgeCardData;
  onClose?: () => void;
}

export default function BadgeDetail({ badge, onClose }: BadgeDetailProps) {
  const IconComponent =
    (Icons as any)[badge.icon] || Icons.Award;

  // Map color strings to Tailwind classes
  const colorMap: Record<string, string> = {
    'indigo-500': 'from-indigo-500',
    'purple-500': 'to-purple-500',
    'sky-500': 'from-sky-500',
    'emerald-500': 'to-emerald-500',
    'violet-500': 'from-violet-500',
    'fuchsia-500': 'to-fuchsia-500',
    'cyan-500': 'from-cyan-500',
    'blue-500': 'to-blue-500',
    'red-500': 'from-red-500',
    'rose-500': 'to-rose-500',
    'amber-500': 'from-amber-500',
    'orange-500': 'to-orange-500',
    'slate-500': 'from-slate-500',
    'zinc-500': 'to-zinc-500',
    'yellow-500': 'from-yellow-500',
    'lime-500': 'to-lime-500',
    'green-500': 'to-green-500',
    'teal-500': 'from-teal-500',
    'pink-500': 'to-pink-500',
    'stone-500': 'from-stone-500',
    'neutral-500': 'to-neutral-500',
  };

  const gradientFrom = colorMap[badge.color_start] || `from-${badge.color_start}`;
  const gradientTo = colorMap[badge.color_end] || `to-${badge.color_end}`;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white/10 backdrop-blur-lg rounded-2xl border border-white/20 p-6 max-w-lg w-full space-y-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h2 className="text-2xl font-semibold text-white mb-2">
              {badge.title}
            </h2>
            <p className="text-white/80">{badge.description}</p>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="text-white/60 hover:text-white transition"
            >
              <Icons.X size={24} />
            </button>
          )}
        </div>

        <div className="flex justify-center">
          <BadgeCard badge={badge} size="lg" showProgress={false} />
        </div>

        <div className="space-y-4">
          <div>
            <h3 className="text-white font-medium mb-2">How to Earn</h3>
            <p className="text-white/70 text-sm">{badge.how_to_get}</p>
          </div>

          {!badge.earned && (
            <div className="bg-white/5 rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/70">Progress</span>
                <span className="text-white font-medium">
                  {badge.currentValue} / {badge.threshold}
                </span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-full bg-gradient-to-r ${gradientFrom} ${gradientTo}`}
                  style={{ width: `${Math.round(badge.progress * 100)}%` }}
                />
              </div>
              <div className="text-white/50 text-xs text-center">
                {Math.round(badge.progress * 100)}% complete
              </div>
            </div>
          )}

          {badge.earned && (
            <div className="bg-emerald-500/20 border border-emerald-500/30 rounded-lg p-4">
              <div className="flex items-center gap-2 text-emerald-300">
                <Icons.CheckCircle size={20} />
                <span className="font-medium">Badge Earned!</span>
              </div>
              {badge.awardedAt && (
                <div className="text-white/60 text-xs mt-2">
                  Awarded on {new Date(badge.awardedAt).toLocaleDateString()}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

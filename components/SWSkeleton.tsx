'use client';

import Skeleton from './Skeleton';
import { useTheme } from '@/components/ThemeProvider';

function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

export default function SWSkeleton() {
  const { theme } = useTheme();
  const isLight = theme === 'light';

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 md:p-6 space-y-4">
      {/* Header Skeleton */}
      <div className="flex items-start justify-between">
        <div className="flex-1 space-y-2">
          <Skeleton width="40%" height={32} />
          <Skeleton width="60%" height={16} />
        </div>
        <Skeleton width={140} height={40} />
      </div>

      {/* Tabs Skeleton */}
      <div className="flex gap-2 border-b border-white/10 pb-2">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} width={100} height={36} />
        ))}
      </div>

      {/* Overview Content Skeleton */}
      <div className="space-y-4">
        {/* Total SW Card */}
        <div
          className={cn(
            'card p-6',
            isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
          )}
        >
          <div className="text-center space-y-3">
            <Skeleton width="30%" height={16} className="mx-auto" />
            <Skeleton width="50%" height={64} className="mx-auto" />
            <Skeleton width="25%" height={14} className="mx-auto" />
            <Skeleton width="20%" height={16} className="mx-auto" />
          </div>
        </div>

        {/* Current Level Card */}
        <div
          className={cn(
            'card p-4',
            isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
          )}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="space-y-2">
              <Skeleton width={120} height={14} />
              <Skeleton width={100} height={24} />
            </div>
            <div className="text-right space-y-2">
              <Skeleton width={100} height={14} />
              <Skeleton width={80} height={20} />
              <Skeleton width={120} height={12} />
            </div>
          </div>
          <Skeleton width="100%" height={8} className="rounded-full" />
        </div>

        {/* City Leaders Card */}
        <div
          className={cn(
            'card p-4',
            isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
          )}
        >
          <Skeleton width={150} height={24} className="mb-4" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-white/10">
                <Skeleton variant="circular" width={24} height={24} />
                <Skeleton variant="circular" width={48} height={48} />
                <div className="flex-1 space-y-2">
                  <Skeleton width="40%" height={16} />
                  <Skeleton width="30%" height={14} />
                  <Skeleton width="25%" height={12} />
                </div>
                <div className="text-right space-y-1">
                  <Skeleton width={60} height={16} />
                  <Skeleton width={40} height={12} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

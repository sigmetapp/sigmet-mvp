'use client';

import Skeleton from './Skeleton';
import { useTheme } from '@/components/ThemeProvider';

function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

export default function ProfileSkeleton() {
  const { theme } = useTheme();
  const isLight = theme === 'light';

  return (
    <div className={cn(
      'max-w-7xl mx-auto px-0 md:px-4 py-4 md:p-4',
      'card-glow-primary no-hover p-4 md:p-5 space-y-6'
    )}>
      {/* Header */}
      <Skeleton width="40%" height={24} />

      {/* Tabs */}
      <div className="flex gap-2 border-b border-white/10 pb-2">
        <Skeleton width={60} height={32} />
        <Skeleton width={80} height={32} />
      </div>

      {/* Avatar section */}
      <div className="flex items-center gap-3 pb-2 border-b border-white/10">
        <Skeleton variant="circular" width={64} height={64} />
        <div className="flex-1">
          <Skeleton width={100} height={32} />
        </div>
      </div>

      {/* Form fields grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-2">
          <Skeleton width="40%" height={14} />
          <Skeleton width="100%" height={36} />
        </div>
        <div className="space-y-2">
          <Skeleton width="40%" height={14} />
          <Skeleton width="100%" height={36} />
        </div>
      </div>

      <div className="space-y-2">
        <Skeleton width="30%" height={14} />
        <Skeleton width="100%" height={60} />
      </div>

      {/* Action button */}
      <Skeleton width="100%" height={40} />
    </div>
  );
}

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
      'max-w-2xl mx-auto px-0 md:px-4 py-4 md:p-4',
      'card-glow-primary p-4 md:p-5 space-y-6'
    )}>
      {/* Header section */}
      <div className="flex flex-col md:flex-row items-center md:items-start gap-4">
        <Skeleton variant="circular" width={120} height={120} />
        <div className="flex-1 w-full md:w-auto space-y-3">
          <Skeleton width="60%" height={24} />
          <Skeleton width="40%" height={16} />
          <Skeleton width="50%" height={16} />
        </div>
      </div>

      {/* Form fields */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Skeleton width="30%" height={14} />
          <Skeleton width="100%" height={40} />
        </div>
        <div className="space-y-2">
          <Skeleton width="30%" height={14} />
          <Skeleton width="100%" height={40} />
        </div>
        <div className="space-y-2">
          <Skeleton width="30%" height={14} />
          <Skeleton width="100%" height={100} />
        </div>
        <div className="space-y-2">
          <Skeleton width="30%" height={14} />
          <Skeleton width="100%" height={40} />
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        <Skeleton width={120} height={40} />
        <Skeleton width={120} height={40} />
      </div>
    </div>
  );
}

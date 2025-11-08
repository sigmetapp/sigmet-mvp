'use client';

import Skeleton from './Skeleton';
import { useTheme } from '@/components/ThemeProvider';

function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

type PostSkeletonProps = {
  className?: string;
  showImage?: boolean;
  showActions?: boolean;
};

export default function PostSkeleton({
  className,
  showImage = false,
  showActions = true,
}: PostSkeletonProps) {
  const { theme } = useTheme();
  const isLight = theme === 'light';

  return (
    <div
      className={cn(
        'card p-3 md:p-4 space-y-3 rounded-none md:rounded-none',
        isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800',
        className
      )}
    >
      {/* Header: Avatar + Name + Time */}
      <div className="flex items-start gap-3">
        <Skeleton variant="circular" width={40} height={40} />
        <div className="flex-1 space-y-2">
          <Skeleton width="30%" height={16} />
          <Skeleton width="20%" height={12} />
        </div>
      </div>

      {/* Content: Text lines */}
      <div className="space-y-2">
        <Skeleton width="100%" height={16} />
        <Skeleton width="95%" height={16} />
        <Skeleton width="80%" height={16} />
      </div>

      {/* Optional: Image placeholder */}
      {showImage && (
        <Skeleton
          width="100%"
          height={200}
          className="rounded-lg"
        />
      )}

      {/* Optional: Actions */}
      {showActions && (
        <div className="flex items-center gap-4 pt-2">
          <Skeleton width={60} height={24} />
          <Skeleton width={60} height={24} />
          <Skeleton width={60} height={24} />
        </div>
      )}
    </div>
  );
}

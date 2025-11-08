'use client';

import Skeleton from './Skeleton';
import { useTheme } from '@/components/ThemeProvider';

function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

type PostDetailSkeletonProps = {
  className?: string;
};

export default function PostDetailSkeleton({
  className,
}: PostDetailSkeletonProps) {
  const { theme } = useTheme();
  const isLight = theme === 'light';

  return (
    <div
      className={cn(
        'mx-auto flex w-full max-w-[852px] flex-col gap-4 px-4 py-4 md:py-5',
        className
      )}
    >
      {/* Back button skeleton */}
      <Skeleton width={120} height={36} className="self-start" />

      {/* Post card skeleton */}
      <div
        className={cn(
          'card p-3 md:p-4 space-y-4 rounded-none md:rounded-none',
          isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
        )}
      >
        {/* Header: Avatar + Name + Time */}
        <div className="flex items-start gap-3">
          <Skeleton variant="circular" width={40} height={40} />
          <div className="flex-1 space-y-2">
            <Skeleton width="40%" height={16} />
            <Skeleton width="25%" height={12} />
          </div>
        </div>

        {/* Content: Text lines */}
        <div className="space-y-2">
          <Skeleton width="100%" height={16} />
          <Skeleton width="95%" height={16} />
          <Skeleton width="90%" height={16} />
          <Skeleton width="85%" height={16} />
          <Skeleton width="70%" height={16} />
        </div>

        {/* Optional: Image placeholder */}
        <Skeleton
          width="100%"
          height={300}
          className="rounded-lg"
        />

        {/* Stats and actions */}
        <div className="flex items-center gap-3 pt-2">
          <Skeleton width={60} height={24} />
          <Skeleton width={80} height={24} />
          <Skeleton width={100} height={24} className="ml-auto" />
        </div>
      </div>

      {/* Comments section skeleton */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton width={150} height={24} />
          <Skeleton width={80} height={32} />
        </div>

        {/* Comment input skeleton */}
        <div
          className={cn(
            'rounded-xl border p-4 shadow-sm',
            isLight ? 'border-slate-200 bg-white' : 'border-slate-800 bg-slate-900'
          )}
        >
          <Skeleton width="100%" height={80} className="rounded-lg" />
          <div className="mt-3 flex items-center justify-end gap-2">
            <Skeleton width={32} height={32} className="rounded" />
            <Skeleton width={80} height={32} className="rounded" />
          </div>
        </div>

        {/* Comments list skeleton */}
        <div className="space-y-3">
          <div className="h-24 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
          <div className="h-24 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
        </div>
      </section>
    </div>
  );
}

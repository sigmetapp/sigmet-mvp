import React from 'react';
import Skeleton from '@/components/Skeleton';

export default function DmChatLoading() {
  return (
    <div className="flex flex-col h-screen">
      {/* Header skeleton */}
      <div className="border-b border-slate-200 dark:border-slate-800 p-4">
        <div className="flex items-center gap-3">
          <Skeleton variant="circular" width="40px" height="40px" />
          <div className="flex-1 space-y-2">
            <Skeleton variant="rectangular" width="120px" height="16px" />
            <Skeleton variant="rectangular" width="80px" height="12px" />
          </div>
        </div>
      </div>

      {/* Messages skeleton */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton variant="circular" width="32px" height="32px" />
            <div className="flex-1 space-y-2">
              <Skeleton variant="rectangular" width="200px" height="16px" />
              <Skeleton variant="rectangular" width="150px" height="40px" className="rounded-lg" />
            </div>
          </div>
        ))}
      </div>

      {/* Input skeleton */}
      <div className="border-t border-slate-200 dark:border-slate-800 p-4">
        <Skeleton variant="rectangular" width="100%" height="40px" className="rounded-lg" />
      </div>
    </div>
  );
}

import React from 'react';
import Skeleton from '@/components/Skeleton';

export default function DmsLoading() {
  return (
    <div className="container mx-auto px-4 py-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <Skeleton variant="rectangular" width="200px" height="32px" />
        </div>
        
        <div className="space-y-3">
          {/* Partner list skeletons */}
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-4 border border-slate-200 dark:border-slate-800 rounded-lg">
              <Skeleton variant="circular" width="50px" height="50px" />
              <div className="flex-1 space-y-2">
                <Skeleton variant="rectangular" width="150px" height="16px" />
                <Skeleton variant="rectangular" width="200px" height="14px" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

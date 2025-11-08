import React from 'react';
import PostSkeleton from '@/components/PostSkeleton';

export default function FeedLoading() {
  return (
    <div className="container mx-auto px-4 py-6">
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Show 3 skeleton posts */}
        {Array.from({ length: 3 }).map((_, i) => (
          <PostSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

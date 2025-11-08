import React from 'react';
import PostDetailSkeleton from '@/components/PostDetailSkeleton';

export default function PostDetailLoading() {
  return (
    <div className="container mx-auto px-4 py-6">
      <div className="max-w-2xl mx-auto">
        <PostDetailSkeleton />
      </div>
    </div>
  );
}

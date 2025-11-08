import React from 'react';
import ProfileSkeleton from '@/components/ProfileSkeleton';

export default function ProfileLoading() {
  return (
    <div className="container mx-auto px-4 py-6">
      <div className="max-w-2xl mx-auto">
        <ProfileSkeleton />
      </div>
    </div>
  );
}

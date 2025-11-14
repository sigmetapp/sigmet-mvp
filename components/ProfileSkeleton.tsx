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
    <main className="max-w-7xl mx-auto px-0 md:px-4 py-4 md:p-4">
      <div className={cn(
        'card-glow-primary no-hover p-4 md:p-5 space-y-3'
      )}>
        {/* Header */}
        <Skeleton width="40%" height={20} />

        {/* Tabs */}
        <div className="flex gap-2 border-b border-white/10 pb-2">
          <Skeleton width={60} height={36} />
          <Skeleton width={80} height={36} />
        </div>

        {/* Main Tab Content */}
        <div className="space-y-4">
          {/* Avatar section */}
          <div className="flex items-center gap-3 pb-3 border-b border-white/10">
            <Skeleton variant="circular" width={64} height={64} />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Skeleton width={100} height={32} />
                <Skeleton width={80} height={32} />
              </div>
            </div>
          </div>

          {/* Basic info grid - Username and Full name */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Skeleton width="30%" height={12} />
              <Skeleton width="100%" height={36} />
            </div>
            <div className="space-y-1.5">
              <Skeleton width="35%" height={12} />
              <Skeleton width="100%" height={36} />
            </div>
          </div>

          {/* About textarea */}
          <div className="space-y-1.5">
            <Skeleton width="20%" height={12} />
            <Skeleton width="100%" height={56} />
          </div>

          {/* Personal info grid - 2x2 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Skeleton width="50%" height={12} />
              <Skeleton width="100%" height={36} />
            </div>
            <div className="space-y-1.5">
              <Skeleton width="40%" height={12} />
              <Skeleton width="100%" height={36} />
            </div>
            <div className="space-y-1.5">
              <Skeleton width="50%" height={12} />
              <Skeleton width="100%" height={36} />
            </div>
            <div className="space-y-1.5">
              <Skeleton width="45%" height={12} />
              <Skeleton width="100%" height={36} />
            </div>
          </div>

          {/* Educational Institution */}
          <div className="space-y-1.5">
            <Skeleton width="35%" height={12} />
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <div>
                <Skeleton width="100%" height={36} />
              </div>
              <div className="md:col-span-3">
                <Skeleton width="100%" height={36} />
              </div>
            </div>
          </div>

          {/* Website and Social Media */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Skeleton width="60%" height={12} />
              <Skeleton width="100%" height={36} />
            </div>
            <div className="space-y-1.5">
              <Skeleton width="40%" height={12} />
              <div className="flex gap-4 pt-1.5">
                <Skeleton width={60} height={20} />
                <Skeleton width={60} height={20} />
              </div>
            </div>
          </div>

          {/* Social Media grid */}
          <div className="space-y-1.5">
            <Skeleton width="30%" height={12} />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div className="space-y-1">
                <Skeleton width="50%" height={10} />
                <Skeleton width="100%" height={36} />
              </div>
              <div className="space-y-1">
                <Skeleton width="50%" height={10} />
                <Skeleton width="100%" height={36} />
              </div>
              <div className="space-y-1">
                <Skeleton width="30%" height={10} />
                <Skeleton width="100%" height={36} />
              </div>
            </div>
          </div>

          {/* Password Change Section */}
          <div className="pt-4 border-t border-white/10">
            <Skeleton width="100%" height={40} />
          </div>
        </div>

        {/* Save button */}
        <Skeleton width="100%" height={40} />
      </div>
    </main>
  );
}

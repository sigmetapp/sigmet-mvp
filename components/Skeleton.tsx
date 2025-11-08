'use client';

import { useTheme } from '@/components/ThemeProvider';

function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

type SkeletonProps = {
  className?: string;
  variant?: 'default' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
  animated?: boolean;
};

export default function Skeleton({
  className,
  variant = 'default',
  width,
  height,
  animated = true,
}: SkeletonProps) {
  const { theme } = useTheme();
  const isLight = theme === 'light';

  const variantClasses = {
    default: 'rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-none',
  };

  const style: React.CSSProperties = {};
  if (width) style.width = typeof width === 'number' ? `${width}px` : width;
  if (height) style.height = typeof height === 'number' ? `${height}px` : height;

  return (
    <div
      className={cn(
        'skeleton',
        variantClasses[variant],
        !animated && 'animate-none',
        className
      )}
      style={style}
      aria-hidden="true"
    />
  );
}

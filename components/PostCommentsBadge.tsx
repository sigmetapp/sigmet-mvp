'use client';

import React, { useCallback } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

export interface PostCommentsBadgeProps {
  count?: number;
  onOpen?: () => void;
  onFocusComposer?: () => void;
  unread?: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  disabled?: boolean;
  loading?: boolean;
}

type SizeConfig = {
  height: string;
  iconSize: string;
  fontSize: string;
  paddingX: string;
  unreadDotSize: string;
};

const sizeConfigs: Record<'sm' | 'md' | 'lg', SizeConfig> = {
  sm: {
    height: 'h-8',
    iconSize: 'w-4 h-4',
    fontSize: 'text-xs',
    paddingX: 'px-2',
    unreadDotSize: 'w-1.5 h-1.5',
  },
  md: {
    height: 'h-9',
    iconSize: 'w-[18px] h-[18px]',
    fontSize: 'text-[13px] leading-[14px]',
    paddingX: 'px-3',
    unreadDotSize: 'w-2 h-2',
  },
  lg: {
    height: 'h-10',
    iconSize: 'w-5 h-5',
    fontSize: 'text-[15px] leading-[16px]',
    paddingX: 'px-3.5',
    unreadDotSize: 'w-2.5 h-2.5',
  },
};

/**
 * Badge component for displaying comment count with icon.
 * Opens comment section on click and focuses composer input.
 */
export default function PostCommentsBadge({
  count = 0,
  onOpen,
  onFocusComposer,
  unread = 0,
  size = 'md',
  className = '',
  disabled = false,
  loading = false,
}: PostCommentsBadgeProps) {
  const shouldReduceMotion = useReducedMotion();
  const config = sizeConfigs[size];

  const handleClick = useCallback(() => {
    if (disabled || loading) return;

    onOpen?.();

    // Use microtask to execute focus after onOpen
    Promise.resolve().then(() => {
      if (onFocusComposer) {
        onFocusComposer();
      } else {
        // Fallback: try to find and focus comment composer
        const composer = document.getElementById('comment-composer');
        if (composer) {
          composer.focus();
          composer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
    });
  }, [disabled, loading, onOpen, onFocusComposer]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (disabled || loading) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleClick();
      }
    },
    [disabled, loading, handleClick]
  );

  const displayCount = loading ? 0 : count;
  const hasUnread = unread > 0;

  // Motion variants
  const hoverVariants = shouldReduceMotion
    ? {}
    : {
        scale: 1.05,
      };

  const tapVariants = shouldReduceMotion ? {} : { scale: 0.95 };

  const countAnimation = shouldReduceMotion
    ? { opacity: [0, 1] }
    : { y: [6, 0], opacity: [0, 1] };

  const countTransition = shouldReduceMotion
    ? { duration: 0.15 }
    : { type: 'spring', stiffness: 500, damping: 28 };

  return (
    <motion.button
      type="button"
      role="button"
      aria-label="Open comments"
      aria-busy={loading}
      aria-live="polite"
      disabled={disabled || loading}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      whileHover={hoverVariants}
      whileTap={tapVariants}
      data-testid="comments-badge"
      className={`
        ${config.height}
        ${config.paddingX}
        relative
        inline-flex
        items-center
        gap-2
        rounded-2xl
        border
        border-white/10
        bg-white/10
        dark:bg-zinc-900/10
        shadow-sm
        backdrop-blur
        text-zinc-600
        dark:text-zinc-300
        transition-all
        duration-150
        will-change-transform
        focus-visible:outline-none
        focus-visible:ring-2
        focus-visible:ring-[#4db8ff]/50
        focus-visible:ring-offset-2
        focus-visible:ring-offset-white
        dark:focus-visible:ring-offset-zinc-900
        hover:text-[#4db8ff]
        hover:border-[#4db8ff]/30
        hover:shadow-md
        hover:shadow-[#4db8ff]/20
        active:scale-95
        disabled:opacity-50
        disabled:cursor-not-allowed
        before:absolute
        before:inset-0
        before:rounded-2xl
        before:bg-[#4db8ff]/0
        before:transition-opacity
        before:duration-150
        before:pointer-events-none
        before:z-0
        hover:before:bg-[#4db8ff]/10
        ${className}
      `}
    >
      {/* Comment icon */}
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className={`${config.iconSize} ${loading ? 'opacity-50' : ''} relative z-10`}
        fill="currentColor"
      >
        <path d="M3 5.5A2.5 2.5 0 0 1 5.5 3h13A2.5 2.5 0 0 1 21 5.5v7A2.5 2.5 0 0 1 18.5 15H9l-4.5 4v-4H5.5A2.5 2.5 0 0 1 3 12.5v-7z" />
      </svg>

      {/* Count or skeleton */}
      {loading ? (
        <span className="w-6 h-3 rounded bg-white/20 dark:bg-white/10 animate-pulse relative z-10" />
      ) : (
        <motion.span
          key={displayCount}
          initial={countAnimation}
          animate={{ y: 0, opacity: 1 }}
          transition={countTransition}
          data-testid="comments-count"
          className={`${config.fontSize} font-medium tabular-nums relative z-10`}
        >
          {displayCount}
        </motion.span>
      )}

      {/* Unread indicator */}
      {hasUnread && !loading && (
        <span
          data-testid="comments-unread"
          className={`
            absolute
            top-0
            right-0
            ${config.unreadDotSize}
            -translate-y-1/2
            translate-x-1/2
            rounded-full
            bg-[#4db8ff]
            border-2
            border-white
            dark:border-zinc-900
            shadow-sm
            z-20
          `}
          aria-label={`${unread} unread comment${unread === 1 ? '' : 's'}`}
        />
      )}
    </motion.button>
  );
}
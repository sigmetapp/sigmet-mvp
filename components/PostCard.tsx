'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type PostCardPost = {
  id: string;
  author: string;
  content: string;
  createdAt: string;
  commentsCount?: number;
};

type PostCardProps = {
  post: PostCardPost;
  onOpen?: (id: string) => void;
  children?: React.ReactNode;
  className?: string;
};

type Ripple = {
  id: number;
  x: number;
  y: number;
  size: number;
};

const INTERACTIVE_SELECTOR =
  'a, button, [role="button"], input, textarea, select, label, svg, [data-interactive], [data-prevent-card-navigation="true"]';

export default function PostCard({ post, onOpen, children, className }: PostCardProps) {
  const router = useRouter();
  const cardRef = useRef<HTMLDivElement>(null);
  const rippleTimeouts = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const [supportsHover, setSupportsHover] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const mediaQuery = window.matchMedia('(hover: hover) and (pointer: fine)');

    const updateSupportsHover = (event: MediaQueryList | MediaQueryListEvent) => {
      setSupportsHover(event.matches);
    };

    updateSupportsHover(mediaQuery);

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', updateSupportsHover);
      return () => mediaQuery.removeEventListener('change', updateSupportsHover);
    }

    mediaQuery.addListener(updateSupportsHover);
    return () => mediaQuery.removeListener(updateSupportsHover);
  }, []);

  useEffect(() => () => {
    rippleTimeouts.current.forEach(clearTimeout);
    rippleTimeouts.current = [];
  }, []);

  const createdAtDate = useMemo(() => {
    if (!post.createdAt) return undefined;
    const parsed = new Date(post.createdAt);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }, [post.createdAt]);

  const formattedCreatedAt = useMemo(() => {
    if (!post.createdAt) return undefined;
    if (!createdAtDate) return post.createdAt;
    try {
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(createdAtDate);
    } catch (error) {
      return post.createdAt;
    }
  }, [createdAtDate, post.createdAt]);

  const openPost = useCallback(() => {
    onOpen?.(post.id);
    router.push(`/post/${post.id}`);
  }, [onOpen, post.id, router]);

  const triggerRipple = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const { current: card } = cardRef;
      if (!card) return;

      const rect = card.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 1.2;
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const id = Date.now() + Math.random();

      setRipples((prev) => [...prev, { id, x, y, size }]);

      const timeout = setTimeout(() => {
        setRipples((prev) => prev.filter((ripple) => ripple.id !== id));
      }, 600);

      rippleTimeouts.current.push(timeout);
    },
    []
  );

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;

      const target = event.target as HTMLElement | null;
      if (target && target.closest(INTERACTIVE_SELECTOR)) {
        return;
      }

      triggerRipple(event);
      openPost();
    },
    [openPost, triggerRipple]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (target && target !== event.currentTarget) {
        return;
      }

      event.preventDefault();
      openPost();
    },
    [openPost]
  );

  const containerClassName = [
    'relative overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-slate-800 dark:bg-slate-900 cursor-pointer',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const commentsLabel = useMemo(() => {
    if (post.commentsCount == null) return undefined;
    const count = post.commentsCount;
    const suffix = count === 1 ? 'comment' : 'comments';
    return `${count.toLocaleString()} ${suffix}`;
  }, [post.commentsCount]);

  return (
    <motion.div
      ref={cardRef}
      role="button"
      aria-label="Open post"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      initial={false}
      animate={{ y: 0, boxShadow: '0 0 0 rgba(15, 23, 42, 0)' }}
      whileHover={supportsHover ? { y: -4, boxShadow: '0 18px 32px rgba(15, 23, 42, 0.12)' } : undefined}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={containerClassName}
      data-post-id={post.id}
    >
      <div className="relative z-10 flex flex-col gap-3">
        <header className="flex items-start justify-between gap-4">
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{post.author}</div>
          {formattedCreatedAt && (
            <time
              dateTime={createdAtDate ? createdAtDate.toISOString() : undefined}
              className="text-xs text-slate-500 dark:text-slate-400"
            >
              {formattedCreatedAt}
            </time>
          )}
        </header>

        <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-slate-300">
          {post.content}
        </p>

        {commentsLabel && (
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{commentsLabel}</div>
        )}

        {children && <div className="pt-1">{children}</div>}
      </div>

      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <AnimatePresence>
          {ripples.map((ripple) => (
            <motion.span
              key={ripple.id}
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-500/20"
              style={{
                left: ripple.x,
                top: ripple.y,
                width: ripple.size,
                height: ripple.size,
              }}
              initial={{ opacity: 0.5, scale: 0 }}
              animate={{ opacity: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            />
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

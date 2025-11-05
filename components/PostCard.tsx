'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatTextWithMentions } from '@/lib/formatText';

type PostCardPost = {
  id: string;
  author: string;
  content: string;
  createdAt: string;
  commentsCount?: number;
};

type PostCardProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'children' | 'onClick' | 'onKeyDown'> & {
  post: PostCardPost;
  onOpen?: (id: string) => void;
  children?: React.ReactNode;
  className?: string;
  disableNavigation?: boolean;
  renderContent?: (post: PostCardPost, defaultContent: React.ReactNode) => React.ReactNode;
};

type Ripple = {
  id: number;
  x: number;
  y: number;
  size: number;
};

const INTERACTIVE_SELECTOR =
  'a, button, [role="button"]:not([data-allow-card-click]), input, textarea, select, label, [data-interactive], [data-prevent-card-navigation="true"]';

export default function PostCard({
  post,
  onOpen,
  children,
  className,
  disableNavigation = false,
  renderContent,
  ...rest
}: PostCardProps) {
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
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      
      const dateOnly = new Date(createdAtDate.getFullYear(), createdAtDate.getMonth(), createdAtDate.getDate());
      
      const timePart = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).format(createdAtDate);
      
      // Check if date is today
      if (dateOnly.getTime() === today.getTime()) {
        return `today, ${timePart}`;
      }
      
      // Check if date is yesterday
      if (dateOnly.getTime() === yesterday.getTime()) {
        return `yesterday, ${timePart}`;
      }
      
      // For all other dates, use the original format
      return new Intl.DateTimeFormat('en-US', {
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
      if (disableNavigation) return;
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;

      const target = event.target as HTMLElement | null;
      
      // Only block if clicking directly on an interactive element
      if (target) {
        // Check for explicit blocking attributes
        if (
          target.getAttribute('data-prevent-card-navigation') === 'true' ||
          target.getAttribute('data-interactive') === 'true'
        ) {
          return;
        }

        // Check if clicking directly on a button, link, or element with role="button"
        const tagName = target.tagName;
        const role = target.getAttribute('role');
        
        if (tagName === 'BUTTON' || tagName === 'A' || role === 'button') {
          // Allow if it has data-allow-card-click (rare case)
          if (target.getAttribute('data-allow-card-click') !== 'true') {
            return;
          }
        }

        // Check if target is a form control
        if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || tagName === 'LABEL') {
          return;
        }
      }

      // Allow navigation for all other clicks
      triggerRipple(event);
      openPost();
    },
    [disableNavigation, openPost, triggerRipple]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (disableNavigation) return;
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
    [disableNavigation, openPost]
  );

  const containerClassName = [
    'relative overflow-hidden rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-slate-800 dark:bg-slate-900',
    'post-card-glow',
    disableNavigation ? 'cursor-default' : 'cursor-pointer',
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

  const defaultContent = (
    <div className="relative z-10 flex flex-col gap-2">
      <header className="flex items-start justify-between gap-3">
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

      <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-slate-300">{formatTextWithMentions(post.content)}</p>

      {commentsLabel && (
        <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{commentsLabel}</div>
      )}

      {children && <div className="pt-1">{children}</div>}
    </div>
  );

  const body = renderContent ? renderContent(post, defaultContent) : defaultContent;

  return (
    <motion.div
      ref={cardRef}
      role={disableNavigation ? undefined : 'button'}
      aria-label={disableNavigation ? undefined : 'Open post'}
      tabIndex={disableNavigation ? undefined : 0}
      onClick={disableNavigation ? undefined : handleClick}
      onKeyDown={disableNavigation ? undefined : handleKeyDown}
      initial={false}
      animate={{ y: 0 }}
      whileHover={
        !disableNavigation && supportsHover ? { y: -4, scale: 1.01 } : undefined
      }
      whileTap={!disableNavigation ? { scale: 0.98 } : undefined}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={containerClassName}
      data-post-id={post.id}
      {...rest}
    >
      {body}

      {!disableNavigation && (
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
      )}
    </motion.div>
  );
}

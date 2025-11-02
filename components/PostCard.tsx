'use client';

import { useRouter } from 'next/navigation';
import { useState, useRef, MouseEvent } from 'react';
import { motion } from 'framer-motion';

export interface PostCardProps {
  post: {
    id: string;
    author: string;
    content: string;
    createdAt: string;
    commentsCount?: number;
  };
  onOpen?: (id: string) => void;
  children?: React.ReactNode;
  className?: string;
}

export default function PostCard({ post, onOpen, children, className = '' }: PostCardProps) {
  const router = useRouter();
  const [ripples, setRipples] = useState<Array<{ x: number; y: number; id: number }>>([]);
  const cardRef = useRef<HTMLDivElement>(null);
  const rippleIdRef = useRef(0);

  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    // ?????????, ??? ?? ???? ?? ????????????? ????????
    const target = e.target as HTMLElement;
    const isInteractive = 
      target.closest('button') ||
      target.closest('a') ||
      target.closest('[role="button"]') ||
      target.closest('input') ||
      target.closest('textarea') ||
      target.closest('select') ||
      target.closest('[data-interactive]') ||
      target.closest('[data-no-navigate]');

    if (isInteractive) {
      return; // ?? ?????????, ???? ???? ??? ?? ????????????? ????????
    }

    // ??????? ripple ??????
    if (cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const id = rippleIdRef.current++;
      
      setRipples((prev) => [...prev, { x, y, id }]);
      
      // ??????? ripple ????? 600ms
      setTimeout(() => {
        setRipples((prev) => prev.filter((r) => r.id !== id));
      }, 600);
    }

    // ???????? ??????? ???? ????
    if (onOpen) {
      onOpen(post.id);
    }

    // ????????? ?? ???????? ?????
    router.push(`/post/${post.id}`);
  };

  return (
    <motion.div
      ref={cardRef}
      onClick={handleClick}
      role="button"
      aria-label="Open post"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick(e as any);
        }
      }}
      className={`
        relative overflow-hidden
        rounded-xl border
        bg-white dark:bg-gray-900
        border-gray-200 dark:border-gray-800
        p-4 md:p-6
        cursor-pointer
        transition-all duration-300
        ${className}
      `}
      whileHover={{
        y: -4,
        boxShadow: '0 12px 24px rgba(0, 0, 0, 0.12), 0 4px 8px rgba(0, 0, 0, 0.08)',
        transition: { duration: 0.2, ease: 'easeOut' }
      }}
      whileTap={{
        scale: 0.98,
        transition: { duration: 0.1 }
      }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Ripple ??????? */}
      {ripples.map((ripple) => (
        <motion.div
          key={ripple.id}
          className="absolute rounded-full bg-black/10 dark:bg-white/10 pointer-events-none"
          style={{
            left: ripple.x,
            top: ripple.y,
            width: 0,
            height: 0,
          }}
          animate={{
            width: 300,
            height: 300,
            x: -150,
            y: -150,
            opacity: [0.3, 0.1, 0],
          }}
          transition={{
            duration: 0.6,
            ease: 'easeOut',
          }}
        />
      ))}

      {/* ????????? ? ??????? ? ????? */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {post.author}
          </div>
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {new Date(post.createdAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </div>
      </div>

      {/* ??????? ????? */}
      <div className="mb-4">
        <p className="text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words">
          {post.content}
        </p>
      </div>

      {/* ?????????????? ???????? (children) - ???????, ?????? ? ?.?. */}
      {children && (
        <div 
          className="mt-4"
          data-interactive="true"
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      )}

      {/* ??????? ???????????? */}
      {post.commentsCount !== undefined && (
        <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          {post.commentsCount} {post.commentsCount === 1 ? 'comment' : 'comments'}
        </div>
      )}
    </motion.div>
  );
}

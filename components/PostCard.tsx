'use client';

import { useRouter } from 'next/navigation';
import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import PostReactions from './PostReactions';

export interface Post {
  id: string;
  author: string;
  content: string;
  createdAt: string;
  commentsCount?: number;
}

export interface PostCardProps {
  post: Post;
  onOpen?: (id: string) => void;
  children?: React.ReactNode;
  className?: string;
}

export default function PostCard({ post, onOpen, children, className = '' }: PostCardProps) {
  const router = useRouter();
  const [ripples, setRipples] = useState<Array<{ x: number; y: number; id: number }>>([]);
  const cardRef = useRef<HTMLDivElement>(null);
  const rippleIdRef = useRef(0);

  const handleCardClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // ?????????, ?? ??? ?? ???? ?? ????????????? ????????
    const target = e.target as HTMLElement;
    
    // ?????????? ????? ?? ????????????? ????????
    if (
      target.tagName === 'BUTTON' ||
      target.tagName === 'A' ||
      target.closest('button') ||
      target.closest('a') ||
      target.closest('[role="button"]') ||
      // ?????????? ????? ?? PostReactions (???????? ??????)
      target.closest('[data-interactive="true"]')
    ) {
      return;
    }

    // ??????? ripple ??????
    if (cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const id = rippleIdRef.current++;
      
      setRipples((prev) => [...prev, { x, y, id }]);
      
      // ??????? ripple ????? ????????
      setTimeout(() => {
        setRipples((prev) => prev.filter((r) => r.id !== id));
      }, 600);
    }

    // ???????? ???????
    if (onOpen) {
      onOpen(post.id);
    }

    // ??????? ?? ???????? ?????
    router.push(`/post/${post.id}`);
  };

  return (
    <motion.div
      ref={cardRef}
      onClick={handleCardClick}
      role="button"
      aria-label="Open post"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleCardClick(e as any);
        }
      }}
      whileHover={{
        y: -4,
        boxShadow: '0 8px 24px rgba(51, 144, 236, 0.2)',
        transition: { duration: 0.2, ease: 'easeOut' },
      }}
      whileTap={{ scale: 0.99 }}
      style={{
        boxShadow: '0 2px 8px rgba(51, 144, 236, 0.1)',
      }}
      className={`card p-4 md:p-6 relative overflow-hidden cursor-pointer select-none ${className}`}
    >
      {/* Ripple ??????? */}
      {ripples.map((ripple) => (
        <motion.div
          key={ripple.id}
          className="absolute rounded-full pointer-events-none"
          initial={{ scale: 0, opacity: 0.6 }}
          animate={{ scale: 4, opacity: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          style={{
            left: ripple.x,
            top: ripple.y,
            width: 20,
            height: 20,
            background: 'rgba(51, 144, 236, 0.3)',
            transform: 'translate(-50%, -50%)',
          }}
        />
      ))}

      {/* ??????? ???????? */}
      <div className="relative z-10">
        {/* ????? */}
        <div className="text-sm text-[var(--muted)] mb-2">{post.author}</div>

        {/* ????? ????? */}
        <div className="mt-2 whitespace-pre-wrap break-words">{post.content}</div>

        {/* ???? ???????? */}
        <div className="text-xs text-[var(--muted)] mt-3">{post.createdAt}</div>

        {/* ??????? ???????????? */}
        {post.commentsCount !== undefined && (
          <div className="text-xs text-[var(--muted)] mt-1">
            {post.commentsCount} {post.commentsCount === 1 ? 'comment' : 'comments'}
          </div>
        )}

        {/* ?????????????? ???????? (????????, PostReactions) */}
        {children && (
          <div 
            data-interactive="true" 
            className="mt-4"
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </div>
        )}
      </div>

      {/* Hover ?????? - ?????????? ????? */}
      <motion.div
        className="absolute inset-0 rounded-2xl pointer-events-none"
        initial={{ opacity: 0 }}
        whileHover={{ opacity: 1 }}
        style={{
          boxShadow: 'inset 0 0 0 1px rgba(51, 144, 236, 0.2)',
          background: 'linear-gradient(135deg, rgba(51, 144, 236, 0.05), transparent)',
        }}
      />
    </motion.div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from './ThemeProvider';

export type ReactionType = 'inspire' | 'respect' | 'relate' | 'support' | 'celebrate';

export interface Reaction {
  id: ReactionType;
  emoji: string;
  label: string;
  color: string;
}

// Use Unicode escape sequences for emojis to ensure they're properly encoded
const REACTIONS: Reaction[] = [
  { 
    id: 'inspire', 
    emoji: String.fromCharCode(0xD83D, 0xDD25), // ??
    label: 'Inspire', 
    color: '#ff7b00' 
  },
  { 
    id: 'respect', 
    emoji: String.fromCharCode(0xD83D, 0xDC9A), // ??
    label: 'Respect', 
    color: '#00c46b' 
  },
  { 
    id: 'relate', 
    emoji: String.fromCharCode(0xD83C, 0xDF3F), // ??
    label: 'Relate', 
    color: '#4db8ff' 
  },
  { 
    id: 'support', 
    emoji: String.fromCharCode(0x26A1), // ?
    label: 'Support', 
    color: '#a259ff' 
  },
  { 
    id: 'celebrate', 
    emoji: String.fromCharCode(0x2728), // ?
    label: 'Celebrate', 
    color: '#ffd700' 
  },
];

export interface PostReactionsProps {
  postId: number;
  initialCounts?: Record<ReactionType, number>;
  initialSelected?: ReactionType | null;
  onReactionChange?: (reaction: ReactionType | null, counts: Record<ReactionType, number>) => void;
}

export default function PostReactions({
  postId,
  initialCounts = {
    inspire: 0,
    respect: 0,
    relate: 0,
    support: 0,
    celebrate: 0,
  },
  initialSelected = null,
  onReactionChange,
}: PostReactionsProps) {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  
  const [selectedReaction, setSelectedReaction] = useState<ReactionType | null>(initialSelected);
  const [counts, setCounts] = useState<Record<ReactionType, number>>(initialCounts);
  const [popAnimation, setPopAnimation] = useState<ReactionType | null>(null);

  // Sync with props when they change
  useEffect(() => {
    setSelectedReaction(initialSelected);
  }, [initialSelected]);

  useEffect(() => {
    // Only update if counts actually changed
    const countsChanged = Object.keys(initialCounts).some(
      (key) => counts[key as ReactionType] !== initialCounts[key as ReactionType]
    );
    if (countsChanged) {
      setCounts(initialCounts);
    }
  }, [initialCounts]);

  const handleReactionClick = (reactionId: ReactionType) => {
    const wasSelected = selectedReaction === reactionId;
    const newSelected = wasSelected ? null : reactionId;
    
    setSelectedReaction(newSelected);
    
    // Update counts
    const newCounts = { ...counts };
    if (wasSelected) {
      // Deselecting: decrease count
      newCounts[reactionId] = Math.max(0, newCounts[reactionId] - 1);
    } else {
      // Selecting: if another was selected, decrease it first
      if (selectedReaction) {
        newCounts[selectedReaction] = Math.max(0, newCounts[selectedReaction] - 1);
      }
      // Increase new selection
      newCounts[reactionId] = (newCounts[reactionId] || 0) + 1;
    }
    
    setCounts(newCounts);
    
    // Trigger pop animation
    setPopAnimation(reactionId);
    setTimeout(() => setPopAnimation(null), 200);
    
    // Callback
    if (onReactionChange) {
      onReactionChange(newSelected, newCounts);
    }
  };

  return (
    <div className={`${isLight ? 'bg-white/10' : 'bg-gray-900/10'} rounded-lg p-1 md:p-1.5 backdrop-blur-sm`}>
      {/* Desktop: horizontal row, Mobile: grid 2 columns */}
      <div className="flex flex-row items-center justify-center gap-1 md:gap-2">
        {REACTIONS.map((reaction) => {
          const isSelected = selectedReaction === reaction.id;
          const count = counts[reaction.id] || 0;
          const isPopping = popAnimation === reaction.id;

          return (
            <motion.button
              key={reaction.id}
              onClick={() => handleReactionClick(reaction.id)}
              whileHover={{ 
                scale: 1.1, 
                y: -2,
                transition: { duration: 0.2, ease: 'easeOut' }
              }}
              whileTap={{ scale: 1.0 }}
              animate={
                isPopping
                  ? {
                      scale: [1, 1.2, 1],
                      transition: { duration: 0.2, ease: 'easeOut' },
                    }
                  : {}
              }
              className={`
                relative flex items-center justify-center gap-1 md:gap-1.5 px-1.5 md:px-2 py-1 md:py-1.5 rounded-lg
                transition-all duration-200 ease-out
                ${isSelected 
                  ? 'shadow-lg' 
                  : 'shadow-sm hover:shadow-md'
                }
                border-0
              `}
              style={{
                backgroundColor: isSelected 
                  ? `${reaction.color}20` 
                  : isLight 
                    ? 'rgba(255, 255, 255, 0.05)'
                    : 'rgba(17, 24, 39, 0.05)',
                boxShadow: isSelected 
                  ? `0 4px 12px ${reaction.color}30, 0 2px 4px ${reaction.color}20`
                  : undefined,
              }}
            >
              <span 
                className="text-base md:text-lg leading-none select-none inline-flex items-center justify-center" 
                role="img" 
                aria-label={reaction.label}
                style={{ 
                  fontSize: '1rem',
                  minWidth: '1.25rem',
                  minHeight: '1.25rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontVariant: 'normal',
                  textRendering: 'optimizeLegibility'
                }}
              >
                <span style={{ fontSize: 'inherit', lineHeight: '1', display: 'block' }}>{reaction.emoji}</span>
              </span>
              <span className={`text-xs font-medium hidden sm:inline ${isLight ? 'text-gray-900' : 'text-white/90'}`}>
                {reaction.label}
              </span>
              
              <AnimatePresence mode="wait">
                <motion.span
                  key={count}
                  initial={{ scale: 1.3, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.7, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className={`text-xs font-medium ml-0.5 ${
                    isLight ? 'text-gray-700' : 'text-white/70'
                  }`}
                >
                  {count}
                </motion.span>
              </AnimatePresence>

              {/* Glow effect when selected */}
              {isSelected && (
                <motion.div
                  className="absolute inset-0 rounded-xl pointer-events-none"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.4 }}
                  exit={{ opacity: 0 }}
                  style={{
                    boxShadow: `0 0 16px ${reaction.color}50, 0 0 32px ${reaction.color}30`,
                  }}
                />
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
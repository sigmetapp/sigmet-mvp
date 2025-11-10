'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from './ThemeProvider';

export type ReactionType = 'inspire' | 'respect' | 'relate' | 'support' | 'celebrate';

export interface Reaction {
  id: ReactionType;
  emoji: string;
  label: string;
  color: string;
}

// Only show inspire reaction (fire emoji 🔥)
const FIRE_REACTION: Reaction = {
  id: 'inspire',
  emoji: String.fromCharCode(0xD83D, 0xDD25), // 🔥
  label: '',
  color: '#ff7b00'
};

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
  
  // Sum all reactions into inspire
  const totalInspireCount = useMemo(() => {
    return (initialCounts.inspire || 0) + 
           (initialCounts.respect || 0) + 
           (initialCounts.relate || 0) + 
           (initialCounts.support || 0) + 
           (initialCounts.celebrate || 0);
  }, [initialCounts]);
  
  const [selectedReaction, setSelectedReaction] = useState<ReactionType | null>(
    initialSelected === 'inspire' ? 'inspire' : 
    (initialSelected ? 'inspire' : null)
  );
  const [count, setCount] = useState<number>(totalInspireCount);
  const [popAnimation, setPopAnimation] = useState<boolean>(false);

  // Sync with props when they change
  useEffect(() => {
    setSelectedReaction(initialSelected === 'inspire' ? 'inspire' : (initialSelected ? 'inspire' : null));
  }, [initialSelected]);

  useEffect(() => {
    setCount(totalInspireCount);
  }, [totalInspireCount]);

  const handleReactionClick = () => {
    const wasSelected = selectedReaction === 'inspire';
    const newSelected = wasSelected ? null : 'inspire';
    
    setSelectedReaction(newSelected);
    
    // Update count
    const newCount = wasSelected ? Math.max(0, count - 1) : count + 1;
    setCount(newCount);
    
    // Trigger pop animation
    setPopAnimation(true);
    setTimeout(() => setPopAnimation(false), 200);
    
    // Callback - return counts with only inspire
    if (onReactionChange) {
      const newCounts: Record<ReactionType, number> = {
        inspire: newCount,
        respect: 0,
        relate: 0,
        support: 0,
        celebrate: 0,
      };
      onReactionChange(newSelected, newCounts);
    }
  };

  const isSelected = selectedReaction === 'inspire';
  const reaction = FIRE_REACTION;

  return (
    <div className={`${isLight ? 'bg-white/10' : 'bg-gray-900/10'} rounded-lg p-1 md:p-1.5 backdrop-blur-sm`}>
      <div className="flex flex-row items-center justify-center gap-1 md:gap-2">
        <motion.button
          onClick={handleReactionClick}
          data-prevent-card-navigation="true"
          whileHover={{ 
            scale: 1.1, 
            y: -2,
            transition: { duration: 0.2, ease: 'easeOut' }
          }}
          whileTap={{ scale: 1.0 }}
          animate={
            popAnimation
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
                ? 'rgba(0, 0, 0, 0.15)'
                : 'rgba(255, 255, 255, 0.3)',
            boxShadow: isSelected 
              ? `0 4px 12px ${reaction.color}30, 0 2px 4px ${reaction.color}20`
              : undefined,
          }}
        >
          <span 
            className={`text-base md:text-lg leading-none select-none inline-flex items-center justify-center transition-all duration-200 ${
              isSelected ? 'opacity-100' : isLight ? 'opacity-50' : 'opacity-70'
            }`}
            role="img" 
            aria-label="Fire reaction"
            style={{ 
              fontSize: '1rem',
              minWidth: '1.25rem',
              minHeight: '1.25rem',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontVariant: 'normal',
              textRendering: 'optimizeLegibility',
              filter: isSelected ? 'none' : isLight ? 'grayscale(40%) brightness(0.8)' : 'grayscale(20%) brightness(1.2)',
            }}
          >
            <span style={{ fontSize: 'inherit', lineHeight: '1', display: 'block' }}>{reaction.emoji}</span>
          </span>
          
          {count > 0 && (
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
          )}

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
      </div>
    </div>
  );
}
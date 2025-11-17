'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from './ThemeProvider';

export type ReactionType = 'inspire' | 'respect' | 'relate' | 'support' | 'celebrate' | 'verify';

export interface Reaction {
  id: ReactionType;
  emoji: string;
  label: string;
  color: string;
}

// Reactions to show: inspire (fire) and verify (checkmark)
const FIRE_REACTION: Reaction = {
  id: 'inspire',
  emoji: String.fromCharCode(0xD83D, 0xDD25), // 🔥
  label: '',
  color: '#ff7b00'
};

const VERIFY_REACTION: Reaction = {
  id: 'verify',
  emoji: String.fromCharCode(0x2705), // ✅
  label: '',
  color: '#10b981'
};

export interface PostReactionsProps {
  postId: number;
  initialCounts?: Record<ReactionType, number>;
  initialSelected?: ReactionType | null;
  onReactionChange?: (reaction: ReactionType | null, counts: Record<ReactionType, number>) => void;
  showVerify?: boolean; // Option to show verify reaction
}

export default function PostReactions({
  postId,
  initialCounts = {
    inspire: 0,
    respect: 0,
    relate: 0,
    support: 0,
    celebrate: 0,
    verify: 0,
  },
  initialSelected = null,
  onReactionChange,
  showVerify = true,
}: PostReactionsProps) {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  
  // Sum all reactions into inspire (except verify)
  const totalInspireCount = useMemo(() => {
    return (initialCounts.inspire || 0) + 
           (initialCounts.respect || 0) + 
           (initialCounts.relate || 0) + 
           (initialCounts.support || 0) + 
           (initialCounts.celebrate || 0);
  }, [initialCounts]);
  
  const verifyCount = initialCounts.verify || 0;
  
  const [selectedReaction, setSelectedReaction] = useState<ReactionType | null>(
    initialSelected === 'inspire' ? 'inspire' : 
    (initialSelected === 'verify' ? 'verify' :
    (initialSelected ? 'inspire' : null))
  );
  const [inspireCount, setInspireCount] = useState<number>(totalInspireCount);
  const [verifyCountState, setVerifyCountState] = useState<number>(verifyCount);
  const [popAnimation, setPopAnimation] = useState<string | null>(null);

  // Sync with props when they change
  useEffect(() => {
    if (initialSelected === 'inspire') {
      setSelectedReaction('inspire');
    } else if (initialSelected === 'verify') {
      setSelectedReaction('verify');
    } else if (initialSelected) {
      setSelectedReaction('inspire');
    } else {
      setSelectedReaction(null);
    }
  }, [initialSelected]);

  useEffect(() => {
    setInspireCount(totalInspireCount);
  }, [totalInspireCount]);

  useEffect(() => {
    setVerifyCountState(verifyCount);
  }, [verifyCount]);

  const handleReactionClick = (reactionType: 'inspire' | 'verify') => {
    const wasSelected = selectedReaction === reactionType;
    const newSelected = wasSelected ? null : reactionType;
    
    setSelectedReaction(newSelected);
    
    // Update count
    if (reactionType === 'inspire') {
      const newCount = wasSelected ? Math.max(0, inspireCount - 1) : inspireCount + 1;
      setInspireCount(newCount);
    } else {
      const newCount = wasSelected ? Math.max(0, verifyCountState - 1) : verifyCountState + 1;
      setVerifyCountState(newCount);
    }
    
    // Trigger pop animation
    setPopAnimation(reactionType);
    setTimeout(() => setPopAnimation(null), 200);
    
    // Callback
    if (onReactionChange) {
      const newCounts: Record<ReactionType, number> = {
        inspire: reactionType === 'inspire' ? (wasSelected ? Math.max(0, inspireCount - 1) : inspireCount + 1) : inspireCount,
        verify: reactionType === 'verify' ? (wasSelected ? Math.max(0, verifyCountState - 1) : verifyCountState + 1) : verifyCountState,
        respect: 0,
        relate: 0,
        support: 0,
        celebrate: 0,
      };
      onReactionChange(newSelected, newCounts);
    }
  };

  const renderReactionButton = (reaction: Reaction, count: number, isSelected: boolean, onClick: () => void) => {
    return (
      <motion.button
        onClick={onClick}
        data-prevent-card-navigation="true"
        whileHover={{ 
          scale: 1.08, 
          y: -3,
          transition: { duration: 0.15, ease: [0.4, 0, 0.2, 1] }
        }}
        whileTap={{ scale: 0.95 }}
        animate={
          popAnimation === reaction.id
            ? {
                scale: [1, 1.25, 1],
                transition: { duration: 0.25, ease: [0.4, 0, 0.2, 1] },
              }
            : {}
        }
        className={`
          relative flex items-center justify-center gap-1.5 md:gap-2 px-2 md:px-2.5 py-1.5 md:py-2 rounded-xl
          transition-all duration-300 ease-out
          ${isSelected 
            ? 'shadow-2xl' 
            : 'shadow-md hover:shadow-xl'
          }
          border-0 overflow-hidden
        `}
        style={{
          background: isSelected 
            ? `linear-gradient(135deg, ${reaction.color}25, ${reaction.color}15)` 
            : isLight 
              ? 'linear-gradient(135deg, rgba(0, 0, 0, 0.2), rgba(0, 0, 0, 0.1))'
              : 'linear-gradient(135deg, rgba(255, 255, 255, 0.4), rgba(255, 255, 255, 0.2))',
          boxShadow: isSelected 
            ? `0 8px 24px ${reaction.color}40, 0 4px 8px ${reaction.color}30, inset 0 1px 0 ${reaction.color}20`
            : isLight
              ? '0 4px 12px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.08)'
              : '0 4px 12px rgba(255, 255, 255, 0.15), 0 2px 4px rgba(255, 255, 255, 0.1)',
        }}
      >
        <span 
          className={`${reaction.id === 'verify' ? 'text-sm md:text-base' : 'text-base md:text-lg'} leading-none select-none inline-flex items-center justify-center transition-all duration-200 ${
            isSelected ? 'opacity-100' : isLight ? 'opacity-50' : 'opacity-70'
          }`}
          role="img" 
          aria-label={`${reaction.id} reaction`}
          style={{ 
            fontSize: reaction.id === 'verify' ? '0.75rem' : '1rem',
            minWidth: reaction.id === 'verify' ? '1rem' : '1.25rem',
            minHeight: reaction.id === 'verify' ? '1rem' : '1.25rem',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontVariant: 'normal',
            textRendering: 'optimizeLegibility',
            filter: isSelected 
              ? 'none' 
              : isLight 
                ? 'grayscale(40%) brightness(0.8)' 
                : 'grayscale(100%) brightness(1.5)',
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

        {/* Animated glow effect when selected */}
        {isSelected && (
          <>
            <motion.div
              className="absolute inset-0 rounded-xl pointer-events-none"
              initial={{ opacity: 0 }}
              animate={{ 
                opacity: [0.3, 0.6, 0.3],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut"
              }}
              style={{
                background: `radial-gradient(circle at center, ${reaction.color}40, transparent 70%)`,
              }}
            />
            <motion.div
              className="absolute inset-0 rounded-xl pointer-events-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              style={{
                boxShadow: `0 0 20px ${reaction.color}60, 0 0 40px ${reaction.color}40, 0 0 60px ${reaction.color}20`,
              }}
            />
          </>
        )}
      </motion.button>
    );
  };

  return (
    <div className="flex flex-row items-center justify-center gap-2">
      {renderReactionButton(
        FIRE_REACTION,
        inspireCount,
        selectedReaction === 'inspire',
        () => handleReactionClick('inspire')
      )}
      {showVerify && renderReactionButton(
        VERIFY_REACTION,
        verifyCountState,
        selectedReaction === 'verify',
        () => handleReactionClick('verify')
      )}
    </div>
  );
}
'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from './ThemeProvider';
import { supabase } from '@/lib/supabaseClient';

export type GoalReactionType = 'inspire';

export interface GoalReaction {
  id: GoalReactionType;
  emoji: string;
  label: string;
  color: string;
}

// Only show inspire reaction (fire emoji 🔥) for goals
const FIRE_REACTION: GoalReaction = {
  id: 'inspire',
  emoji: String.fromCharCode(0xD83D, 0xDD25), // 🔥
  label: '',
  color: '#ff7b00'
};

export interface GoalReactionsProps {
  goalUserId: string; // User who owns the goal
  goalId: string; // ID of the goal from the JSONB array
  initialCount?: number;
  initialSelected?: boolean;
  onReactionChange?: (selected: boolean, count: number) => void;
}

export default function GoalReactions({
  goalUserId,
  goalId,
  initialCount = 0,
  initialSelected = false,
  onReactionChange,
}: GoalReactionsProps) {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  
  const [selected, setSelected] = useState<boolean>(initialSelected);
  const [count, setCount] = useState<number>(initialCount);
  const [popAnimation, setPopAnimation] = useState<boolean>(false);
  const [loading, setLoading] = useState(false);

  // Sync with props when they change
  useEffect(() => {
    setSelected(initialSelected);
  }, [initialSelected]);

  useEffect(() => {
    setCount(initialCount);
  }, [initialCount]);

  const handleReactionClick = async () => {
    if (loading) return;
    
    const wasSelected = selected;
    const newSelected = !wasSelected;
    
    setSelected(newSelected);
    setLoading(true);
    
    // Update count optimistically
    const newCount = wasSelected ? Math.max(0, count - 1) : count + 1;
    setCount(newCount);
    
    // Trigger pop animation
    setPopAnimation(true);
    setTimeout(() => setPopAnimation(false), 200);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        // Revert on error
        setSelected(wasSelected);
        setCount(count);
        return;
      }

      if (wasSelected) {
        // Delete reaction
        const { error } = await supabase
          .from('goal_reactions')
          .delete()
          .eq('goal_user_id', goalUserId)
          .eq('goal_id', goalId)
          .eq('user_id', user.id)
          .eq('kind', 'inspire');
        
        if (error) {
          // Revert on error
          setSelected(wasSelected);
          setCount(count);
          console.error('Error deleting goal reaction:', error);
        }
      } else {
        // Insert reaction
        const { error } = await supabase
          .from('goal_reactions')
          .insert({
            goal_user_id: goalUserId,
            goal_id: goalId,
            user_id: user.id,
            kind: 'inspire',
          });
        
        if (error) {
          // Revert on error
          setSelected(wasSelected);
          setCount(count);
          console.error('Error inserting goal reaction:', error);
        }
      }
      
      // Callback
      if (onReactionChange) {
        onReactionChange(newSelected, newCount);
      }
    } catch (error) {
      // Revert on error
      setSelected(wasSelected);
      setCount(count);
      console.error('Error updating goal reaction:', error);
    } finally {
      setLoading(false);
    }
  };

  const isSelected = selected;
  const reaction = FIRE_REACTION;

  return (
    <div className="flex flex-row items-center justify-center">
      <motion.button
        onClick={handleReactionClick}
        disabled={loading}
        whileHover={!loading ? { 
          scale: 1.08, 
          y: -3,
          transition: { duration: 0.15, ease: [0.4, 0, 0.2, 1] }
        } : {}}
        whileTap={!loading ? { scale: 0.95 } : {}}
        animate={
          popAnimation
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
          ${loading ? 'opacity-50 cursor-not-allowed' : ''}
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
    </div>
  );
}

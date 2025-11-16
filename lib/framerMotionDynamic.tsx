import dynamic from 'next/dynamic';

// Dynamic imports for framer-motion to reduce initial bundle size
export const MotionDiv = dynamic(
  () => import('framer-motion').then((mod) => ({ default: mod.motion.div })),
  { ssr: false }
);

export const MotionSpan = dynamic(
  () => import('framer-motion').then((mod) => ({ default: mod.motion.span })),
  { ssr: false }
);

export const MotionButton = dynamic(
  () => import('framer-motion').then((mod) => ({ default: mod.motion.button })),
  { ssr: false }
);

export const AnimatePresence = dynamic(
  () => import('framer-motion').then((mod) => ({ default: mod.AnimatePresence })),
  { ssr: false }
);

// For components that need both motion and AnimatePresence
export const getFramerMotion = () => {
  return import('framer-motion');
};

// Utility functions for SW levels and badge colors

export type SWLevel = {
  name: string;
  minSW: number;
  maxSW?: number;
  features: string[];
  color: string;
};

export type LevelColorScheme = {
  text: string;
  bg: string;
  bgGradient: string;
  border: string;
  borderGlow: string;
  badgeBg: string;
  badgeBorder: string;
  checkmark: string;
  hex: string;
};

export const LEVEL_COLOR_SCHEMES: Record<string, LevelColorScheme> = {
  'Beginner': {
    text: 'text-gray-400',
    bg: 'bg-gray-500/10',
    bgGradient: 'from-gray-500/15 to-gray-600/10',
    border: 'border-gray-400/30',
    borderGlow: 'shadow-[0_0_8px_rgba(156,163,175,0.3)]',
    badgeBg: 'bg-gray-500/20',
    badgeBorder: 'border-gray-400/40',
    checkmark: 'text-gray-400',
    hex: '#9ca3af'
  },
  'Growing': {
    text: 'text-blue-400',
    bg: 'bg-blue-500/10',
    bgGradient: 'from-blue-500/15 to-blue-600/10',
    border: 'border-blue-400/30',
    borderGlow: 'shadow-[0_0_8px_rgba(96,165,250,0.3)]',
    badgeBg: 'bg-blue-500/20',
    badgeBorder: 'border-blue-400/40',
    checkmark: 'text-blue-400',
    hex: '#60a5fa'
  },
  'Advance': {
    text: 'text-purple-400',
    bg: 'bg-purple-500/10',
    bgGradient: 'from-purple-500/15 to-purple-600/10',
    border: 'border-purple-400/30',
    borderGlow: 'shadow-[0_0_8px_rgba(167,139,250,0.3)]',
    badgeBg: 'bg-purple-500/20',
    badgeBorder: 'border-purple-400/40',
    checkmark: 'text-purple-400',
    hex: '#a78bfa'
  },
  'Expert': {
    text: 'text-yellow-400',
    bg: 'bg-yellow-500/10',
    bgGradient: 'from-yellow-500/15 to-yellow-600/10',
    border: 'border-yellow-400/30',
    borderGlow: 'shadow-[0_0_8px_rgba(251,191,36,0.3)]',
    badgeBg: 'bg-yellow-500/20',
    badgeBorder: 'border-yellow-400/40',
    checkmark: 'text-yellow-400',
    hex: '#fbbf24'
  },
  'Leader': {
    text: 'text-orange-400',
    bg: 'bg-orange-500/10',
    bgGradient: 'from-orange-500/15 to-orange-600/10',
    border: 'border-orange-400/30',
    borderGlow: 'shadow-[0_0_8px_rgba(251,146,60,0.3)]',
    badgeBg: 'bg-orange-500/20',
    badgeBorder: 'border-orange-400/40',
    checkmark: 'text-orange-400',
    hex: '#fb923c'
  },
  'Angel': {
    text: 'text-pink-400',
    bg: 'bg-pink-500/10',
    bgGradient: 'from-pink-500/15 to-pink-600/10',
    border: 'border-pink-400/30',
    borderGlow: 'shadow-[0_0_8px_rgba(244,114,182,0.3)]',
    badgeBg: 'bg-pink-500/20',
    badgeBorder: 'border-pink-400/40',
    checkmark: 'text-pink-400',
    hex: '#f472b6'
  }
};

export const SW_LEVELS: SWLevel[] = [
  {
    name: 'Beginner',
    minSW: 0,
    maxSW: 100,
    features: [
      'View feed',
      'Post to feed',
      'Comment on materials',
      'Followers'
    ],
    color: 'text-gray-400'
  },
  {
    name: 'Growing',
    minSW: 100,
    maxSW: 1250,
    features: [
      'Grow 8 panel',
      'Badge near nickname / Avatar frame',
      'Partial moderation of posts and comments',
      'Access to Trust Flow functionality',
      'White theme',
      'Connections functionality'
    ],
    color: 'text-blue-400'
  },
  {
    name: 'Advance',
    minSW: 1251,
    maxSW: 6250,
    features: [
      'Create more than 20 posts per day',
      'Increased ranking priority (x2)',
      'Badge near nickname / Avatar frame',
      'Voting and challenges functionality',
      'Post and comment moderation'
    ],
    color: 'text-purple-400'
  },
  {
    name: 'Expert',
    minSW: 6251,
    maxSW: 10000,
    features: [
      'Increased ranking priority (x3)',
      'Badge near nickname / Avatar frame',
      'Display profile to followers and connections in separate block at top',
      'Soon....',
      'Soon....'
    ],
    color: 'text-yellow-400'
  },
  {
    name: 'Leader',
    minSW: 10000,
    maxSW: 50000,
    features: [
      'Increased ranking priority (x4)',
      'Badge near nickname / Avatar frame',
      'Soon....',
      'Soon....',
      'Soon....'
    ],
    color: 'text-orange-400'
  },
  {
    name: 'Angel',
    minSW: 50000,
    maxSW: undefined,
    features: [
      'Increased ranking priority (x5)',
      'Badge near nickname / Avatar frame',
      'Soon....',
      'Soon....',
      'Soon....'
    ],
    color: 'text-pink-400'
  }
];

export function getSWLevel(sw: number, levels: SWLevel[] = SW_LEVELS): SWLevel {
  for (let i = levels.length - 1; i >= 0; i--) {
    if (sw >= levels[i].minSW) {
      return levels[i];
    }
  }
  return levels[0];
}

export function getLevelColorScheme(levelName: string): LevelColorScheme | null {
  return LEVEL_COLOR_SCHEMES[levelName] || null;
}

export function shouldShowBadge(sw: number, levels: SWLevel[] = SW_LEVELS): boolean {
  const level = getSWLevel(sw, levels);
  // Show badge for Growing and above
  return level.name !== 'Beginner';
}

export function getBadgeColor(sw: number, levels: SWLevel[] = SW_LEVELS): string | null {
  const level = getSWLevel(sw, levels);
  const colorScheme = getLevelColorScheme(level.name);
  return colorScheme?.hex || null;
}

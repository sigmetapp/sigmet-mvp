export const DIRECTION_EMOJI_MAP: Record<string, string> = {
  learning: '??', // ??
  career: '??', // ??
  finance: '??', // ??
  health: '??', // ??
  relationships: '??', // ??
  community: '??', // ??
  creativity: '??', // ??
  mindfulness: '??', // ??
  mindfulness_purpose: '?', // ?
  purpose: '??', // ??
  personal: '??', // ??
  digital: '??', // ??
  education: '??', // ??
};

export const FALLBACK_DIRECTION_EMOJI = '?';

export const isLikelyValidEmoji = (value?: string | null) => {
  if (!value) return false;
  if (value.includes('?')) return false;
  if (value.includes('\\\\')) return false;
  if (value.startsWith('U&')) return false;
  return true;
};

export const resolveDirectionEmoji = (slug: string, emoji?: string | null) => {
  if (isLikelyValidEmoji(emoji)) {
    return emoji as string;
  }
  return DIRECTION_EMOJI_MAP[slug] ?? FALLBACK_DIRECTION_EMOJI;
};

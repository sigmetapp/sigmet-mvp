export const DIRECTION_EMOJI_MAP: Record<string, string> = {
  learning: '\u{1F4DA}', // ??
  career: '\u{1F4BC}', // ??
  finance: '\u{1F4B0}', // ??
  health: '\u{1F4AA}', // ??
  relationships: '\u{1F496}', // ??
  community: '\u{1F30D}', // ??
  creativity: '\u{1F3A8}', // ??
  mindfulness: '\u{1F9D8}', // ??
  mindfulness_purpose: '\u{2728}', // ?
  purpose: '\u{1F9ED}', // ??
  personal: '\u{1F331}', // ??
  digital: '\u{1F4BB}', // ??
  education: '\u{1F393}', // ??
};

export const FALLBACK_DIRECTION_EMOJI = '\u2728';

export const isLikelyValidEmoji = (value?: string | null) => {
  if (!value) return false;
  if (value.includes('?')) return false;
  if (value.includes('\\')) return false;
  if (value.startsWith('U&')) return false;
  return true;
};

export const resolveDirectionEmoji = (slug: string, emoji?: string | null) => {
  if (isLikelyValidEmoji(emoji)) {
    return emoji as string;
  }
  return DIRECTION_EMOJI_MAP[slug] ?? FALLBACK_DIRECTION_EMOJI;
};

// Emoji map for 8 directions using proper Unicode
export const DIRECTION_EMOJI_MAP: Record<string, string> = {
  learning: String.fromCodePoint(0x1F4DA), // ??
  career: String.fromCodePoint(0x1F4BC), // ??
  finance: String.fromCodePoint(0x1F4B0), // ??
  health: String.fromCodePoint(0x1F4AA), // ??
  relationships: String.fromCodePoint(0x1F496), // ??
  community: String.fromCodePoint(0x1F30D), // ??
  creativity: String.fromCodePoint(0x1F3A8), // ??
  mindfulness: String.fromCodePoint(0x1F9D8), // ??
  mindfulness_purpose: String.fromCodePoint(0x2728), // ?
  purpose: String.fromCodePoint(0x1F9ED), // ??
  personal: String.fromCodePoint(0x1F331), // ??
  digital: String.fromCodePoint(0x1F4BB), // ??
  education: String.fromCodePoint(0x1F393), // ??
};

export const FALLBACK_DIRECTION_EMOJI = String.fromCodePoint(0x2728); // ?

// Check if emoji from database is valid (not corrupted or placeholder)
export const isLikelyValidEmoji = (value?: string | null) => {
  if (!value) return false;
  // Check for placeholder characters that indicate corruption
  if (value.includes('?')) return false;
  if (value.includes('\\\\')) return false;
  if (value.startsWith('U&')) return false;
  // Check if it's a valid emoji character (basic check)
  // Emojis are typically multi-byte UTF-8 characters
  try {
    // Simple check: if it's a valid string and has length > 0
    // and doesn't look like an error message
    if (value.length === 0) return false;
    // Check if it contains common error indicators
    if (value.toLowerCase().includes('error') || 
        value.toLowerCase().includes('null') ||
        value.toLowerCase().includes('undefined')) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
};

export const resolveDirectionEmoji = (slug: string, emoji?: string | null) => {
  // First try to use emoji from database if it's valid
  if (isLikelyValidEmoji(emoji)) {
    return emoji as string;
  }
  // Fallback to map based on slug
  return DIRECTION_EMOJI_MAP[slug] ?? FALLBACK_DIRECTION_EMOJI;
};

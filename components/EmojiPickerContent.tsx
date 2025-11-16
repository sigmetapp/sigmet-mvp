'use client';

import { useCallback } from 'react';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';

const EMOJI_TWO_CDN_BASE = 'https://cdn.jsdelivr.net/gh/EmojiTwo/emojitwo@master/png';

type EmojiPickerContentProps = {
  onEmojiSelect: (native: string) => void;
  theme: 'light' | 'dark';
  onClose: () => void;
};

function extractNativeFromEmoji(emoji: any): string | null {
  if (!emoji) return null;
  if (typeof emoji.native === 'string' && emoji.native.length > 0) {
    return emoji.native;
  }
  if (typeof emoji.unified === 'string' && emoji.unified.length > 0) {
    try {
      return emoji.unified
        .split('-')
        .map((code: string) => String.fromCodePoint(parseInt(code, 16)))
        .join('');
    } catch (error) {
      console.warn('Failed to convert emoji unified code to native representation', error);
    }
  }
  return null;
}

export default function EmojiPickerContent({
  onEmojiSelect,
  theme,
  onClose,
}: EmojiPickerContentProps) {
  const getEmojiImageUrl = useCallback((_, unified?: string) => {
    if (!unified) {
      return undefined;
    }
    return `${EMOJI_TWO_CDN_BASE}/${unified.toLowerCase()}.png`;
  }, []);

  const handleSelect = useCallback(
    (emoji: any) => {
      const native = extractNativeFromEmoji(emoji);
      if (native) {
        onEmojiSelect(native);
        onClose();
      }
    },
    [onEmojiSelect, onClose],
  );

  return (
    <Picker
      data={data}
      set="emojitwo"
      theme={theme}
      onEmojiSelect={handleSelect}
      previewPosition="none"
      skinTonePosition="none"
      navPosition="top"
      searchPosition="top"
      perLine={8}
      autoFocus
      getImageURL={getEmojiImageUrl}
    />
  );
}

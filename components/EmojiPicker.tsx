'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';
import { Smile } from 'lucide-react';

type Props = {
  onEmojiSelect: (emoji: string) => void;
  variant?: 'light' | 'dark';
  align?: 'left' | 'right';
};

const VARIANT_STYLES: Record<NonNullable<Props['variant']>, string> = {
  light:
    'border border-telegram-blue/30 text-telegram-blue bg-white/70 hover:bg-white transition-colors shadow-sm',
  dark:
    'border border-white/15 text-white/90 bg-white/5 hover:bg-white/10 transition-colors',
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

export default function EmojiPicker({
  onEmojiSelect,
  variant = 'dark',
  align = 'right',
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [, setRecentEmojis] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('recentEmojis') : null;
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        setRecentEmojis(parsed.filter((item): item is string => typeof item === 'string'));
      }
    } catch (error) {
      console.warn('Failed to parse recent emojis from localStorage', error);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen]);

  const pickerTheme = useMemo(() => (variant === 'light' ? 'light' : 'dark'), [variant]);

  const handleSelect = useCallback(
    (emoji: any) => {
      const native = extractNativeFromEmoji(emoji);
      if (!native) {
        return;
      }

      onEmojiSelect(native);
      setIsOpen(false);
      setRecentEmojis((prev) => {
        const withoutDuplicate = prev.filter((item) => item !== native);
        const updated = [native, ...withoutDuplicate].slice(0, 20);
        if (typeof window !== 'undefined') {
          localStorage.setItem('recentEmojis', JSON.stringify(updated));
        }
        return updated;
      });
    },
    [onEmojiSelect],
  );

  const triggerClasses = VARIANT_STYLES[variant];
  const alignmentClasses = align === 'left' ? 'left-0' : 'right-0';

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`h-10 w-10 rounded-2xl flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-telegram-blue/40 ${triggerClasses}`}
        title="Add emoji"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        <Smile className="h-5 w-5" aria-hidden="true" />
        <span className="sr-only">Insert emoji</span>
      </button>

      {isOpen && (
        <div
          className={`absolute z-50 mt-2 ${alignmentClasses}`}
          role="dialog"
          aria-label="Emoji picker"
        >
          <Picker
            data={data}
            set="twitter"
            theme={pickerTheme}
            onEmojiSelect={handleSelect}
            previewPosition="none"
            skinTonePosition="none"
            navPosition="top"
            searchPosition="top"
            perLine={8}
            autoFocus
          />
        </div>
      )}
    </div>
  );
}

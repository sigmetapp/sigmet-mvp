'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Smile } from 'lucide-react';

const EmojiPickerContent = dynamic(() => import('./EmojiPickerContent'), {
  ssr: false,
  loading: () => (
    <div className="w-[352px] h-[435px] bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center">
      <div className="text-gray-400 dark:text-gray-500">Loading emoji picker...</div>
    </div>
  ),
});

type Props = {
  onEmojiSelect: (emoji: string) => void;
  variant?: 'light' | 'dark';
  align?: 'left' | 'right';
  position?: 'top' | 'bottom';
};

const VARIANT_STYLES: Record<NonNullable<Props['variant']>, string> = {
  light:
    'border border-primary-blue/30 text-primary-blue bg-white/70 hover:bg-white transition-colors shadow-sm',
  dark:
    'border border-white/15 text-white/90 bg-white/5 hover:bg-white/10 transition-colors',
};

export default function EmojiPicker({
  onEmojiSelect,
  variant = 'dark',
  align = 'right',
  position = 'bottom',
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [, setRecentEmojis] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

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

  const handleEmojiSelect = (native: string) => {
    onEmojiSelect(native);
    setRecentEmojis((prev) => {
      const withoutDuplicate = prev.filter((item) => item !== native);
      const updated = [native, ...withoutDuplicate].slice(0, 20);
      if (typeof window !== 'undefined') {
        localStorage.setItem('recentEmojis', JSON.stringify(updated));
      }
      return updated;
    });
  };

  const triggerClasses = VARIANT_STYLES[variant];
  const alignmentClasses = align === 'left' ? 'left-0' : 'right-0';
  const positionClasses = position === 'top' ? 'bottom-full mb-2' : 'mt-2';

  // Hide emoji picker on mobile devices
  if (isMobile) {
    return null;
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`h-10 w-10 rounded-2xl flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary-blue/40 ${triggerClasses}`}
        title="Add emoji"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        <Smile className="h-5 w-5" aria-hidden="true" />
        <span className="sr-only">Insert emoji</span>
      </button>

      {isOpen && (
        <div
          className={`absolute z-[10000] ${positionClasses} ${alignmentClasses}`}
          role="dialog"
          aria-label="Emoji picker"
        >
          <EmojiPickerContent
            onEmojiSelect={handleEmojiSelect}
            theme={pickerTheme}
            onClose={() => setIsOpen(false)}
          />
        </div>
      )}
    </div>
  );
}

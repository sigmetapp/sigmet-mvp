'use client';

import { useState, useRef, useEffect } from 'react';

type Props = {
  onEmojiSelect: (emoji: string) => void;
};

const EMOJI_CATEGORIES = [
  { name: 'Recently Used', emojis: [] },
  {
    name: 'Smileys',
    emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓'],
  },
  {
    name: 'Gestures',
    emojis: ['👋', '🤚', '🖐', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏'],
  },
  {
    name: 'People',
    emojis: ['👶', '🧒', '👦', '👧', '🧑', '👱', '👨', '🧔', '👨‍🦰', '👨‍🦱', '👨‍🦳', '👨‍🦲', '👩', '👩‍🦰', '🧑‍🦰', '👩‍🦱', '🧑‍🦱', '👩‍🦳', '🧑‍🦳', '👩‍🦲', '🧑‍🦲', '👱‍♀️', '👱‍♂️', '🧓', '👴', '👵'],
  },
  {
    name: 'Objects',
    emojis: ['⌚', '📱', '💻', '⌨️', '🖥', '🖨', '🖱', '🖲', '🕹', '🗜', '💾', '💿', '📷', '📸', '📹', '🎥', '📽', '🎞', '📞', '☎️', '📟', '📠', '📺', '📻', '🎙', '🎚', '🎛', '⏱', '⏲', '⏰', '🕰', '⌛', '⏳', '📡'],
  },
  {
    name: 'Symbols',
    emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️', '✝️', '☪️', '🕉', '☸️', '✡️', '🔯', '🕎', '☯️', '☦️', '🛐', '⛎', '♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓', '🆔', '⚛️', '🉑', '☢️', '☣️', '📴', '📳', '🈶', '🈚', '🈸', '🈺', '🈷️'],
  },
];

export default function EmojiPicker({ onEmojiSelect }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [recentEmojis, setRecentEmojis] = useState<string[]>([]);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load recent emojis from localStorage
    const saved = localStorage.getItem('recentEmojis');
    if (saved) {
      try {
        setRecentEmojis(JSON.parse(saved));
      } catch {
        setRecentEmojis([]);
      }
    }
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleEmojiClick = (emoji: string) => {
    onEmojiSelect(emoji);
    // Add to recent emojis
    const updated = [emoji, ...recentEmojis.filter((e) => e !== emoji)].slice(0, 10);
    setRecentEmojis(updated);
    localStorage.setItem('recentEmojis', JSON.stringify(updated));
    setIsOpen(false);
  };

  const allCategories = [
    ...(recentEmojis.length > 0 ? [{ name: 'Recently Used', emojis: recentEmojis }] : []),
    ...EMOJI_CATEGORIES.slice(1),
  ];

  return (
    <div className="relative" ref={pickerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="px-2 py-1 rounded-xl text-white/80 hover:bg-white/10 text-lg"
        title="Add emoji"
      >
        😊
      </button>

      {isOpen && (
        <div className="absolute bottom-full right-0 mb-2 w-80 h-80 bg-[#0f1628] border border-white/20 rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-y-auto p-3">
            {allCategories.map((category) => (
              <div key={category.name} className="mb-4">
                <div className="text-xs text-white/60 font-medium mb-2 px-1">
                  {category.name}
                </div>
                <div className="grid grid-cols-8 gap-1">
                  {category.emojis.map((emoji, idx) => (
                    <button
                      key={`${category.name}-${idx}`}
                      type="button"
                      onClick={() => handleEmojiClick(emoji)}
                      className="w-8 h-8 flex items-center justify-center text-lg hover:bg-white/10 rounded-lg transition"
                      title={emoji}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-white/10 px-3 py-2">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-xs text-white/60 hover:text-white/80"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

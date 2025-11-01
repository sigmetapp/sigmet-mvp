'use client';

import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Props = {
  onEmojiSelect: (emoji: string) => void;
};

const EMOJI_CATEGORIES = [
  { name: 'Recently Used', emojis: [] },
  {
    name: 'Smileys & People',
    emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐', '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕'],
  },
  {
    name: 'Gestures & Body Parts',
    emojis: ['👋', '🤚', '🖐', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💪', '🦾', '🦿', '🦵', '🦶', '👂', '🦻', '👃', '🧠', '🫀', '🫁', '🦷', '🦴', '👀', '👁', '👅', '👄'],
  },
  {
    name: 'Objects',
    emojis: ['⌚', '📱', '💻', '⌨️', '🖥', '🖨', '🖱', '🖲', '🕹', '🗜', '💾', '💿', '📷', '📸', '📹', '🎥', '📽', '🎞', '📞', '☎️', '📟', '📠', '📺', '📻', '🎙', '🎚', '🎛', '⏱', '⏲', '⏰', '🕰', '⌛', '⏳', '📡', '🔋', '🔌', '💡', '🔦', '🕯', '🪔', '🧯', '🛢', '💸', '💵', '💴', '💶', '💷', '💳', '💎', '⚖️', '🧰', '🪓', '🪛', '🔧', '🔨', '⚒', '🛠', '⚙️', '🪚', '🔩', '⚙️', '📐', '📏', '📌', '📍', '📎', '🖇', '📏', '✂️', '🗂', '📁', '📂', '🗂', '🗃', '📅', '📆', '🗓', '📇', '🗃', '🗳', '🗄', '📋', '📊', '📈', '📉', '📊', '📜', '📃', '📑', '🗞', '📰', '🗞', '📄', '📃', '📑', '📜', '📄'],
  },
  {
    name: 'Symbols',
    emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️', '✝️', '☪️', '🕉', '☸️', '✡️', '🔯', '🕎', '☯️', '☦️', '🛐', '⛎', '♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓', '🆔', '⚛️', '🉑', '☢️', '☣️', '📴', '📳', '🈶', '🈚', '🈸', '🈺', '🈷️', '✴️', '🆚', '💮', '🉐', '㊙️', '㊗️', '🈴', '🈵', '🈹', '🈲', '🅰️', '🅱️', '🆎', '🆑', '🅾️', '🆘', '❌', '⭕', '🛑', '⛔', '📛', '🚫', '💯', '💢', '♨️', '🚷', '🚯', '🚳', '🚱', '🔞', '📵', '🚭', '❗', '❕', '❓', '❔', '‼️', '⁉️', '🔅', '🔆', '〽️', '⚠️', '🚸', '🔱', '⚜️', '🔰', '♻️', '✅', '🈯', '💹', '❇️', '✳️', '❎', '🌐', '💠', 'Ⓜ️', '🌀', '💤', '🏧', '🚾', '♿', '🅿️', '🈳', '🈂️', '🛂', '🛃', '🛄', '🛅', '🚹', '🚺', '🚼', '🚻', '🚮', '🎦', '📶', '🈁', '🔣', '🔤', '🔠', '🔡', '🔟', '🔢', '🔠', '🔣'],
  },
  {
    name: 'Nature',
    emojis: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐽', '🐸', '🐵', '🙈', '🙉', '🙊', '🐒', '🐔', '🐧', '🐦', '🐤', '🐣', '🐥', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐜', '🦟', '🦗', '🕷', '🦂', '🐢', '🐍', '🦎', '🦖', '🦕', '🐙', '🦑', '🦐', '🦞', '🦀', '🐡', '🐠', '🐟', '🐬', '🐳', '🐋', '🦈', '🐊', '🐅', '🐆', '🦓', '🦍', '🦧', '🐘', '🦛', '🦏', '🐪', '🐫', '🦒', '🦘', '🦬', '🐃', '🐂', '🐄', '🐎', '🐖', '🐏', '🐑', '🦙', '🐐', '🦌', '🐕', '🐩', '🦮', '🐕‍🦺', '🐈', '🐓', '🦃', '🦤', '🦚', '🦜', '🦢', '🦩', '🕊', '🐇', '🦝', '🦨', '🦡', '🦫', '🦦', '🦥', '🐁', '🐀', '🐿', '🦔', '🐾', '🐉', '🐲', '🌵', '🎄', '🌲', '🌳', '🌴', '🪵', '🌱', '🌿', '☘️', '🍀', '🎍', '🪴', '🎋', '🍃', '🍂', '🍁', '🍄', '🐚', '🪨', '🌾', '💐', '🌷', '🌹', '🥀', '🌺', '🌻', '🌼', '🌷', '🌱', '🌿', '☘️', '🍀', '🍂', '🍃'],
  },
  {
    name: 'Food',
    emojis: ['🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑', '🥦', '🥬', '🥒', '🌶', '🌽', '🥕', '🥔', '🍠', '🥐', '🥯', '🍞', '🥖', '🥨', '🧀', '🥚', '🍳', '🥞', '🥓', '🥩', '🍗', '🍖', '🦴', '🌭', '🍔', '🍟', '🍕', '🥪', '🥙', '🌮', '🌯', '🥗', '🥘', '🥫', '🍝', '🍜', '🍲', '🍛', '🍣', '🍱', '🥟', '🦪', '🍤', '🍙', '🍚', '🍘', '🍥', '🥠', '🥮', '🍢', '🍡', '🍧', '🍨', '🍦', '🥧', '🧁', '🍰', '🎂', '🍮', '🍭', '🍬', '🍫', '🍿', '🍩', '🍪', '🌰', '🥜', '🍯', '🥛', '🍼', '☕️', '🍵', '🧃', '🥤', '🍶', '🍺', '🍻', '🥂', '🍷', '🥃', '🍸', '🍹', '🧉', '🍾', '🧊'],
  },
  {
    name: 'Activities',
    emojis: ['⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '🪃', '🥅', '⛳', '🪁', '🏹', '🎣', '🤿', '🥊', '🥋', '🎽', '🛹', '🛷', '⛸', '🥌', '🎿', '⛷', '🏂', '🪂', '🏋️', '🤼', '🤸', '🤺', '⛹️', '🤾', '🏌️', '🏇', '🧘', '🏄', '🏊', '🚣', '🧗', '🚵', '🚴', '🏆', '🥇', '🥈', '🥉', '🏅', '🎖', '🏵', '🎗', '🎫', '🎟', '🎪', '🤹', '🎭', '🩰', '🎨', '🎬', '🎤', '🎧', '🎼', '🎹', '🥁', '🎷', '🎺', '🎸', '🪕', '🎻', '🎲', '🧩', '♟️', '🎯', '🎳', '🎮', '🎰', '🧸', '🎯'],
  },
];

export default function EmojiPicker({ onEmojiSelect }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [recentEmojis, setRecentEmojis] = useState<string[]>([]);
  const [mostUsedEmojis, setMostUsedEmojis] = useState<string[]>([]);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Load most used emojis from user's message history
  useEffect(() => {
    const loadMostUsedEmojis = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Get user's messages from last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const { data: messages } = await supabase
          .from('dms_messages')
          .select('body')
          .eq('sender_id', user.id)
          .not('body', 'is', null)
          .gte('created_at', thirtyDaysAgo.toISOString())
          .limit(500);

        if (!messages || messages.length === 0) return;

        // Extract emojis from messages using regex
        // Regex for emojis: covers most emoji ranges
        // Combine all emoji ranges into one character class
        const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{1FA80}-\u{1FAFF}]/gu;
        const emojiCounts: Record<string, number> = {};

        messages.forEach((msg) => {
          if (msg.body) {
            // Match all emojis in the message
            const emojiMatches = msg.body.match(emojiRegex);
            if (emojiMatches) {
              emojiMatches.forEach((emoji) => {
                emojiCounts[emoji] = (emojiCounts[emoji] || 0) + 1;
              });
            }
          }
        });

        // Sort by count and take top 30 (3 rows of 10)
        const sortedEmojis = Object.entries(emojiCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 30)
          .map(([emoji]) => emoji);

        setMostUsedEmojis(sortedEmojis);
      } catch (err) {
        console.error('Error loading most used emojis:', err);
      }
    };

    loadMostUsedEmojis();
  }, []);

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
    ...(mostUsedEmojis.length > 0 ? [{ name: 'Most Used', emojis: mostUsedEmojis }] : []),
    ...(recentEmojis.length > 0 ? [{ name: 'Recently Used', emojis: recentEmojis }] : []),
    ...EMOJI_CATEGORIES.slice(1),
  ];

  return (
    <div className="relative" ref={pickerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="px-2 py-1 rounded-xl text-white/80 hover:bg-white/10 text-lg transition-colors"
        title="Add emoji"
      >
        😊
      </button>

      {isOpen && (
        <div className="absolute bottom-full right-0 mb-2 w-96 h-96 bg-[#0f1628] border border-white/20 rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-y-auto p-3">
            {allCategories.map((category) => (
              category.emojis.length > 0 && (
                <div key={category.name} className="mb-4">
                  <div className="text-xs text-white/60 font-medium mb-2 px-1 sticky top-0 bg-[#0f1628] py-1 z-10">
                    {category.name}
                  </div>
                  <div className="grid grid-cols-10 gap-1">
                    {category.emojis.map((emoji, idx) => (
                      <button
                        key={`${category.name}-${idx}-${emoji}`}
                        type="button"
                        onClick={() => handleEmojiClick(emoji)}
                        className="w-8 h-8 flex items-center justify-center text-base hover:bg-white/10 rounded-lg transition"
                        title={emoji}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              )
            ))}
          </div>
          <div className="border-t border-white/10 px-3 py-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-xs text-white/60 hover:text-white/80"
            >
              Close
            </button>
            <div className="text-xs text-white/40">
              {allCategories.reduce((sum, cat) => sum + cat.emojis.length, 0)} emojis
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

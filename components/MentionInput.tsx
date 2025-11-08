'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type User = {
  user_id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
};

type MentionInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  userId: string | null;
};

export default function MentionInput({
  value,
  onChange,
  placeholder,
  className,
  userId,
}: MentionInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionPosition, setMentionPosition] = useState<number | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [suggestions, setSuggestions] = useState<User[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [followingUsers, setFollowingUsers] = useState<Set<string>>(new Set());
  const [followerUsers, setFollowerUsers] = useState<Set<string>>(new Set());

  // Load following and followers for autocomplete
  useEffect(() => {
    if (!userId) return;

    (async () => {
      try {
        const [followingRes, followersRes] = await Promise.all([
          supabase.from('follows').select('followee_id').eq('follower_id', userId),
          supabase.from('follows').select('follower_id').eq('followee_id', userId),
        ]);

        const following = new Set((followingRes.data || []).map((f: any) => f.followee_id));
        const followers = new Set((followersRes.data || []).map((f: any) => f.follower_id));

        // Combine both sets - users I follow AND users who follow me
        const allRelevantUsers = new Set([...following, ...followers]);
        
        setFollowingUsers(following);
        setFollowerUsers(followers);

        // Load user profiles for suggestions
        if (allRelevantUsers.size > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('user_id, username, full_name, avatar_url')
            .in('user_id', Array.from(allRelevantUsers));

          if (profiles) {
            setAllUsers(profiles as User[]);
          }
        }
      } catch (error) {
        console.error('Error loading follow relationships:', error);
      }
    })();
  }, [userId]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      const cursorPos = e.target.selectionStart;

      onChange(newValue);

      // Check if we're in a mention context (@...)
      const textBeforeCursor = newValue.substring(0, cursorPos);
      const lastAtIndex = textBeforeCursor.lastIndexOf('@');

      if (lastAtIndex !== -1) {
        // Check if there's a space or newline after @ (meaning mention is complete)
        const afterAt = textBeforeCursor.substring(lastAtIndex + 1);
        const hasSpace = /\s/.test(afterAt);

        if (!hasSpace && afterAt.length >= 0) {
          // We're in a mention - show suggestions
          const query = afterAt.toLowerCase();
          setMentionQuery(query);
          setMentionPosition(lastAtIndex);
          setShowSuggestions(true);
          setSelectedIndex(0);

          // Filter suggestions based on query
          const filtered = allUsers.filter((user) => {
            if (!query) return true;
            const username = (user.username || '').toLowerCase();
            const fullName = (user.full_name || '').toLowerCase();
            return username.includes(query) || fullName.includes(query);
          });
          setSuggestions(filtered);
        } else {
          setShowSuggestions(false);
        }
      } else {
        setShowSuggestions(false);
      }
    },
    [onChange, allUsers]
  );

  const insertMention = useCallback(
    (user: User) => {
      if (mentionPosition === null) return;

      const username = user.username || user.user_id.slice(0, 8);
      const beforeMention = value.substring(0, mentionPosition);
      const afterMention = value.substring(mentionPosition + 1 + mentionQuery.length);
      const newValue = `${beforeMention}@${username} ${afterMention}`;

      onChange(newValue);
      setShowSuggestions(false);
      setMentionPosition(null);
      setMentionQuery('');

      // Set cursor position after inserted mention
      setTimeout(() => {
        if (textareaRef.current) {
          const newCursorPos = mentionPosition + username.length + 2; // +2 for @ and space
          textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
          textareaRef.current.focus();
        }
      }, 0);
    },
    [value, mentionPosition, mentionQuery, onChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!showSuggestions || suggestions.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % suggestions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (suggestions[selectedIndex]) {
          insertMention(suggestions[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        setShowSuggestions(false);
      }
    },
    [showSuggestions, suggestions, selectedIndex, insertMention]
  );

  // Filter suggestions based on current query
  const filteredSuggestions = suggestions.filter((user) => {
    if (!mentionQuery) return true;
    const username = (user.username || '').toLowerCase();
    const fullName = (user.full_name || '').toLowerCase();
    return username.includes(mentionQuery) || fullName.includes(mentionQuery);
  });

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={className}
      />
      {showSuggestions && filteredSuggestions.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-white/20 bg-white/95 dark:bg-slate-800/95 shadow-lg backdrop-blur-sm">
          {filteredSuggestions.map((user, index) => {
            const username = user.username || user.user_id.slice(0, 8);
            const displayName = user.full_name || username;
            const isFollowing = followingUsers.has(user.user_id);
            const isFollower = followerUsers.has(user.user_id);

            return (
              <button
                key={user.user_id}
                type="button"
                onClick={() => insertMention(user)}
                className={`w-full px-3 py-2 text-left transition-colors ${
                  index === selectedIndex 
                    ? 'bg-primary-blue/20 dark:bg-primary-blue/30' 
                    : 'hover:bg-white/50 dark:hover:bg-slate-700/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  {user.avatar_url ? (
                    <img
                      src={user.avatar_url}
                      alt=""
                      className="h-8 w-8 rounded-full object-cover border border-white/10"
                    />
                  ) : (
                    <div className="h-8 w-8 rounded-full bg-slate-300 dark:bg-slate-600 border border-white/10" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 dark:text-white truncate">
                      {displayName}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      @{username}
                      {isFollowing && isFollower && (
                        <span className="ml-1 text-primary-blue dark:text-primary-blue-light">• mutual</span>
                      )}
                      {isFollowing && !isFollower && (
                        <span className="ml-1 text-slate-400">• following</span>
                      )}
                      {!isFollowing && isFollower && (
                        <span className="ml-1 text-slate-400">• follower</span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

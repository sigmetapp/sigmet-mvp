import React from 'react';
import Link from 'next/link';

/**
 * Checks whether the text contains @mentions.
 * @param text - Text to check
 * @returns true if there are mentions, otherwise false
 */
const MENTION_REGEX = /@([a-zA-Z0-9_.-]+)/g;

export function hasMentions(text: string | null | undefined): boolean {
  if (!text) return false;
  MENTION_REGEX.lastIndex = 0;
  return MENTION_REGEX.test(text);
}

/**
 * Parses text and highlights @mentions with a link to user profile (no underline).
 * @param text - Text to process
 * @returns React nodes with highlighted mentions
 */
export function formatTextWithMentions(text: string): React.ReactNode {
  if (!text) return text;

  // Regex to find mentions: @username (letters, digits, underscores)
  // Pattern: @ followed by one or more word characters
  // Capture until a space, punctuation, or end of line
  const mentionRegex = MENTION_REGEX;
  mentionRegex.lastIndex = 0;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = mentionRegex.exec(text)) !== null) {
    const [fullMatch, username] = match;
    const matchIndex = match.index;

    // Add text before mention
    if (matchIndex > lastIndex) {
      parts.push(text.substring(lastIndex, matchIndex));
    }

    // Add mention with link to user profile (no underline)
    parts.push(
      <Link
        key={`mention-${matchIndex}`}
        href={`/u/${username}`}
        className="relative inline-block font-medium text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 transition-colors"
        onClick={(e) => e.stopPropagation()}
        data-prevent-card-navigation="true"
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(134, 239, 172, 0.1)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        {fullMatch}
      </Link>
    );

    lastIndex = matchIndex + fullMatch.length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? <>{parts}</> : text;
}

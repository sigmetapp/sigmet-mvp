import React from 'react';
import Link from 'next/link';

/**
 * Checks whether the text contains @mentions.
 * @param text - Text to check
 * @returns true if there are mentions, otherwise false
 */
export function hasMentions(text: string | null | undefined): boolean {
  if (!text) return false;
  const mentionRegex = /@(\w+)/g;
  return mentionRegex.test(text);
}

/**
 * Parses text and highlights @mentions with a light green underline.
 * @param text - Text to process
 * @returns React nodes with highlighted mentions
 */
export function formatTextWithMentions(text: string): React.ReactNode {
  if (!text) return text;

  // Regex to find mentions: @username (letters, digits, underscores)
  // Pattern: @ followed by one or more word characters
  // Capture until a space, punctuation, or end of line
  const mentionRegex = /@(\w+)/g;
  
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

    // Add mention with underline and link to user profile
    parts.push(
      <Link
        key={`mention-${matchIndex}`}
        href={`/u/${username}`}
        className="relative inline-block font-medium text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 transition-colors"
        onClick={(e) => e.stopPropagation()}
        data-prevent-card-navigation="true"
        style={{
          textDecoration: 'underline',
          textDecorationColor: '#86efac', // green-300
          textDecorationThickness: '2px',
          textUnderlineOffset: '3px',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.textDecorationColor = '#4ade80'; // green-400
          e.currentTarget.style.backgroundColor = 'rgba(134, 239, 172, 0.1)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.textDecorationColor = '#86efac'; // green-300
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

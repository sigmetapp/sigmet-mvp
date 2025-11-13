import React from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

/**
 * Checks whether the text contains @mentions.
 * @param text - Text to check
 * @returns true if there are mentions, otherwise false
 */
const MENTION_REGEX = /@([a-zA-Z0-9_.-]+)/g;
// Regex to find URLs (http, https, www, or relative paths starting with /)
// Exclude trailing punctuation: .,!?;:)
const URL_REGEX = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+|\/[^\s<>"']+)/gi;

export function hasMentions(text: string | null | undefined): boolean {
  if (!text) return false;
  MENTION_REGEX.lastIndex = 0;
  return MENTION_REGEX.test(text);
}

/**
 * Track link click for a post
 */
async function trackLinkClick(postId: number | undefined) {
  if (!postId) return;
  
  try {
    // Increment link clicks counter
    await supabase.rpc('increment_post_link_clicks', {
      p_post_id: postId,
    });
    
    // Increment link click history
    await supabase.rpc('increment_post_link_click_history', {
      p_post_id: postId,
      p_date: new Date().toISOString().split('T')[0],
    });
  } catch (error) {
    console.warn('Failed to track link click:', error);
  }
}

/**
 * Check if URL is an internal link (sigmet.app or relative path)
 */
function isInternalLink(url: string): boolean {
  // Relative paths are always internal
  if (url.startsWith('/')) {
    return true;
  }
  
  try {
    const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
    return urlObj.hostname === 'sigmet.app' || urlObj.hostname === 'www.sigmet.app';
  } catch {
    return false;
  }
}

/**
 * Parses text and highlights @mentions with a link to user profile (no underline).
 * Also processes URLs and tracks clicks on internal links.
 * @param text - Text to process
 * @param postId - Optional post ID for tracking link clicks
 * @returns React nodes with highlighted mentions and links
 */
export function formatTextWithMentions(text: string, postId?: number): React.ReactNode {
  if (!text) return text;

  const parts: React.ReactNode[] = [];
  const allMatches: Array<{ type: 'mention' | 'url'; match: RegExpMatchArray; index: number }> = [];

  // Find all mentions
  const mentionRegex = MENTION_REGEX;
  mentionRegex.lastIndex = 0;
  let match;
  while ((match = mentionRegex.exec(text)) !== null) {
    allMatches.push({ type: 'mention', match, index: match.index });
  }

  // Find all URLs
  URL_REGEX.lastIndex = 0;
  while ((match = URL_REGEX.exec(text)) !== null) {
    allMatches.push({ type: 'url', match, index: match.index });
  }

  // Sort matches by position
  allMatches.sort((a, b) => a.index - b.index);

  let lastIndex = 0;
  let keyCounter = 0;

  for (const { type, match, index } of allMatches) {
    const [fullMatch] = match;

    // Add text before match
    if (index > lastIndex) {
      parts.push(text.substring(lastIndex, index));
    }

    if (type === 'mention') {
      const username = match[1];
      // Add mention with link to user profile (no underline)
      parts.push(
        <Link
          key={`mention-${keyCounter++}`}
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
    } else if (type === 'url') {
      // Normalize URL
      let url = fullMatch;
      if (url.startsWith('/')) {
        // Relative path - keep as is
      } else if (url.startsWith('http')) {
        // Already has protocol
      } else {
        // Add https:// for www. or other domains
        url = `https://${url}`;
      }
      
      const isInternal = isInternalLink(fullMatch);
      
      // Add URL as link
      if (isInternal && fullMatch.startsWith('/')) {
        // Use Next.js Link for internal relative paths
        parts.push(
          <Link
            key={`url-${keyCounter++}`}
            href={fullMatch}
            className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline"
            onClick={(e) => {
              e.stopPropagation();
              if (postId) {
                trackLinkClick(postId);
              }
            }}
            data-prevent-card-navigation="true"
          >
            {fullMatch}
          </Link>
        );
      } else {
        // Use regular anchor for external links
        parts.push(
          <a
            key={`url-${keyCounter++}`}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline"
            onClick={(e) => {
              e.stopPropagation();
              if (isInternal && postId) {
                trackLinkClick(postId);
              }
            }}
            data-prevent-card-navigation="true"
          >
            {fullMatch}
          </a>
        );
      }
    }

    lastIndex = index + fullMatch.length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? <>{parts}</> : text;
}

'use client';

import { BookOpen, ExternalLink } from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';
import { useRouter } from 'next/navigation';

export interface EducationalPostData {
  id: number;
  topic: string;
  title: string;
  content: string;
  icon_emoji?: string | null;
  link_url?: string | null;
  link_text?: string | null;
}

interface EducationalPostProps {
  post: EducationalPostData;
}

export default function EducationalPost({ post }: EducationalPostProps) {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const router = useRouter();

  const handleLinkClick = (e: React.MouseEvent) => {
    if (post.link_url) {
      e.preventDefault();
      router.push(post.link_url);
    }
  };

  return (
    <div
      className={`
        relative rounded-lg border-2 p-4 md:p-6
        ${isLight 
          ? 'bg-blue-50/50 border-blue-200/60' 
          : 'bg-blue-950/30 border-blue-800/40'
        }
      `}
    >
      {/* Badge indicator */}
      <div className="absolute top-3 right-3">
        <div
          className={`
            flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium
            ${isLight 
              ? 'bg-blue-100 text-blue-700' 
              : 'bg-blue-900/50 text-blue-300'
            }
          `}
        >
          <BookOpen className="w-3 h-3" />
          <span>Reference</span>
        </div>
      </div>

      {/* Content */}
      <div className="pr-20">
        {/* Icon and Title */}
        <div className="flex items-start gap-3 mb-3">
          {post.icon_emoji && (
            <span className="text-2xl md:text-3xl flex-shrink-0">
              {post.icon_emoji}
            </span>
          )}
          <h3
            className={`
              text-lg md:text-xl font-semibold
              ${isLight ? 'text-gray-900' : 'text-white'}
            `}
          >
            {post.title}
          </h3>
        </div>

        {/* Content text */}
        <p
          className={`
            text-sm md:text-base leading-relaxed mb-4
            ${isLight ? 'text-gray-700' : 'text-gray-300'}
          `}
        >
          {post.content}
        </p>

        {/* Link */}
        {post.link_url && post.link_text && (
          <a
            href={post.link_url}
            onClick={handleLinkClick}
            className={`
              inline-flex items-center gap-2 text-sm font-medium
              transition-colors hover:opacity-80
              ${isLight 
                ? 'text-blue-600 hover:text-blue-700' 
                : 'text-blue-400 hover:text-blue-300'
              }
            `}
          >
            <span>{post.link_text}</span>
            <ExternalLink className="w-4 h-4" />
          </a>
        )}
      </div>
    </div>
  );
}

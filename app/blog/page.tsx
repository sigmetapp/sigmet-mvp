'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTheme } from '@/components/ThemeProvider';
import { useRouter } from 'next/navigation';
import { Calendar, FileText, GitBranch } from 'lucide-react';

type BlogPost = {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  type: 'guideline' | 'changelog';
  published_at: string;
  created_at: string;
  updated_at: string;
  author_id: string;
  profiles: {
    username: string | null;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
};

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

export default function BlogPage() {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const router = useRouter();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'guideline' | 'changelog'>('all');

  useEffect(() => {
    fetchPosts();
  }, [filter]);

  const fetchPosts = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filter !== 'all') {
        params.append('type', filter);
      }
      const response = await fetch(`/api/blog/posts.list?${params.toString()}`);
      const data = await response.json();
      if (response.ok) {
        setPosts(data.posts || []);
      } else {
        console.error('Error fetching blog posts:', data);
        // Don't show alert for empty list, just log the error
        if (data.error && !data.error.includes('not found')) {
          console.error('API Error:', data.error, data.details);
        }
      }
    } catch (error) {
      console.error('Error fetching blog posts:', error);
    } finally {
      setLoading(false);
    }
  };

  const guidelines = posts.filter(p => p.type === 'guideline');
  const changelogs = posts.filter(p => p.type === 'changelog');

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 md:py-12">
      <div className="mb-8">
        <h1 className={`text-3xl md:text-4xl font-semibold tracking-tight mb-4 ${
          isLight 
            ? "bg-gradient-to-r from-primary-blue to-primary-blue-light bg-clip-text text-transparent" 
            : "gradient-text"
        }`}>
          Blog
        </h1>
        <p className={`${isLight ? "text-black/60" : "text-white/60"} text-lg`}>
          Guidelines and updates from the team
        </p>
      </div>

      <div className="mb-6 flex gap-2">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-lg text-sm transition ${
            filter === 'all'
              ? isLight
                ? 'bg-primary-blue text-white'
                : 'bg-primary-blue-light text-white'
              : isLight
                ? 'bg-black/5 text-black/70 hover:bg-black/10'
                : 'bg-white/5 text-white/70 hover:bg-white/10'
          }`}
        >
          All
        </button>
        <button
          onClick={() => setFilter('guideline')}
          className={`px-4 py-2 rounded-lg text-sm transition ${
            filter === 'guideline'
              ? isLight
                ? 'bg-primary-blue text-white'
                : 'bg-primary-blue-light text-white'
              : isLight
                ? 'bg-black/5 text-black/70 hover:bg-black/10'
                : 'bg-white/5 text-white/70 hover:bg-white/10'
          }`}
        >
          Guidelines
        </button>
        <button
          onClick={() => setFilter('changelog')}
          className={`px-4 py-2 rounded-lg text-sm transition ${
            filter === 'changelog'
              ? isLight
                ? 'bg-primary-blue text-white'
                : 'bg-primary-blue-light text-white'
              : isLight
                ? 'bg-black/5 text-black/70 hover:bg-black/10'
                : 'bg-white/5 text-white/70 hover:bg-white/10'
          }`}
        >
          Change Log
        </button>
      </div>

      {loading ? (
        <div className="space-y-6">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className={`p-6 rounded-xl border ${
                isLight ? 'bg-white border-black/10' : 'bg-white/5 border-white/10'
              }`}
            >
              <div className={`h-6 w-3/4 mb-3 rounded ${isLight ? 'bg-black/10' : 'bg-white/10'}`} />
              <div className={`h-4 w-1/2 mb-4 rounded ${isLight ? 'bg-black/10' : 'bg-white/10'}`} />
              <div className={`h-4 w-full rounded ${isLight ? 'bg-black/10' : 'bg-white/10'}`} />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          {filter === 'all' || filter === 'guideline' ? (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <FileText className={`w-5 h-5 ${isLight ? 'text-primary-blue' : 'text-primary-blue-light'}`} />
                <h2 className={`text-xl font-semibold ${isLight ? 'text-black' : 'text-white'}`}>
                  Guidelines
                </h2>
              </div>
              {guidelines.length > 0 ? (
                <div className="space-y-4">
                  {guidelines.map((post) => (
                    <Link
                      key={post.id}
                      href={`/blog/${post.slug}`}
                      className={`block p-6 rounded-xl border transition ${
                        isLight
                          ? 'bg-white border-black/10 hover:border-primary-blue/30 hover:shadow-md'
                          : 'bg-white/5 border-white/10 hover:border-primary-blue/30 hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <h3 className={`text-lg font-semibold ${isLight ? 'text-black' : 'text-white'}`}>
                          {post.title}
                        </h3>
                        <div className={`flex items-center gap-1 text-xs ${isLight ? 'text-black/50' : 'text-white/50'}`}>
                          <Calendar className="w-3 h-3" />
                          {formatDate(post.published_at)}
                        </div>
                      </div>
                      {post.excerpt && (
                        <p className={`${isLight ? 'text-black/60' : 'text-white/60'} text-sm line-clamp-2`}>
                          {post.excerpt}
                        </p>
                      )}
                    </Link>
                  ))}
                </div>
              ) : (
                <p className={`${isLight ? 'text-black/50' : 'text-white/50'} text-sm`}>
                  No guidelines yet
                </p>
              )}
            </div>
          ) : null}

          {filter === 'all' || filter === 'changelog' ? (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <GitBranch className={`w-5 h-5 ${isLight ? 'text-primary-blue' : 'text-primary-blue-light'}`} />
                <h2 className={`text-xl font-semibold ${isLight ? 'text-black' : 'text-white'}`}>
                  Change Log
                </h2>
              </div>
              {changelogs.length > 0 ? (
                <div className="space-y-4">
                  {changelogs.map((post) => (
                    <Link
                      key={post.id}
                      href={`/blog/${post.slug}`}
                      className={`block p-6 rounded-xl border transition ${
                        isLight
                          ? 'bg-white border-black/10 hover:border-primary-blue/30 hover:shadow-md'
                          : 'bg-white/5 border-white/10 hover:border-primary-blue/30 hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <h3 className={`text-lg font-semibold ${isLight ? 'text-black' : 'text-white'}`}>
                          {post.title}
                        </h3>
                        <div className={`flex items-center gap-1 text-xs ${isLight ? 'text-black/50' : 'text-white/50'}`}>
                          <Calendar className="w-3 h-3" />
                          {formatDate(post.published_at)}
                        </div>
                      </div>
                      {post.excerpt && (
                        <p className={`${isLight ? 'text-black/60' : 'text-white/60'} text-sm line-clamp-2`}>
                          {post.excerpt}
                        </p>
                      )}
                    </Link>
                  ))}
                </div>
              ) : (
                <p className={`${isLight ? 'text-black/50' : 'text-white/50'} text-sm`}>
                  No changelogs yet
                </p>
              )}
            </div>
          ) : null}

          {posts.length === 0 && !loading && (
            <div className={`text-center py-12 ${isLight ? 'text-black/50' : 'text-white/50'}`}>
              <p>No blog posts yet</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

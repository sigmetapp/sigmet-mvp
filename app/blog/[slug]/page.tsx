'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTheme } from '@/components/ThemeProvider';
import { Calendar, ArrowLeft, Edit, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import AvatarWithBadge from '@/components/AvatarWithBadge';
import { resolveAvatarUrl } from '@/lib/utils';
import Button from '@/components/Button';

type BlogPost = {
  id: number;
  title: string;
  slug: string;
  content: string;
  excerpt: string | null;
  type: 'guideline' | 'changelog';
  media_urls: string[];
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

type Comment = {
  id: number;
  content: string;
  created_at: string;
  updated_at: string;
  author_id: string;
  profiles: {
    username: string | null;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
};

const ADMIN_EMAILS = new Set<string>(['seosasha@gmail.com']);

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function formatDateWithTime(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

function escapeHtml(text: string): string {
  const map: { [key: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

function formatBlogContent(content: string): string {
  if (!content) return '';
  
  // If content already contains HTML tags, return as is
  if (content.includes('<') && content.includes('>')) {
    return content;
  }
  
  // Convert plain text to HTML with proper line breaks
  // Split by double newlines (paragraphs) and single newlines (line breaks)
  const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim());
  
  return paragraphs.map(paragraph => {
    const trimmed = paragraph.trim();
    
    // Check if paragraph starts with emoji or special character (like section headers)
    if (trimmed.match(/^[🧩⚙️🐞🔒📊🧠]/)) {
      // This is a section header
      const lines = trimmed.split('\n').filter(l => l.trim());
      const header = lines[0];
      const items = lines.slice(1);
      
      let html = `<h3 class="blog-section-header">${escapeHtml(header)}</h3>`;
      if (items.length > 0) {
        html += '<ul class="blog-section-list">';
        items.forEach(item => {
          const cleanItem = item.trim().replace(/^[-•]\s*/, '');
          if (cleanItem) {
            html += `<li>${escapeHtml(cleanItem)}</li>`;
          }
        });
        html += '</ul>';
      }
      return html;
    } else {
      // Regular paragraph - preserve single line breaks as <br>
      const lines = trimmed.split('\n').filter(l => l.trim());
      if (lines.length === 1) {
        return `<p>${escapeHtml(lines[0])}</p>`;
      } else {
        return `<p>${lines.map(line => escapeHtml(line)).join('<br>')}</p>`;
      }
    }
  }).join('');
}

export default function BlogPostPage() {
  const params = useParams();
  const router = useRouter();
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const slug = params?.slug as string;
  
  const [post, setPost] = useState<BlogPost | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentContent, setCommentContent] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    checkAuth();
    fetchPost();
  }, [slug]);

  useEffect(() => {
    if (post) {
      fetchComments();
    }
  }, [post]);

  const checkAuth = async () => {
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    setUser(currentUser);
    if (currentUser?.email) {
      setIsAdmin(ADMIN_EMAILS.has(currentUser.email));
    }
  };

  const fetchPost = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/blog/posts.get?slug=${slug}`);
      const data = await response.json();
      if (response.ok) {
        setPost(data.post);
      } else if (response.status === 404) {
        router.push('/blog');
      }
    } catch (error) {
      console.error('Error fetching blog post:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchComments = async () => {
    if (!post) return;
    try {
      const response = await fetch(`/api/blog/comments.list?post_id=${post.id}`);
      const data = await response.json();
      if (response.ok) {
        setComments(data.comments || []);
      }
    } catch (error) {
      console.error('Error fetching comments:', error);
    }
  };

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!post || !user || !commentContent.trim()) return;

    try {
      setSubmittingComment(true);
      const response = await fetch('/api/blog/comments.create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          post_id: post.id,
          content: commentContent.trim(),
        }),
      });

      const data = await response.json();
      if (response.ok) {
        setCommentContent('');
        fetchComments();
      } else {
        alert(data.error || 'Failed to post comment');
      }
    } catch (error) {
      console.error('Error posting comment:', error);
      alert('Failed to post comment');
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleDeletePost = async () => {
    if (!post || !isAdmin) return;
    if (!confirm('Are you sure you want to delete this post?')) return;

    try {
      const response = await fetch(`/api/blog/posts.delete?id=${post.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        router.push('/blog');
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to delete post');
      }
    } catch (error) {
      console.error('Error deleting post:', error);
      alert('Failed to delete post');
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 md:py-12">
        <div className={`mb-8 ${isLight ? 'bg-white border-black/10' : 'bg-white/5 border-white/10'} p-6 rounded-xl border`}>
          <div className={`h-8 w-3/4 mb-4 rounded ${isLight ? 'bg-black/10' : 'bg-white/10'}`} />
          <div className={`h-4 w-1/2 mb-6 rounded ${isLight ? 'bg-black/10' : 'bg-white/10'}`} />
          <div className="space-y-2">
            <div className={`h-4 w-full rounded ${isLight ? 'bg-black/10' : 'bg-white/10'}`} />
            <div className={`h-4 w-full rounded ${isLight ? 'bg-black/10' : 'bg-white/10'}`} />
            <div className={`h-4 w-3/4 rounded ${isLight ? 'bg-black/10' : 'bg-white/10'}`} />
          </div>
        </div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 md:py-12">
        <div className={`text-center py-12 ${isLight ? 'text-black/50' : 'text-white/50'}`}>
          <p>Post not found</p>
          <Link href="/blog" className={`mt-4 inline-block ${isLight ? 'text-primary-blue' : 'text-primary-blue-light'}`}>
            ← Back to blog
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 md:py-12">
      <Link
        href="/blog"
        className={`inline-flex items-center gap-2 mb-6 ${isLight ? 'text-black/60 hover:text-black' : 'text-white/60 hover:text-white'} transition`}
      >
        <ArrowLeft className="w-4 h-4" />
        Back to blog
      </Link>

      <article className={`${isLight ? 'bg-white border-black/10' : 'bg-white/5 border-white/10'} p-6 md:p-8 rounded-xl border mb-8`}>
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className={`px-2 py-1 rounded text-xs font-medium ${
                post.type === 'guideline'
                  ? isLight
                    ? 'bg-primary-blue/10 text-primary-blue'
                    : 'bg-primary-blue/20 text-primary-blue-light'
                  : isLight
                    ? 'bg-green-500/10 text-green-600'
                    : 'bg-green-500/20 text-green-400'
              }`}>
                {post.type === 'guideline' ? 'Guideline' : 'Change Log'}
              </span>
            </div>
            <h1 className={`text-3xl md:text-4xl font-semibold mb-4 ${isLight ? 'text-black' : 'text-white'}`}>
              {post.title}
            </h1>
            <div className={`flex flex-col gap-2 text-sm ${isLight ? 'text-black/50' : 'text-white/50'}`}>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                {formatDate(post.published_at)}
              </div>
              {post.profiles && (
                <div>
                  <Link 
                    href={`/u/${post.profiles.username || post.author_id}`}
                    className={`${isLight ? 'text-primary-blue hover:text-primary-blue-dark' : 'text-primary-blue-light hover:text-primary-blue'} transition`}
                  >
                    {post.profiles.full_name || post.profiles.username || 'Unknown'}
                  </Link>
                </div>
              )}
            </div>
          </div>
          {isAdmin && (
            <div className="flex items-center gap-2">
              <Link href={`/blog/admin/edit/${post.id}`}>
                <Button
                  variant="ghost"
                  size="sm"
                  className={isLight ? 'text-black/60 hover:text-black' : 'text-white/60 hover:text-white'}
                >
                  <Edit className="w-4 h-4" />
                </Button>
              </Link>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDeletePost}
                className={isLight ? 'text-red-600 hover:text-red-700' : 'text-red-400 hover:text-red-300'}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>

        {post.excerpt && (
          <p className={`text-lg mb-6 ${isLight ? 'text-black/70' : 'text-white/70'}`}>
            {post.excerpt}
          </p>
        )}

        {post.media_urls && post.media_urls.length > 0 && (
          <div className="mb-6 space-y-4">
            {post.media_urls.map((url, idx) => (
              <img
                key={idx}
                src={url}
                alt={`Media ${idx + 1}`}
                className="w-full rounded-lg"
              />
            ))}
          </div>
        )}

        <div
          className={`blog-content ${isLight ? 'blog-content-light' : 'blog-content-dark'}`}
          dangerouslySetInnerHTML={{ __html: formatBlogContent(post.content) }}
        />
      </article>

      <section className={`${isLight ? 'bg-white border-black/10' : 'bg-white/5 border-white/10'} p-6 md:p-8 rounded-xl border`}>
        <h2 className={`text-2xl font-semibold mb-6 ${isLight ? 'text-black' : 'text-white'}`}>
          Comments ({comments.length})
        </h2>

        {user ? (
          <form onSubmit={handleSubmitComment} className="mb-8">
            <textarea
              value={commentContent}
              onChange={(e) => setCommentContent(e.target.value)}
              placeholder="Write a comment..."
              rows={4}
              className={`w-full p-4 rounded-lg border resize-none ${
                isLight
                  ? 'bg-white border-black/10 text-black placeholder-black/40 focus:border-primary-blue focus:ring-2 focus:ring-primary-blue/20'
                  : 'bg-white/5 border-white/10 text-white placeholder-white/40 focus:border-primary-blue-light focus:ring-2 focus:ring-primary-blue-light/20'
              }`}
            />
            <div className="mt-4 flex justify-end">
              <Button
                type="submit"
                disabled={!commentContent.trim() || submittingComment}
                className={isLight ? 'bg-primary-blue text-white' : 'bg-primary-blue-light text-white'}
              >
                {submittingComment ? 'Posting...' : 'Post Comment'}
              </Button>
            </div>
          </form>
        ) : (
          <div className={`mb-8 p-4 rounded-lg ${isLight ? 'bg-black/5' : 'bg-white/5'}`}>
            <p className={`text-sm ${isLight ? 'text-black/60' : 'text-white/60'}`}>
              Please <Link href="/login" className={`underline ${isLight ? 'text-primary-blue' : 'text-primary-blue-light'}`}>sign in</Link> to comment
            </p>
          </div>
        )}

        <div className="space-y-6">
          {comments.length > 0 ? (
            comments.map((comment) => (
              <div key={comment.id} className={`pb-6 border-b ${isLight ? 'border-black/10' : 'border-white/10'} last:border-0`}>
                <div className="flex items-start gap-3 mb-2">
                  {comment.profiles && (
                    <AvatarWithBadge
                      avatarUrl={resolveAvatarUrl(comment.profiles.avatar_url)}
                      username={comment.profiles.username}
                      size={32}
                    />
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                        {comment.profiles?.full_name || comment.profiles?.username || 'Unknown'}
                      </span>
                      <span className={`text-xs ${isLight ? 'text-black/50' : 'text-white/50'}`}>
                        {formatDateWithTime(comment.created_at)}
                      </span>
                    </div>
                    <p className={`${isLight ? 'text-black/80' : 'text-white/80'}`}>
                      {comment.content}
                    </p>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className={`text-center py-8 ${isLight ? 'text-black/50' : 'text-white/50'}`}>
              No comments yet. Be the first to comment!
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

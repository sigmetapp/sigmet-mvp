'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTheme } from '@/components/ThemeProvider';
import { Calendar, ArrowLeft, Edit, Trash2, Pencil, X } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import AvatarWithBadge from '@/components/AvatarWithBadge';
import { resolveAvatarUrl } from '@/lib/utils';
import Button from '@/components/Button';
import EmojiPicker from '@/components/EmojiPicker';
import { formatTextWithMentions } from '@/lib/formatText';
import CommentReactions, { ReactionType as CommentReactionType } from '@/components/CommentReactions';
import PostReactions, { ReactionType as PostReactionType } from '@/components/PostReactions';

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
  parent_id?: number | null;
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

function formatDateWithTodayYesterday(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  
  const timePart = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
  
  // Check if date is today
  if (dateOnly.getTime() === today.getTime()) {
    return `Today, ${timePart}`;
  }
  
  // Check if date is yesterday
  if (dateOnly.getTime() === yesterday.getTime()) {
    return `Yesterday, ${timePart}`;
  }
  
  // For all other dates, use the original format
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
  const [commenterSWScores, setCommenterSWScores] = useState<Record<string, number>>({});
  const [replyOpen, setReplyOpen] = useState<Record<number, boolean>>({});
  const [replyInput, setReplyInput] = useState<Record<number, string>>({});
  const [replySubmitting, setReplySubmitting] = useState<Record<number, boolean>>({});
  const [editingComment, setEditingComment] = useState<Record<number, boolean>>({});
  const [editCommentDraft, setEditCommentDraft] = useState<Record<number, string>>({});
  const [updatingComment, setUpdatingComment] = useState<Record<number, boolean>>({});
  const [deletingComment, setDeletingComment] = useState<Record<number, boolean>>({});
  
    // Post reactions state
    const [postReactionCounts, setPostReactionCounts] = useState<Record<PostReactionType, number>>({
      inspire: 0,
      respect: 0,
      relate: 0,
      support: 0,
      celebrate: 0,
      verify: 0,
    });
    const [postSelectedReaction, setPostSelectedReaction] = useState<PostReactionType | null>(null);
    
    // Comment reactions state
    const [commentReactions, setCommentReactions] = useState<Record<number, {
      counts: Record<CommentReactionType, number>;
      selected: CommentReactionType | null;
    }>>({});
    
    const EMPTY_COUNTS: Record<CommentReactionType, number> = {
    inspire: 0,
    respect: 0,
    relate: 0,
    support: 0,
    celebrate: 0,
  };

  useEffect(() => {
    checkAuth();
    fetchPost();
  }, [slug]);

  useEffect(() => {
    if (post) {
      fetchComments();
      loadBlogPostReactions();
    }
  }, [post]);
  
  // Reload reactions when user changes
  useEffect(() => {
    if (comments.length > 0 && user) {
      const commentIds = comments.map(c => c.id);
      loadBlogCommentReactions(commentIds);
    }
      if (post && user) {
        loadBlogPostReactions();
      }
    }, [user]);
    
    const loadBlogPostReactions = async () => {
    if (!post) return;
    
    try {
        const { data, error } = await supabase
          .from('blog_post_reactions')
          .select('kind, user_id')
          .eq('post_id', post.id);
        
        if (error) {
          console.error('Failed to load blog post reactions:', error);
          return;
        }

        const counts: Record<PostReactionType, number> = {
          inspire: 0,
          respect: 0,
          relate: 0,
          support: 0,
          celebrate: 0,
          verify: 0,
        };
        let selected: PostReactionType | null = null;

        const reactionMap: Record<string, PostReactionType> = {
          inspire: 'inspire',
          respect: 'inspire',
          relate: 'inspire',
          support: 'inspire',
          celebrate: 'inspire',
          like: 'inspire',
          growth: 'inspire',
          value: 'inspire',
          with_you: 'inspire',
          proud: 'inspire',
          grateful: 'inspire',
          drained: 'inspire',
          verify: 'verify',
        };

        const userId = user?.id;
        for (const row of (data || []) as Array<{ kind: string; user_id: string }>) {
          const reactionType = reactionMap[row.kind];
          if (!reactionType) continue;

          if (reactionType === 'verify') {
            counts.verify = (counts.verify || 0) + 1;
          } else {
            counts.inspire = (counts.inspire || 0) + 1;
          }

          if (userId && row.user_id === userId) {
            selected = reactionType;
          }
        }

      setPostReactionCounts(counts);
      setPostSelectedReaction(selected);
      } catch (error) {
        console.error('Error loading blog post reactions:', error);
      }
    };
    
    const handleBlogPostReactionChange = async (reaction: PostReactionType | null, counts?: Record<PostReactionType, number>) => {
    if (!user || !post) {
      alert('Sign in required');
      return;
    }

    try {
      await supabase
        .from('blog_post_reactions')
        .delete()
        .eq('post_id', post.id)
        .eq('user_id', user.id);

      if (reaction) {
        const { error: insertError } = await supabase
          .from('blog_post_reactions')
          .insert({ post_id: post.id, user_id: user.id, kind: reaction });
        if (insertError) {
          throw insertError;
        }
      }
      
      // Update local state
      if (counts) {
        setPostReactionCounts(counts);
      }
      setPostSelectedReaction(reaction);
    } catch (error: any) {
      console.error('Failed to update blog post reaction', error);
      const message =
        error?.message || error?.details || error?.hint || 'Failed to update reaction. Please try again later.';
      alert(message);
    } finally {
      loadBlogPostReactions();
    }
  };

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
        
        // Load SW scores for commenters
        const authorIds = [...new Set((data.comments || []).map((c: Comment) => c.author_id).filter(Boolean))];
        if (authorIds.length > 0) {
          try {
            const { data: swData } = await supabase
              .from('sw_scores')
              .select('user_id, total')
              .in('user_id', authorIds);
            
            if (swData) {
              const swMap: Record<string, number> = {};
              for (const row of swData as Array<{ user_id: string; total: number }>) {
                swMap[row.user_id] = row.total || 0;
              }
              setCommenterSWScores(swMap);
            }
          } catch {
            // SW scores table may not exist
            setCommenterSWScores({});
          }
        }
        
        // Load reactions for all comments
        const commentIds = (data.comments || []).map((c: Comment) => c.id);
        if (commentIds.length > 0 && user) {
          loadBlogCommentReactions(commentIds);
        }
      }
    } catch (error) {
      console.error('Error fetching comments:', error);
    }
  };
  
    const loadBlogCommentReactions = async (commentIds: number[]) => {
    if (commentIds.length === 0) return;
    
    try {
      const { data, error } = await supabase
        .from('blog_comment_reactions')
        .select('comment_id, kind, user_id')
        .in('comment_id', commentIds);
      
      if (error) {
        console.error('Failed to load blog comment reactions:', error);
        return;
      }

        const reactionsMap: Record<number, {
          counts: Record<CommentReactionType, number>;
          selected: CommentReactionType | null;
        }> = {};

      // Initialize all comments with empty counts
      commentIds.forEach(id => {
        reactionsMap[id] = {
          counts: { inspire: 0, respect: 0, relate: 0, support: 0, celebrate: 0 },
          selected: null,
        };
      });

      // Process reactions
        const reactionMap: Record<string, CommentReactionType> = {
        inspire: 'inspire',
        respect: 'inspire',
        relate: 'inspire',
        support: 'inspire',
        celebrate: 'inspire',
      };

      const userId = user?.id;
      for (const row of (data || []) as Array<{ comment_id: number; kind: string; user_id: string }>) {
        const commentId = row.comment_id;
        if (!reactionsMap[commentId]) continue;
        
        const reactionType = reactionMap[row.kind];
        if (!reactionType) continue;
        
        reactionsMap[commentId].counts.inspire = (reactionsMap[commentId].counts.inspire || 0) + 1;
        
        if (userId && row.user_id === userId) {
          reactionsMap[commentId].selected = 'inspire';
        }
      }

      setCommentReactions(prev => ({ ...prev, ...reactionsMap }));
    } catch (error) {
      console.error('Error loading blog comment reactions:', error);
    }
  };
  
    const handleBlogCommentReactionChange = async (commentId: number, reaction: CommentReactionType | null, counts?: Record<CommentReactionType, number>) => {
    if (!user) {
      alert('Sign in required');
      return;
    }

    try {
      await supabase
        .from('blog_comment_reactions')
        .delete()
        .eq('comment_id', commentId)
        .eq('user_id', user.id);

      if (reaction) {
        const { error: insertError } = await supabase
          .from('blog_comment_reactions')
          .insert({ comment_id: commentId, user_id: user.id, kind: reaction });
        if (insertError) {
          throw insertError;
        }
      }
      
      // Update local state
      setCommentReactions(prev => ({
        ...prev,
        [commentId]: {
            counts: counts || prev[commentId]?.counts || EMPTY_COUNTS,
          selected: reaction,
        },
      }));
    } catch (error: any) {
      console.error('Failed to update blog comment reaction', error);
      const message =
        error?.message || error?.details || error?.hint || 'Failed to update reaction. Please try again later.';
      alert(message);
    } finally {
      // Reload reactions for this comment
      loadBlogCommentReactions([commentId]);
    }
  };

  const handleSubmitComment = useCallback(async (parentId?: number) => {
    if (!post || !user) {
      alert('Sign in required');
      return;
    }

    if (parentId) {
      const value = (replyInput[parentId] || '').trim();
      if (!value) return;
      setReplySubmitting((prev) => ({ ...prev, [parentId]: true }));
      try {
        const response = await fetch('/api/blog/comments.create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            post_id: post.id,
            content: value,
            parent_id: parentId,
          }),
        });

        const data = await response.json();
        if (response.ok) {
          setReplyInput((prev) => ({ ...prev, [parentId]: '' }));
          setReplyOpen((prev) => ({ ...prev, [parentId]: false }));
          await fetchComments();
        } else {
          console.error('Reply creation error:', data);
          alert(data.details || data.error || 'Failed to post reply');
        }
      } catch (error) {
        console.error('Error posting reply:', error);
        alert('Failed to post reply');
      } finally {
        setReplySubmitting((prev) => ({ ...prev, [parentId]: false }));
      }
    } else {
      const value = commentContent.trim();
      if (!value) return;
      setSubmittingComment(true);
      try {
        const response = await fetch('/api/blog/comments.create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            post_id: post.id,
            content: value,
          }),
        });

        const data = await response.json();
        if (response.ok) {
          setCommentContent('');
          await fetchComments();
        } else {
          console.error('Comment creation error:', data);
          alert(data.details || data.error || 'Failed to post comment');
        }
      } catch (error) {
        console.error('Error posting comment:', error);
        alert('Failed to post comment');
      } finally {
        setSubmittingComment(false);
      }
    }
  }, [post, user, commentContent, replyInput]);


  const toggleReply = useCallback((commentId: number) => {
    setReplyOpen((prev) => ({ ...prev, [commentId]: !prev[commentId] }));
  }, []);

  const handleEditComment = useCallback((commentId: number, currentContent: string) => {
    setEditingComment((prev) => ({ ...prev, [commentId]: true }));
    setEditCommentDraft((prev) => ({ ...prev, [commentId]: currentContent }));
  }, []);

  const handleCancelEditComment = useCallback((commentId: number) => {
    setEditingComment((prev) => ({ ...prev, [commentId]: false }));
    setEditCommentDraft((prev) => {
      const newState = { ...prev };
      delete newState[commentId];
      return newState;
    });
  }, []);

  const handleUpdateComment = useCallback(async (commentId: number) => {
    if (!user) {
      alert('Sign in required');
      return;
    }

    const content = (editCommentDraft[commentId] || '').trim();
    if (!content) return;

    setUpdatingComment((prev) => ({ ...prev, [commentId]: true }));
    try {
      const response = await fetch(`/api/blog/comments.update?id=${commentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });

      const data = await response.json();
      if (response.ok) {
        setEditingComment((prev) => ({ ...prev, [commentId]: false }));
        setEditCommentDraft((prev) => {
          const newState = { ...prev };
          delete newState[commentId];
          return newState;
        });
        await fetchComments();
      } else {
        console.error('Comment update error:', data);
        alert(data.error || 'Failed to update comment');
      }
    } catch (error) {
      console.error('Error updating comment:', error);
      alert('Failed to update comment');
    } finally {
      setUpdatingComment((prev) => ({ ...prev, [commentId]: false }));
    }
  }, [user, editCommentDraft, fetchComments]);

  const handleDeleteComment = useCallback(async (commentId: number) => {
    if (!user) {
      alert('Sign in required');
      return;
    }

    if (!confirm('Delete this comment? This cannot be undone.')) return;

    setDeletingComment((prev) => ({ ...prev, [commentId]: true }));
    try {
      const response = await fetch(`/api/blog/comments.delete?id=${commentId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await fetchComments();
      } else {
        const data = await response.json();
        console.error('Comment delete error:', data);
        alert(data.error || 'Failed to delete comment');
      }
    } catch (error) {
      console.error('Error deleting comment:', error);
      alert('Failed to delete comment');
    } finally {
      setDeletingComment((prev) => ({ ...prev, [commentId]: false }));
    }
  }, [user, fetchComments]);

  // Group comments by parent_id for threaded display
  const commentsByParent = useMemo(() => {
    const map: Record<number | 'root', Comment[]> = { root: [] };
    for (const comment of comments) {
      const key = (comment.parent_id == null ? 'root' : comment.parent_id) as number | 'root';
      if (!map[key]) map[key] = [];
      map[key].push(comment);
    }
    // Sort each group by created_at to maintain chronological order
    for (const key in map) {
      map[key].sort((a, b) => 
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    }
    return map;
  }, [comments]);

  const renderThread = useCallback(
    (parentId: number | null, depth: number): JSX.Element[] => {
      const key = (parentId ?? 'root') as number | 'root';
      const list = commentsByParent[key] || [];
      return list.map((comment) => {
        const swScore = commenterSWScores[comment.author_id] ?? 0;
        const profileUrl = comment.profiles?.username 
          ? `/u/${comment.profiles.username}` 
          : `/u/${comment.author_id}`;
        
        const marginLeft = depth === 0 ? 0 : Math.min(depth * 16, 64); // 16px per level, max 64px
        const paddingLeft = depth === 0 ? 0 : Math.min(depth * 8 + 8, 32); // 8px per level + base, max 32px
        
        return (
          <div 
            key={comment.id} 
            className={`mt-4 ${depth === 0 ? '' : 'border-l-2 ' + (isLight ? 'border-slate-300' : 'border-slate-600')}`}
            style={depth > 0 ? { marginLeft: `${marginLeft}px`, paddingLeft: `${paddingLeft}px` } : {}}
          >
            <div className={`rounded-xl p-3 ${isLight ? 'bg-white shadow-sm' : 'bg-slate-800/70 shadow-md'} transition-all`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <AvatarWithBadge
                    avatarUrl={resolveAvatarUrl(comment.profiles?.avatar_url)}
                    swScore={swScore}
                    size="sm"
                    alt="avatar"
                    href={profileUrl}
                  />
                  <div className="flex flex-col min-w-0">
                    <span className={`text-sm font-medium truncate ${isLight ? 'text-slate-900' : 'text-white'}`}>
                      {comment.profiles?.full_name || comment.profiles?.username || 'Unknown'}
                    </span>
                    <time className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`} dateTime={comment.created_at}>
                      {formatDateWithTodayYesterday(comment.created_at)}
                    </time>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {user && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs"
                      onClick={() => toggleReply(comment.id)}
                    >
                      Reply
                    </Button>
                  )}
                  {user && user.id === comment.author_id && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs"
                        onClick={() => handleEditComment(comment.id, comment.content)}
                        disabled={editingComment[comment.id] || deletingComment[comment.id]}
                      >
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={`text-xs ${isLight ? 'text-red-600 hover:text-red-700' : 'text-red-400 hover:text-red-300'}`}
                        onClick={() => handleDeleteComment(comment.id)}
                        disabled={editingComment[comment.id] || deletingComment[comment.id]}
                      >
                        {deletingComment[comment.id] ? (
                          <span className="text-xs">Deleting...</span>
                        ) : (
                          <Trash2 className="w-3 h-3" />
                        )}
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {editingComment[comment.id] ? (
                <div className="mt-3 space-y-2">
                  <textarea
                    value={editCommentDraft[comment.id] || ''}
                    onChange={(event) =>
                      setEditCommentDraft((prev) => ({ ...prev, [comment.id]: event.target.value }))
                    }
                    className={`w-full rounded-lg border ${
                      isLight
                        ? 'border-slate-200 bg-transparent text-slate-900 placeholder-slate-400 focus:ring-sky-500/40'
                        : 'border-slate-700 bg-transparent text-slate-100 placeholder-slate-400 focus:ring-sky-500/40'
                    } px-3 py-2 text-sm outline-none focus:ring`}
                    placeholder="Edit comment..."
                    rows={3}
                    style={{ fontSize: '16px' }}
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleCancelEditComment(comment.id)}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={updatingComment[comment.id] || !(editCommentDraft[comment.id] || '').trim()}
                      onClick={() => handleUpdateComment(comment.id)}
                    >
                      {updatingComment[comment.id] ? 'Saving?' : 'Save'}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className={`mt-3 whitespace-pre-wrap text-sm ${isLight ? 'text-slate-700' : 'text-slate-200'}`}>
                  {formatTextWithMentions(comment.content)}
                </div>
              )}
              
              {replyOpen[comment.id] && (
                <div className="mt-3 space-y-2">
                  <textarea
                    value={replyInput[comment.id] || ''}
                    onChange={(event) =>
                      setReplyInput((prev) => ({ ...prev, [comment.id]: event.target.value }))
                    }
                    className={`w-full rounded-lg border ${
                      isLight
                        ? 'border-slate-200 bg-transparent text-slate-900 placeholder-slate-400 focus:ring-sky-500/40'
                        : 'border-slate-700 bg-transparent text-slate-100 placeholder-slate-400 focus:ring-sky-500/40'
                    } px-3 py-2 text-sm outline-none focus:ring`}
                    placeholder="Write a reply..."
                    rows={2}
                    style={{ fontSize: '16px' }}
                  />
                  <div className="flex justify-end gap-2">
                    <EmojiPicker
                      onEmojiSelect={(emoji) => {
                        setReplyInput((prev) => ({ ...prev, [comment.id]: (prev[comment.id] || '') + emoji }));
                      }}
                      variant={isLight ? 'light' : 'dark'}
                      align="right"
                      position="top"
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setReplyOpen((prev) => ({ ...prev, [comment.id]: false }));
                        setReplyInput((prev) => ({ ...prev, [comment.id]: '' }));
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={replySubmitting[comment.id] || !(replyInput[comment.id] || '').trim()}
                      onClick={() => handleSubmitComment(comment.id)}
                    >
                      {replySubmitting[comment.id] ? 'Sending?' : 'Reply'}
                    </Button>
                  </div>
                </div>
              )}
              
              {/* Comment reactions */}
              <div className="mt-3 flex items-center justify-start">
                <CommentReactions
                  commentId={comment.id}
                  initialCounts={commentReactions[comment.id]?.counts || EMPTY_COUNTS}
                  initialSelected={commentReactions[comment.id]?.selected || null}
                  onReactionChange={(reaction, counts) => handleBlogCommentReactionChange(comment.id, reaction, counts)}
                />
              </div>
            </div>
            {renderThread(comment.id, depth + 1)}
          </div>
        );
      });
    },
    [commentsByParent, commenterSWScores, isLight, user, toggleReply, replyOpen, replyInput, replySubmitting, handleSubmitComment, commentReactions, handleBlogCommentReactionChange, editingComment, editCommentDraft, updatingComment, deletingComment, handleEditComment, handleCancelEditComment, handleUpdateComment, handleDeleteComment]
  );

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
        
        {/* Post reactions */}
        <div className="mt-6 flex items-center justify-start">
          <PostReactions
            postId={post.id}
            initialCounts={postReactionCounts}
            initialSelected={postSelectedReaction}
            onReactionChange={handleBlogPostReactionChange}
          />
        </div>
      </article>

      <section className="space-y-4">
        <header className="flex items-center justify-between">
          <h2 className={`text-lg font-semibold ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
            Comments ({comments.length})
          </h2>
        </header>

        {user ? (
          <div className={`rounded-xl border ${isLight ? 'border-slate-200 bg-white' : 'border-slate-800 bg-slate-900'} p-4 shadow-sm`}>
            <textarea
              value={commentContent}
              onChange={(e) => setCommentContent(e.target.value)}
              placeholder="Write a comment?"
              rows={3}
              className={`w-full rounded-lg border ${
                isLight
                  ? 'border-slate-200 bg-transparent text-slate-900 placeholder-slate-400 focus:ring-sky-500/40'
                  : 'border-slate-700 bg-transparent text-slate-100 placeholder-slate-400 focus:ring-sky-500/40'
              } px-3 py-2 text-sm outline-none focus:ring`}
              style={{ fontSize: '16px' }}
            />
            <div className="mt-3 flex items-center justify-end gap-2">
              <EmojiPicker
                onEmojiSelect={(emoji) => {
                  setCommentContent((prev) => prev + emoji);
                }}
                variant={isLight ? 'light' : 'dark'}
                align="right"
                position="top"
              />
              <Button
                variant="primary"
                disabled={!commentContent.trim() || submittingComment}
                onClick={() => handleSubmitComment()}
              >
                {submittingComment ? 'Sending?' : 'Comment'}
              </Button>
            </div>
          </div>
        ) : (
          <div className={`rounded-xl border ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-700 bg-slate-800/30'} p-4`}>
            <p className={`text-sm ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
              Please <Link href="/login" className={`underline ${isLight ? 'text-primary-blue' : 'text-primary-blue-light'}`}>sign in</Link> to comment
            </p>
          </div>
        )}

        {comments.length === 0 ? (
          <p className={`text-sm text-center py-8 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            No comments yet. Be the first to start the conversation.
          </p>
        ) : (
          <div className="space-y-2">
            {renderThread(null, 0)}
          </div>
        )}
      </section>
    </div>
  );
}

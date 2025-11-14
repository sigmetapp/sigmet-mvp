'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Flag, X as CloseIcon, ChevronLeft, ChevronRight, Image as ImageIcon } from 'lucide-react';
import Button from '@/components/Button';
import PostReactions, { ReactionType } from '@/components/PostReactions';
import CommentReactions from '@/components/CommentReactions';
import { useTheme } from '@/components/ThemeProvider';
import PostActionMenu from '@/components/PostActionMenu';
import PostCard from '@/components/PostCard';
import { supabase } from '@/lib/supabaseClient';
import { resolveDirectionEmoji } from '@/lib/directions';
import EmojiPicker from '@/components/EmojiPicker';
import { formatTextWithMentions, hasMentions } from '@/lib/formatText';
import AvatarWithBadge from '@/components/AvatarWithBadge';
import ViewsChart from '@/components/ViewsChart';
import PostReportModal from '@/components/PostReportModal';
import PostDetailSkeleton from '@/components/PostDetailSkeleton';
import ProgressiveImage from '@/components/ProgressiveImage';
import { resolveAvatarUrl } from '@/lib/utils';

type PostRecord = {
  id: number;
  author_id: string | null;
  user_id?: string | null; // Legacy alias
  text: string | null;
  body?: string | null; // Legacy alias
  image_url?: string | null;
  video_url?: string | null;
  image_urls?: string[] | null;
  video_urls?: string[] | null;
  category: string | null;
  created_at: string;
  updated_at?: string | null;
  views?: number;
  likes_count?: number;
};

type Profile = {
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
};

type CommentRecord = {
  id: number;
  post_id: number;
  user_id?: string | null;
  author_id?: string | null;
  body?: string | null;
  text?: string | null;
  media_url: string | null;
  parent_id: number | null;
  created_at: string;
};

const AVATAR_FALLBACK =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='100%' height='100%' fill='%23222'/><circle cx='32' cy='24' r='14' fill='%23555'/><rect x='12' y='44' width='40' height='12' rx='6' fill='%23555'/></svg>";

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

function errorIncludes(error: any, phrase: string): boolean {
  if (!error || !phrase) return false;
  const normalized = phrase.toLowerCase();
  return [error.message, error.details, error.hint]
    .filter((value): value is string => typeof value === 'string')
    .some((value) => value.toLowerCase().includes(normalized));
}

const isMissingTextColumnError = (error: any) =>
  errorIncludes(error, "'text' column") || errorIncludes(error, 'text column');

const EMPTY_COUNTS: Record<ReactionType, number> = {
  verify: 0,
  inspire: 0,
  respect: 0,
  relate: 0,
  support: 0,
  celebrate: 0,
};

export type PostDetailClientProps = {
  postId: number;
  initialPost: {
    post: PostRecord;
    authorProfile: Profile | null;
    commentCount: number;
  };
};

export default function PostDetailClient({ postId, initialPost }: PostDetailClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { theme } = useTheme();
  const isLight = theme === 'light';
  
  // Check if user came from profile page
  const fromProfile = searchParams?.get('from') === 'profile';
  const profileUsername = searchParams?.get('username') || null;

  const [uid, setUid] = useState<string | null>(null);
  const [post, setPost] = useState<PostRecord>(initialPost.post);
  const [authorProfile, setAuthorProfile] = useState<Profile | null>(initialPost.authorProfile);
  const [loadingPost, setLoadingPost] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  const [reactionCounts, setReactionCounts] = useState<Record<ReactionType, number>>(EMPTY_COUNTS);
  const [selectedReaction, setSelectedReaction] = useState<ReactionType | null>(null);

  // Growth statuses from growth-directions (proud, grateful, drained)
  const [growthStatuses, setGrowthStatuses] = useState<Array<'proud' | 'grateful' | 'drained'>>([]);

  const [comments, setComments] = useState<CommentRecord[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [commenterProfiles, setCommenterProfiles] = useState<Record<string, Profile>>({});
  
  // SW scores
  const [authorSWScore, setAuthorSWScore] = useState<number>(0);
  const [commenterSWScores, setCommenterSWScores] = useState<Record<string, number>>({});

  const [commentInput, setCommentInput] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [replyOpen, setReplyOpen] = useState<Record<number, boolean>>({});
  const [replyInput, setReplyInput] = useState<Record<number, string>>({});
  const [replySubmitting, setReplySubmitting] = useState<Record<number, boolean>>({});
  const [mediaGalleryOpen, setMediaGalleryOpen] = useState<{ media: Array<{ type: 'image' | 'video'; url: string }>; currentIndex: number } | null>(null);
  const [swipeStart, setSwipeStart] = useState<{ x: number; y: number } | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  
  // Keyboard navigation for media gallery
  useEffect(() => {
    if (!mediaGalleryOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const newIndex = mediaGalleryOpen.currentIndex > 0 
          ? mediaGalleryOpen.currentIndex - 1 
          : mediaGalleryOpen.media.length - 1;
        setMediaGalleryOpen({ ...mediaGalleryOpen, currentIndex: newIndex });
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        const newIndex = mediaGalleryOpen.currentIndex < mediaGalleryOpen.media.length - 1
          ? mediaGalleryOpen.currentIndex + 1
          : 0;
        setMediaGalleryOpen({ ...mediaGalleryOpen, currentIndex: newIndex });
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setMediaGalleryOpen(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mediaGalleryOpen]);
  
  // Comment reactions state
  const [commentReactions, setCommentReactions] = useState<Record<string | number, {
    counts: Record<ReactionType, number>;
    selected: ReactionType | null;
  }>>({});

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(post.text || post.body || '');
  const [updatingPost, setUpdatingPost] = useState(false);
  const [viewsChartOpen, setViewsChartOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);

  // Directions for category matching
  const [availableDirections, setAvailableDirections] = useState<Array<{ id: string; slug: string; title: string; emoji: string }>>([]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUid(data.user?.id ?? null);
    });
  }, []);

  useEffect(() => {
    setPost(initialPost.post);
    setAuthorProfile(initialPost.authorProfile);
    setEditDraft(initialPost.post.text || initialPost.post.body || '');
  }, [initialPost]);

  // Load SW score for author only once when component mounts
  useEffect(() => {
    const authorId = initialPost.post.author_id || initialPost.post.user_id;
    if (authorId) {
      (async () => {
        try {
          const { data: swData } = await supabase
            .from('sw_scores')
            .select('total')
            .eq('user_id', authorId)
            .maybeSingle();
          if (swData) {
            setAuthorSWScore((swData.total as number) || 0);
          }
        } catch {
          // SW scores table may not exist
          setAuthorSWScore(0);
        }
      })();
    }
  }, [initialPost.post.author_id, initialPost.post.user_id]);

  const loadPost = useCallback(async () => {
    setLoadingPost(true);
    setPostError(null);
    const { data, error } = await supabase
      .from<PostRecord>('posts')
      .select('*')
      .eq('id', postId)
      .maybeSingle();
    if (error || !data) {
      setPostError('Failed to load post.');
      setLoadingPost(false);
      return;
    }
    setPost(data);
    setEditDraft(data.text || data.body || '');

    const authorId = data.author_id || data.user_id;
    if (authorId) {
      const { data: profile } = await supabase
        .from<Profile>('profiles')
        .select('username, full_name, avatar_url')
        .eq('user_id', authorId)
        .maybeSingle();
      if (profile) setAuthorProfile(profile);

      // Load SW score for author
      try {
        const { data: swData } = await supabase
          .from('sw_scores')
          .select('total')
          .eq('user_id', authorId)
          .maybeSingle();
        if (swData) {
          setAuthorSWScore((swData.total as number) || 0);
        }
      } catch {
        // SW scores table may not exist
        setAuthorSWScore(0);
      }
    }

    setLoadingPost(false);
  }, [postId]);

  const loadReactions = useCallback(async () => {
    const { data, error } = await supabase
      .from('post_reactions')
      .select('kind, user_id')
      .eq('post_id', postId);
    if (error || !data) {
      setReactionCounts(EMPTY_COUNTS);
      setSelectedReaction(null);
      return;
    }

    const counts: Record<ReactionType, number> = {
      inspire: 0,
      respect: 0,
      relate: 0,
      support: 0,
      celebrate: 0,
      verify: 0,
    };
    let selected: ReactionType | null = null;

    const reactionMap: Record<string, ReactionType> = {
      inspire: 'inspire',
      respect: 'inspire', // Migrate to inspire
      relate: 'inspire', // Migrate to inspire
      support: 'inspire', // Migrate to inspire
      celebrate: 'inspire', // Migrate to inspire
      verify: 'verify', // Verify is separate
    };

    for (const row of data as Array<{ kind: string; user_id: string }>) {
      const reactionType = reactionMap[row.kind];
      if (!reactionType) continue;
      if (reactionType === 'verify') {
        // Verify is separate
        counts.verify = (counts.verify || 0) + 1;
        if (uid && row.user_id === uid) {
          selected = 'verify';
        }
      } else {
        // All other reactions go to inspire
        counts.inspire = (counts.inspire || 0) + 1;
        if (uid && row.user_id === uid && !selected) {
          selected = 'inspire';
        }
      }
    }

    setReactionCounts(counts);
    setSelectedReaction(selected);
  }, [postId, uid]);

  const loadGrowthStatuses = useCallback(async () => {
    const { data, error } = await supabase
      .from('post_reactions')
      .select('kind')
      .eq('post_id', postId)
      .in('kind', ['proud', 'grateful', 'drained']);

    if (error || !data) {
      setGrowthStatuses([]);
      return;
    }

    const statuses = data
      .map((r) => r.kind as string)
      .filter((kind): kind is 'proud' | 'grateful' | 'drained' => 
        kind === 'proud' || kind === 'grateful' || kind === 'drained'
      );
    
    // Remove duplicates
    const uniqueStatuses = Array.from(new Set(statuses));
    setGrowthStatuses(uniqueStatuses);
  }, [postId]);

  // Load reactions and growth statuses in parallel
  useEffect(() => {
    Promise.all([loadReactions(), loadGrowthStatuses()]);
  }, [loadReactions, loadGrowthStatuses]);

  const loadComments = useCallback(async () => {
    setCommentsLoading(true);
    setCommentsError(null);
    const { data, error } = await supabase
      .from<CommentRecord>('comments')
      .select('*')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Failed to load comments:', error);
      setCommentsError('Failed to load comments.');
      setComments([]);
      setCommentsLoading(false);
      return;
    }

    // Log the data to debug structure
    if (data && data.length > 0) {
      console.log('Comments data sample:', data[0]);
      console.log('Total comments loaded:', data.length);
    } else {
      console.log('No comments found for post:', postId);
    }

    // Normalize the data to handle both schema versions
    const list = (data ?? []).map((comment: any) => ({
      ...comment,
      user_id: comment.user_id ?? comment.author_id ?? null,
      body: comment.body ?? comment.text ?? null,
    }));
    setComments(list);

    const userIds = Array.from(
      new Set(
        list
          .map((c) => c.user_id)
          .filter((value): value is string => Boolean(value))
      )
    );
    if (userIds.length > 0) {
      // Load profiles and SW scores in parallel
      const [profilesResult, swScoresResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('user_id, username, avatar_url')
          .in('user_id', userIds),
        (async () => {
          try {
            return await supabase
              .from('sw_scores')
              .select('user_id, total')
              .in('user_id', userIds);
          } catch {
            // Gracefully handle if table doesn't exist
            return { data: null, error: null };
          }
        })(),
      ]);

      // Process profiles
      if (profilesResult.data) {
        const map: Record<string, Profile> = {};
        for (const row of profilesResult.data as Array<{ user_id: string; username: string | null; avatar_url: string | null }>) {
          map[row.user_id] = { username: row.username ?? null, avatar_url: row.avatar_url ?? null };
        }
        setCommenterProfiles(map);
      }

      // Process SW scores
      if (swScoresResult.data) {
        const swMap: Record<string, number> = {};
        for (const row of swScoresResult.data as Array<{ user_id: string; total: number }>) {
          swMap[row.user_id] = row.total || 0;
        }
        setCommenterSWScores(swMap);
      } else {
        setCommenterSWScores({});
      }
    } else {
      // If no userIds, set empty maps
      setCommenterProfiles({});
      setCommenterSWScores({});
    }

    setCommentsLoading(false);
    
    // Load reactions for all comments
    if (list.length > 0) {
      loadCommentReactions(list.map(c => c.id));
    }
  }, [postId]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  const loadCommentReactions = useCallback(async (commentIds: (number | string)[]) => {
    if (commentIds.length === 0) return;
    
    try {
      const { data, error } = await supabase
        .from('comment_reactions')
        .select('comment_id, kind, user_id')
        .in('comment_id', commentIds);
      
      if (error) {
        console.error('Failed to load comment reactions:', error);
        return;
      }

      const reactionsMap: Record<string | number, {
        counts: Record<ReactionType, number>;
        selected: ReactionType | null;
      }> = {};

      // Initialize all comments with empty counts
      commentIds.forEach(id => {
        reactionsMap[id] = {
          counts: { inspire: 0, respect: 0, relate: 0, support: 0, celebrate: 0 },
          selected: null,
        };
      });

      // Process reactions
      const reactionMap: Record<string, ReactionType> = {
        inspire: 'inspire',
        respect: 'inspire',
        relate: 'inspire',
        support: 'inspire',
        celebrate: 'inspire',
      };

      for (const row of (data || []) as Array<{ comment_id: string | number; kind: string; user_id: string }>) {
        const commentId = String(row.comment_id);
        if (!reactionsMap[commentId] && !reactionsMap[row.comment_id]) continue;
        
        const reactionType = reactionMap[row.kind];
        if (!reactionType) continue;
        
        const key = reactionsMap[commentId] ? commentId : row.comment_id;
        reactionsMap[key].counts.inspire = (reactionsMap[key].counts.inspire || 0) + 1;
        
        if (uid && row.user_id === uid) {
          reactionsMap[key].selected = 'inspire';
        }
      }

      setCommentReactions(prev => ({ ...prev, ...reactionsMap }));
    } catch (error) {
      console.error('Error loading comment reactions:', error);
    }
  }, [uid]);

  const handleCommentReactionChange = useCallback(
    async (commentId: number | string, reaction: ReactionType | null, counts?: Record<ReactionType, number>) => {
      if (!uid) {
        alert('Sign in required');
        return;
      }

      try {
        await supabase
          .from('comment_reactions')
          .delete()
          .eq('comment_id', commentId)
          .eq('user_id', uid);

        if (reaction) {
          const { error: insertError } = await supabase
            .from('comment_reactions')
            .insert({ comment_id: commentId, user_id: uid, kind: reaction });
          if (insertError) {
            throw insertError;
          }
        }
        
        // Update local state
        const commentIdKey = String(commentId);
        setCommentReactions(prev => ({
          ...prev,
          [commentIdKey]: {
            counts: counts || prev[commentIdKey]?.counts || prev[commentId]?.counts || EMPTY_COUNTS,
            selected: reaction,
          },
        }));
      } catch (error: any) {
        console.error('Failed to update comment reaction', error);
        const message =
          error?.message || error?.details || error?.hint || 'Failed to update reaction. Please try again later.';
        alert(message);
      } finally {
        // Reload reactions for this comment
        loadCommentReactions([commentId]);
      }
    },
    [uid, loadCommentReactions]
  );

  // Load directions from growth-directions API
  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const res = await fetch('/api/growth/directions.list', {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (res.ok) {
          const { directions: dirs } = await res.json();
          const rawDirections = Array.isArray(dirs) ? dirs : [];
          // Map to simplified format
          const mapped = rawDirections
            .filter((dir: any) => dir.isSelected)
            .map((dir: any) => ({
              id: dir.id,
              slug: dir.slug,
              title: dir.title,
              emoji: resolveDirectionEmoji(dir.slug, dir.emoji),
            }));
          setAvailableDirections(mapped);
        }
      } catch (error) {
        console.error('Error loading directions:', error);
      }
    })();
  }, []);

  const handleReactionChange = useCallback(
    async (reaction: ReactionType | null, counts?: Record<ReactionType, number>) => {
      if (!uid) {
        alert('Sign in required');
        return;
      }

      try {
        await supabase
          .from('post_reactions')
          .delete()
          .eq('post_id', postId)
          .eq('user_id', uid);

        if (reaction) {
          const { error: insertError } = await supabase
            .from('post_reactions')
            .insert({ post_id: postId, user_id: uid, kind: reaction });
          if (insertError) {
            throw insertError;
          }
        }
      } catch (error: any) {
        console.error('Failed to update reaction', error);
        const message =
          error?.message || error?.details || error?.hint || 'Failed to update reaction. Please try again later.';
        alert(message);
      } finally {
        loadReactions();
      }
    },
    [loadReactions, postId, uid]
  );

  const handleCommentEmojiSelect = useCallback((emoji: string) => {
    setCommentInput((prev) => prev + emoji);
  }, []);

  const submitComment = useCallback(
    async (parentId?: number) => {
      if (!uid) {
        alert('Sign in required');
        return;
      }

      if (parentId) {
        const value = (replyInput[parentId] || '').trim();
        if (!value) return;
        setReplySubmitting((prev) => ({ ...prev, [parentId]: true }));
        try {
          // Try author_id first (as per schema), fallback to user_id if needed
          // Try text first, fallback to body if text column doesn't exist
          let insertData: any = {
            post_id: postId,
            text: value,
            author_id: uid,
          };
            // Only add parent_id if it exists and is valid
            if (parentId) {
              insertData.parent_id = parentId;
            }
            let { error, data } = await supabase
              .from('comments')
              .insert(insertData)
              .select('id')
              .single();

            // If text column doesn't exist, try body instead
            if (error && isMissingTextColumnError(error)) {
              insertData = {
                post_id: postId,
                body: value,
                author_id: uid,
              };
              if (parentId) {
                insertData.parent_id = parentId;
              }
              const retryResult = await supabase
                .from('comments')
                .insert(insertData)
                .select('id')
                .single();
              error = retryResult.error;
              data = retryResult.data;
            }

            // If author_id fails, try user_id instead
            if (error && (error.message?.includes('author_id') || error.message?.includes('field') || error.message?.includes('column'))) {
              insertData = {
                post_id: postId,
                text: value,
                user_id: uid,
              };
              if (parentId) {
                insertData.parent_id = parentId;
              }
              // Try body if text failed
              if (isMissingTextColumnError(error)) {
                insertData = {
                  post_id: postId,
                  body: value,
                  user_id: uid,
                };
                if (parentId) {
                  insertData.parent_id = parentId;
                }
              }
              const retryResult = await supabase
                .from('comments')
                .insert(insertData)
                .select('id')
                .single();
              error = retryResult.error;
              data = retryResult.data;
            }
          if (error) throw error;
          setReplyInput((prev) => ({ ...prev, [parentId]: '' }));
          setReplyOpen((prev) => ({ ...prev, [parentId]: false }));
          await loadComments();
        } catch (error: any) {
          console.error('Failed to add reply', error);
          alert(error?.message || 'Unable to add reply.');
        } finally {
          setReplySubmitting((prev) => ({ ...prev, [parentId]: false }));
        }
        } else {
          const value = commentInput.trim();
          if (!value) return;
          setCommentSubmitting(true);
          try {
            // Try author_id first (as per schema), fallback to user_id if needed
            // Try text first, fallback to body if text column doesn't exist
            let insertData: any = {
              post_id: postId,
              text: value,
              author_id: uid,
            };
            let { error, data } = await supabase
              .from('comments')
              .insert(insertData)
              .select('id')
              .single();
            
            // If text column doesn't exist, try body instead
            if (error && isMissingTextColumnError(error)) {
              insertData = {
                post_id: postId,
                body: value,
                author_id: uid,
              };
              const retryResult = await supabase
                .from('comments')
                .insert(insertData)
                .select('id')
                .single();
              error = retryResult.error;
              data = retryResult.data;
            }
            
            // If author_id fails, try user_id instead
            if (error && (error.message?.includes('author_id') || error.message?.includes('field') || error.message?.includes('column'))) {
              insertData = {
                post_id: postId,
                text: value,
                user_id: uid,
              };
              // Try body if text failed
              if (isMissingTextColumnError(error)) {
                insertData = {
                  post_id: postId,
                  body: value,
                  user_id: uid,
                };
              }
              const retryResult = await supabase
                .from('comments')
                .insert(insertData)
                .select('id')
                .single();
              error = retryResult.error;
              data = retryResult.data;
            }
            
            if (error) throw error;
            setCommentInput('');
            await loadComments();
          } catch (error: any) {
            console.error('Failed to add comment', error);
            alert(error?.message || 'Unable to add comment.');
          } finally {
            setCommentSubmitting(false);
          }
        }
    },
    [commentInput, loadComments, postId, replyInput, uid]
  );

  const toggleReply = useCallback((commentId: number) => {
    setReplyOpen((prev) => ({ ...prev, [commentId]: !prev[commentId] }));
  }, []);

  const updatePost = useCallback(async () => {
    const authorId = post.author_id || post.user_id;
    if (!uid || uid !== authorId) return;
    const value = editDraft.trim();
    setUpdatingPost(true);
    try {
      const updatedAt = new Date().toISOString();
      const updateData: any = { 
        text: value || null,
      };
      
      // Add updated_at if the field exists
      updateData.updated_at = updatedAt;
      
      const { data, error } = await supabase
        .from<PostRecord>('posts')
        .update(updateData)
        .eq('id', postId)
        .select('*')
        .maybeSingle();
      if (error || !data) {
        console.error('Failed to update post:', error);
        throw error;
      }
      console.log('Post updated successfully:', data);
      setPost(data);
      setEditing(false);
    } catch (error: any) {
      console.error('Failed to update post', error);
      alert(error?.message || 'Unable to update post.');
    } finally {
      setUpdatingPost(false);
    }
  }, [editDraft, post.author_id, post.user_id, postId, uid]);

  const deletePost = useCallback(async () => {
    const authorId = post.author_id || post.user_id;
    if (!uid || uid !== authorId) return;
    if (!confirm('Delete this post? This cannot be undone.')) return;
    try {
      const { error } = await supabase.from('posts').delete().eq('id', postId);
      if (error) throw error;
      router.push('/feed');
    } catch (error: any) {
      console.error('Failed to delete post', error);
      alert(error?.message || 'Unable to delete post.');
    }
  }, [post.author_id, post.user_id, postId, router, uid]);

  const handleReportSubmit = useCallback(async (complaintType: 'harassment' | 'misinformation' | 'inappropriate_content' | 'unreliable_information', description: string) => {
    if (!uid) {
      alert('Sign in required');
      return;
    }

    const postUrl = `/post/${postId}`;
    const fullPostUrl = typeof window !== 'undefined' ? `${window.location.origin}${postUrl}` : postUrl;

    try {
      const resp = await fetch('/api/tickets/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `Post Report - ${complaintType}`,
          description: description,
          post_url: fullPostUrl,
          complaint_type: complaintType,
        }),
      });

      const json = await resp.json();
      if (!resp.ok) throw new Error(json?.error || 'Failed to submit report');

      alert('Your complaint has been submitted');
      setReportModalOpen(false);
    } catch (error: any) {
      console.error('Failed to submit report:', error);
      alert(error?.message || 'Failed to submit complaint');
    }
  }, [postId, uid]);

  const commentsByParent = useMemo(() => {
    const map: Record<number | 'root', CommentRecord[]> = { root: [] } as const;
    const result: Record<number | 'root', CommentRecord[]> = { root: [] };
    for (const comment of comments) {
      const key = (comment.parent_id ?? 'root') as number | 'root';
      if (!result[key]) result[key] = [];
      result[key].push(comment);
    }
    return result;
  }, [comments]);

  const renderThread = useCallback(
    (parentId: number | null, depth: number): JSX.Element[] => {
      const key = (parentId ?? 'root') as number | 'root';
      const list = commentsByParent[key] || [];
      return list.map((comment) => {
        const commentUserId = comment.user_id ?? null;
        const profile = commentUserId ? commenterProfiles[commentUserId] : undefined;
        const username = profile?.username || (commentUserId ? commentUserId.slice(0, 8) : 'Anon');
        const avatar = resolveAvatarUrl(profile?.avatar_url) ?? AVATAR_FALLBACK;
        const swScore = commentUserId ? (commenterSWScores[commentUserId] ?? 0) : 0;
        const profileUrl = commentUserId ? (profile?.username ? `/u/${profile.username}` : `/u/${commentUserId}`) : undefined;

        return (
          <div key={comment.id} className={`mt-4 ${depth === 0 ? '' : 'ml-4 border-l border-slate-200 dark:border-slate-700 pl-4'}`}>
            <div className={`rounded-xl p-3 ${isLight ? 'bg-white shadow-sm' : 'bg-slate-800/70 shadow-md'} transition-all`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <AvatarWithBadge
                    avatarUrl={avatar}
                    swScore={swScore}
                    size="sm"
                    alt="avatar"
                    href={profileUrl}
                  />
                  <div className="flex flex-col min-w-0">
                    <span className={`text-sm font-medium truncate ${isLight ? 'text-slate-900' : 'text-white'}`}>{username}</span>
                    <time className="text-xs text-slate-500 dark:text-slate-400" dateTime={comment.created_at}>
                      {formatDateWithTodayYesterday(comment.created_at)}
                    </time>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => toggleReply(comment.id)}
                >
                  Reply
                </Button>
              </div>
              {(comment.body ?? comment.text) && (
                <p className={`mt-3 whitespace-pre-wrap text-sm ${isLight ? 'text-slate-700' : 'text-slate-200'}`}>
                  {formatTextWithMentions(comment.body ?? comment.text ?? '')}
                </p>
              )}
              {comment.media_url && (
                <div className="mt-3">
                  {comment.media_url.match(/\.(mp4|webm|ogg)(\?|$)/i) ? (
                    <video
                      controls
                      preload="metadata"
                      playsInline
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700"
                    >
                      <source src={comment.media_url} type="video/mp4" />
                      <source src={comment.media_url} />
                    </video>
                  ) : (
                    <ProgressiveImage
                      src={comment.media_url}
                      alt="comment media"
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700"
                      placeholder="blur"
                      priority={false}
                      objectFit="cover"
                    />
                  )}
                </div>
              )}

              {replyOpen[comment.id] && (
                <div className="mt-3 space-y-2">
                  <textarea
                    value={replyInput[comment.id] || ''}
                    onChange={(event) =>
                      setReplyInput((prev) => ({ ...prev, [comment.id]: event.target.value }))
                    }
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm outline-none focus:ring focus:ring-sky-500/40"
                    placeholder="Write a reply..."
                    rows={2}
                  />
                  <div className="flex justify-end gap-2">
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
                      disabled={replySubmitting[comment.id]}
                      onClick={() => submitComment(comment.id)}
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
                  initialCounts={commentReactions[comment.id]?.counts || commentReactions[String(comment.id)]?.counts || EMPTY_COUNTS}
                  initialSelected={commentReactions[comment.id]?.selected || commentReactions[String(comment.id)]?.selected || null}
                  onReactionChange={(reaction, counts) => handleCommentReactionChange(comment.id, reaction, counts)}
                />
              </div>
            </div>
            {renderThread(comment.id, depth + 1)}
          </div>
        );
      });
    },
    [commenterProfiles, commenterSWScores, isLight, replyInput, replyOpen, replySubmitting, submitComment, toggleReply, commentsByParent, commentReactions, handleCommentReactionChange]
  );

  const formattedDate = useMemo(() => {
    // Use updated_at if available, otherwise use created_at
    const dateString = post?.updated_at || post?.created_at;
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
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
      
      // For all other dates, use the original format (dateStyle: 'medium', timeStyle: 'short')
      return new Intl.DateTimeFormat('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date);
    } catch (error) {
      return new Date(dateString).toLocaleString('en-US');
    }
  }, [post?.created_at, post?.updated_at]);

  const commentCount = comments.length || initialPost.commentCount || 0;
  const avatar = resolveAvatarUrl(authorProfile?.avatar_url) ?? AVATAR_FALLBACK;
  const authorId = post.author_id || post.user_id;
  const username = authorProfile?.username || (authorId ? authorId.slice(0, 8) : 'anon');
  const fullName = authorProfile?.full_name || null;

  // Calculate total reactions count (sum of all reaction types)
  const totalReactions = useMemo(() => {
    return Object.values(reactionCounts).reduce((sum, count) => sum + count, 0);
  }, [reactionCounts]);

  // Check if post has category that matches available directions
  const hasCategory = post.category && post.category.trim() !== '';
  const categoryDirection = useMemo(() => {
    if (!hasCategory || availableDirections.length === 0) return null;
    return availableDirections.find((dir) => {
      const categoryLower = post.category?.toLowerCase() || '';
      const dirTitleLower = dir.title.toLowerCase();
      const dirSlugLower = dir.slug.toLowerCase();
      return categoryLower.includes(dirTitleLower) || 
             categoryLower.includes(dirSlugLower) ||
             dirTitleLower.includes(categoryLower) || 
             dirSlugLower.includes(categoryLower);
    }) || null;
  }, [hasCategory, post.category, availableDirections]);

  const postCard = (
    <PostCard
      post={{
        id: String(post.id),
        author: username,
        content: post.text || post.body || '',
        createdAt: post.updated_at || post.created_at,
        commentsCount: undefined, // Hide comment count in PostCard header
      }}
      disableNavigation
      className={`select-text ${isLight ? '!bg-white !border-slate-200' : '!bg-slate-900 !border-slate-800'}`}
      renderContent={(postCardPost, defaultContent) => (
        <div className="relative z-10 flex flex-col gap-2">
          {/* Header with avatar and clickable nickname */}
          <header className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <AvatarWithBadge
                avatarUrl={avatar}
                swScore={authorSWScore}
                size="sm"
                alt="avatar"
                href={`/u/${encodeURIComponent(authorProfile?.username || authorId || '')}`}
              />
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <a
                    href={`/u/${encodeURIComponent(authorProfile?.username || authorId || '')}`}
                    onClick={(e) => e.stopPropagation()}
                    className={`text-sm font-semibold truncate hover:underline ${
                      isLight ? 'text-slate-900' : 'text-slate-100'
                    }`}
                    data-prevent-card-navigation="true"
                  >
                    {username}
                  </a>
                  {(() => {
                    const postHasMentions = hasMentions(post.text || post.body || '');
                    return (fullName || post.category || postHasMentions || growthStatuses.length > 0) && (
                      <span className="text-sm text-slate-500 dark:text-slate-400">
                        |
                      </span>
                    );
                  })()}
                  {fullName && (
                    <>
                      <span className="text-sm text-slate-500 dark:text-slate-400">
                        {fullName}
                      </span>
                      {(() => {
                        const postHasMentions = hasMentions(post.text || post.body || '');
                        return (post.category || postHasMentions || growthStatuses.length > 0) && (
                          <span className="text-sm text-slate-500 dark:text-slate-400">
                            |
                          </span>
                        );
                      })()}
                    </>
                  )}
                  {post.category && (
                    <>
                      <div className={`text-xs px-2 py-1 rounded-md font-medium ${
                        hasCategory && categoryDirection
                          ? isLight
                            ? 'bg-primary-blue/25 text-primary-blue border border-primary-blue/40 shadow-sm'
                            : 'bg-primary-blue/35 text-primary-blue-light border border-primary-blue/60 shadow-sm'
                          : isLight
                          ? 'text-slate-500 bg-slate-100/50 border border-slate-200'
                          : 'text-slate-400 bg-white/5 border border-slate-700'
                      }`}>
                        {categoryDirection ? `${categoryDirection.emoji} ${post.category}` : post.category}
                      </div>
                      {(() => {
                        const postHasMentions = hasMentions(post.text || post.body || '');
                        return (postHasMentions || growthStatuses.length > 0) && (
                          <span className="text-sm text-slate-500 dark:text-slate-400">
                            |
                          </span>
                        );
                      })()}
                    </>
                  )}
                  {hasMentions(post.text || post.body || '') && (
                    <>
                      <div className={`text-xs px-2 py-1 rounded-md font-medium ${
                        isLight
                          ? 'bg-green-500/20 text-green-600 border border-green-500/30 shadow-sm'
                          : 'bg-green-500/25 text-green-400 border border-green-500/40 shadow-sm'
                      }`}>
                        Connections
                      </div>
                      {growthStatuses.length > 0 && (
                        <span className="text-sm text-slate-500 dark:text-slate-400">
                          |
                        </span>
                      )}
                    </>
                  )}
                  {growthStatuses.length > 0 && growthStatuses.map((status) => {
                    const statusConfig = {
                      proud: { emoji: String.fromCodePoint(0x1F7E2), label: 'Proud', color: isLight ? 'bg-green-500/20 text-green-600 border-green-500/30' : 'bg-green-500/25 text-green-400 border-green-500/40' },
                      grateful: { emoji: String.fromCodePoint(0x1FA75), label: 'Grateful', color: isLight ? 'bg-yellow-500/20 text-yellow-600 border-yellow-500/30' : 'bg-yellow-500/25 text-yellow-400 border-yellow-500/40' },
                      drained: { emoji: String.fromCodePoint(0x26AB), label: 'Drained', color: isLight ? 'bg-gray-500/20 text-gray-600 border-gray-500/30' : 'bg-gray-500/25 text-gray-400 border-gray-500/40' },
                    };
                    const config = statusConfig[status];
                    return (
                      <div
                        key={status}
                        className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium inline-flex items-center gap-1 border ${config.color}`}
                        title={config.label}
                      >
                        <span>{config.emoji}</span>
                        <span>{config.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            {/* Report button - only for other users' posts, positioned at top right */}
            {uid && uid !== authorId && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setReportModalOpen(true);
                }}
                className={`p-1.5 rounded-full transition z-30 shrink-0 ${
                  isLight
                    ? 'bg-white/95 hover:bg-white text-primary-text-secondary hover:text-red-600 border border-black/20 shadow-md'
                    : 'bg-black/80 hover:bg-black/90 text-primary-text-secondary hover:text-red-400 border border-white/20 shadow-md'
                }`}
                title="Report post"
                data-prevent-card-navigation="true"
              >
                <Flag className="h-3 w-3" />
              </button>
            )}
          </header>

          {/* Content */}
          <p className={`whitespace-pre-wrap text-sm leading-6 ${isLight ? 'text-slate-900' : 'text-slate-300'}`}>
            {formatTextWithMentions(postCardPost.content, post.id)}
          </p>

          {/* Media */}
          {(() => {
            const imageUrls = (post.image_urls && post.image_urls.length > 0) ? post.image_urls : (post.image_url ? [post.image_url] : []);
            const videoUrls = (post.video_urls && post.video_urls.length > 0) ? post.video_urls : (post.video_url ? [post.video_url] : []);
            const allMedia = [...imageUrls.map(url => ({ type: 'image' as const, url })), ...videoUrls.map(url => ({ type: 'video' as const, url }))];
            
            if (allMedia.length === 0) return null;
            
            const mediaCount = allMedia.length;
            const firstMedia = allMedia[0];
            
            return (
              <div 
                className="relative cursor-pointer group"
                onClick={() => setMediaGalleryOpen({ media: allMedia, currentIndex: 0 })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setMediaGalleryOpen({ media: allMedia, currentIndex: 0 });
                  }
                }}
                tabIndex={0}
                role="button"
                aria-label={`View ${mediaCount} media file${mediaCount > 1 ? 's' : ''}`}
              >
                <div className={`relative rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700`} style={{ maxHeight: '600px', aspectRatio: '16/9' }}>
                  {firstMedia.type === 'image' ? (
                    <ProgressiveImage
                      src={firstMedia.url}
                      alt={`Post preview (${mediaCount} file${mediaCount > 1 ? 's' : ''})`}
                      className="w-full h-full"
                      placeholder="blur"
                      priority={true}
                      objectFit="cover"
                    />
                  ) : (
                    <div className="w-full h-full relative bg-gray-900">
                      <video 
                        preload="metadata"
                        playsInline
                        muted
                        className="w-full h-full object-cover"
                        poster={imageUrls[0] || undefined}
                      >
                        <source src={firstMedia.url} type="video/mp4" />
                      </video>
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className={`w-16 h-16 rounded-full ${isLight ? "bg-black/50" : "bg-white/20"} flex items-center justify-center`}>
                          <svg className={`w-8 h-8 ${isLight ? "text-white" : "text-white"}`} fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z"/>
                          </svg>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Overlay with media count indicator */}
                  {mediaCount > 1 && (
                    <div className="absolute top-3 right-3 px-3 py-2 rounded-lg bg-black/80 backdrop-blur-md flex items-center gap-2 shadow-lg border border-white/20 z-10">
                      <ImageIcon className="w-5 h-5 text-white" />
                      <span className="text-base font-bold text-white">{mediaCount}</span>
                      <span className="text-xs text-white/80 font-medium">files</span>
                    </div>
                  )}
                  
                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-200 flex items-center justify-center">
                    {mediaCount > 1 && (
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white font-medium text-sm bg-black/50 px-4 py-2 rounded-lg">
                        View all {mediaCount} files
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Stats and actions */}
          <div className="flex items-center gap-3" data-prevent-card-navigation="true">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setViewsChartOpen(true);
              }}
              className="flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity text-xs text-slate-500 dark:text-slate-400"
              title="View statistics"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5">
                <path
                  d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <circle
                  cx="12"
                  cy="12"
                  r="3"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
              </svg>
              <span>{post.views ?? 0}</span>
            </button>
            <PostReactions
              postId={post.id}
              initialCounts={reactionCounts}
              initialSelected={selectedReaction}
              showVerify={true}
              onReactionChange={handleReactionChange}
            />
            <div className="ml-auto flex items-center gap-3">
              {formattedDate && (
                <time
                  dateTime={postCardPost.createdAt}
                  className="text-xs text-slate-500 dark:text-slate-400 shrink-0"
                >
                  {formattedDate}
                </time>
              )}
              {uid && uid === authorId && (
                <PostActionMenu
                  onEdit={() => setEditing(true)}
                  onDelete={() => setDeleteConfirmOpen(true)}
                  className="shrink-0"
                  data-prevent-card-navigation="true"
                />
              )}
            </div>
          </div>
        </div>
      )}
    />
  );

  return (
    <div className="mx-auto flex w-full max-w-[852px] flex-col gap-4 px-0 md:px-4 py-4 md:py-5">
      {/* Back button */}
      <div className="px-2 md:px-0">
        {fromProfile && profileUsername ? (
          <Button
            variant="ghost"
            size="md"
            icon={<ArrowLeft className="h-4 w-4" />}
            onClick={() => router.push(`/u/${encodeURIComponent(profileUsername)}`)}
            className="self-start"
          >
            Back to profile
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="md"
            icon={<ArrowLeft className="h-4 w-4" />}
            onClick={() => router.push('/feed')}
            className="self-start"
          >
            Back to feed
          </Button>
        )}
      </div>

      {postError ? (
        <div className="px-2 md:px-0">
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-600 dark:border-rose-900/40 dark:bg-rose-950/60">
            {postError}
          </div>
        </div>
      ) : loadingPost ? (
        <div className="px-0 md:px-0">
          <PostDetailSkeleton />
        </div>
      ) : (
        <article className="space-y-3 px-0 md:px-0">
          {editing ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <textarea
                value={editDraft}
                onChange={(event) => setEditDraft(event.target.value)}
                rows={6}
                className="w-full rounded-lg border border-slate-200 bg-transparent px-3 py-2 text-sm outline-none focus:ring focus:ring-sky-500/40 dark:border-slate-700"
              />
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button variant="primary" disabled={updatingPost} onClick={updatePost}>
                  {updatingPost ? 'Saving?' : 'Save'}
                </Button>
              </div>
            </div>
          ) : (
            <>
              {postCard}
              {(() => {
                // Only show "Post updated" if the post was actually edited
                // (i.e., updated_at is significantly different from created_at)
                if (!post.updated_at || !post.created_at) return null;
                
                const createdDate = new Date(post.created_at);
                const updatedDate = new Date(post.updated_at);
                
                // Check if dates are valid
                if (isNaN(createdDate.getTime()) || isNaN(updatedDate.getTime())) return null;
                
                // Normalize dates to seconds (remove milliseconds) for comparison
                // This handles cases where timestamps might differ by milliseconds only
                const createdSeconds = Math.floor(createdDate.getTime() / 1000);
                const updatedSeconds = Math.floor(updatedDate.getTime() / 1000);
                
                // Only show if difference is more than 1 hour (3600 seconds)
                // This ensures we only show the message for actual edits, not just creation
                // When a post is created, updated_at is set to the same time as created_at
                // So if they're within 1 hour, it's likely just creation, not an edit
                const diffSeconds = updatedSeconds - createdSeconds;
                if (diffSeconds <= 3600) return null;
                
                return (
                  <div className={`rounded-xl border px-4 py-3 ${
                    isLight 
                      ? 'border-slate-200 bg-slate-50/50' 
                      : 'border-slate-700 bg-slate-800/30'
                  }`}>
                    <div className="flex items-center gap-2">
                      <svg 
                        className={`h-4 w-4 ${
                          isLight ? 'text-slate-500' : 'text-slate-400'
                        }`} 
                        fill="none" 
                        viewBox="0 0 24 24" 
                        stroke="currentColor"
                      >
                        <path 
                          strokeLinecap="round" 
                          strokeLinejoin="round" 
                          strokeWidth={2} 
                          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" 
                        />
                      </svg>
                      <span className={`text-sm ${
                        isLight ? 'text-slate-600' : 'text-slate-300'
                      }`}>
                        Post updated on {formatDateWithTodayYesterday(post.updated_at)}
                      </span>
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </article>
      )}

      <section className="space-y-4 px-2 md:px-0">
        <header className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Comments ({commentCount})
          </h2>
          <Button variant="secondary" size="sm" onClick={loadComments}>
            Refresh
          </Button>
        </header>

        <div className={`rounded-xl border ${isLight ? 'border-slate-200 bg-white' : 'border-slate-800 bg-slate-900'} p-4 shadow-sm`}>
          <textarea
            value={commentInput}
            onChange={(event) => setCommentInput(event.target.value)}
            placeholder="Write a comment?"
            rows={3}
            className="w-full rounded-lg border border-slate-200 bg-transparent px-3 py-2 text-sm outline-none focus:ring focus:ring-sky-500/40 dark:border-slate-700"
            style={{ fontSize: '16px' }} // Prevent zoom on mobile
          />
          <div className="mt-3 flex items-center justify-end gap-2">
            <EmojiPicker
              onEmojiSelect={handleCommentEmojiSelect}
              variant={isLight ? 'light' : 'dark'}
              align="right"
              position="top"
            />
            <Button variant="primary" disabled={commentSubmitting} onClick={() => submitComment()}>
              {commentSubmitting ? 'Sending?' : 'Comment'}
            </Button>
          </div>
        </div>

        {commentsError && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-600 dark:border-rose-900/40 dark:bg-rose-950/60">
            {commentsError}
          </div>
        )}

        {commentsLoading ? (
          <div className="space-y-3">
            <div className="h-20 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
            <div className="h-20 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
          </div>
        ) : comments.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No comments yet. Be the first to start the conversation.</p>
        ) : (
          <div className="space-y-2">{renderThread(null, 0)}</div>
        )}
      </section>

      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteConfirmOpen(false)} />
          <div className={`relative z-10 w-full max-w-sm rounded-2xl border p-5 ${isLight ? 'border-slate-200 bg-white' : 'border-slate-700 bg-slate-900'}`}>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Delete post</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Are you sure you want to delete this post? This action cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDeleteConfirmOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" className="bg-rose-600 hover:bg-rose-700" onClick={deletePost}>
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Views Chart Modal */}
      {viewsChartOpen && (
        <ViewsChart
          postId={post.id}
          isOpen={viewsChartOpen}
          onClose={() => setViewsChartOpen(false)}
        />
      )}

      {/* Report Modal */}
      {reportModalOpen && (
        <PostReportModal
          postId={post.id}
          postUrl={`/post/${post.id}`}
          isOpen={reportModalOpen}
          onClose={() => setReportModalOpen(false)}
          onSubmit={async (complaintType, description) => {
            await handleReportSubmit(complaintType, description);
          }}
        />
      )}

      {/* Media Gallery Modal */}
      {mediaGalleryOpen && typeof window !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center">
          <div
            className={`absolute inset-0 ${isLight ? "bg-black/90" : "bg-black/95"}`}
            onClick={() => setMediaGalleryOpen(null)}
          />
          <div className="relative z-10 w-full h-full flex items-center justify-center p-4">
            <button
              onClick={() => setMediaGalleryOpen(null)}
              className={`absolute top-4 right-4 p-2 rounded-full ${isLight ? "bg-white/20 hover:bg-white/30 text-white" : "bg-white/10 hover:bg-white/20 text-white"}`}
              aria-label="Close gallery"
            >
              <CloseIcon className="h-6 w-6" />
            </button>
            
            {mediaGalleryOpen.media.length > 1 && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const newIndex = mediaGalleryOpen.currentIndex > 0 
                      ? mediaGalleryOpen.currentIndex - 1 
                      : mediaGalleryOpen.media.length - 1;
                    setMediaGalleryOpen({ ...mediaGalleryOpen, currentIndex: newIndex });
                  }}
                  className={`absolute left-4 p-3 rounded-full ${isLight ? "bg-white/20 hover:bg-white/30 text-white" : "bg-white/10 hover:bg-white/20 text-white"}`}
                  aria-label="Previous media"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const newIndex = mediaGalleryOpen.currentIndex < mediaGalleryOpen.media.length - 1
                      ? mediaGalleryOpen.currentIndex + 1
                      : 0;
                    setMediaGalleryOpen({ ...mediaGalleryOpen, currentIndex: newIndex });
                  }}
                  className={`absolute right-4 p-3 rounded-full ${isLight ? "bg-white/20 hover:bg-white/30 text-white" : "bg-white/10 hover:bg-white/20 text-white"}`}
                  aria-label="Next media"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
              </>
            )}
            
            <div className="w-full max-w-6xl max-h-[90vh] flex flex-col items-center">
              <div 
                className="relative w-full flex-1 flex items-center justify-center overflow-hidden"
                style={{ width: '100%' }}
                onTouchStart={(e) => {
                  if (mediaGalleryOpen && mediaGalleryOpen.media.length > 1) {
                    const touch = e.touches[0];
                    setSwipeStart({ x: touch.clientX, y: touch.clientY });
                    setSwipeOffset(0);
                  }
                }}
                onTouchMove={(e) => {
                  if (swipeStart && mediaGalleryOpen && mediaGalleryOpen.media.length > 1) {
                    const touch = e.touches[0];
                    const deltaX = touch.clientX - swipeStart.x;
                    const deltaY = touch.clientY - swipeStart.y;
                    
                    // Only allow horizontal swipe if horizontal movement is greater than vertical
                    if (Math.abs(deltaX) > Math.abs(deltaY)) {
                      e.preventDefault();
                      setSwipeOffset(deltaX);
                    }
                  }
                }}
                onTouchEnd={(e) => {
                  if (swipeStart && mediaGalleryOpen && mediaGalleryOpen.media.length > 1) {
                    const touch = e.changedTouches[0];
                    const deltaX = touch.clientX - swipeStart.x;
                    const deltaY = touch.clientY - swipeStart.y;
                    const minSwipeDistance = 50; // Minimum distance for swipe
                    
                    // Only trigger swipe if horizontal movement is greater than vertical
                    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > minSwipeDistance) {
                      if (deltaX > 0) {
                        // Swipe right - go to previous
                        const newIndex = mediaGalleryOpen.currentIndex > 0 
                          ? mediaGalleryOpen.currentIndex - 1 
                          : mediaGalleryOpen.media.length - 1;
                        setMediaGalleryOpen({ ...mediaGalleryOpen, currentIndex: newIndex });
                      } else {
                        // Swipe left - go to next
                        const newIndex = mediaGalleryOpen.currentIndex < mediaGalleryOpen.media.length - 1
                          ? mediaGalleryOpen.currentIndex + 1
                          : 0;
                        setMediaGalleryOpen({ ...mediaGalleryOpen, currentIndex: newIndex });
                      }
                    }
                    
                    setSwipeStart(null);
                    setSwipeOffset(0);
                  }
                }}
              >
                <div 
                  className={`flex ${swipeOffset === 0 ? 'transition-transform duration-300 ease-out' : ''}`}
                  style={{ 
                    transform: `translateX(calc(-${mediaGalleryOpen.currentIndex * 100}% + ${swipeOffset}px))`,
                    width: `${mediaGalleryOpen.media.length * 100}%`,
                    height: '100%',
                  }}
                >
                  {mediaGalleryOpen.media.map((media, idx) => (
                    <div 
                      key={idx}
                      className="w-full h-full flex-shrink-0 flex items-center justify-center"
                      style={{ width: '100%', minWidth: '100%' }}
                    >
                      {media.type === 'image' ? (
                        <img 
                          src={media.url} 
                          className="max-w-full max-h-[85vh] w-auto h-auto object-contain rounded-lg" 
                          alt={`Media ${idx + 1} of ${mediaGalleryOpen.media.length}`} 
                        />
                      ) : (
                        <video 
                          controls 
                          autoPlay={idx === mediaGalleryOpen.currentIndex}
                          className="max-w-full max-h-[85vh] w-auto h-auto rounded-lg" 
                          src={media.url}
                        >
                          <source src={media.url} type="video/mp4" />
                        </video>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              
              {mediaGalleryOpen.media.length > 1 && (
                <div className="mt-4 flex items-center gap-2">
                  <span className={`text-sm ${isLight ? "text-white/80" : "text-white/80"}`}>
                    {mediaGalleryOpen.currentIndex + 1} / {mediaGalleryOpen.media.length}
                  </span>
                  <div className="flex gap-1.5">
                    {mediaGalleryOpen.media.map((_, idx) => (
                      <button
                        key={idx}
                        onClick={(e) => {
                          e.stopPropagation();
                          setMediaGalleryOpen({ ...mediaGalleryOpen, currentIndex: idx });
                        }}
                        className={`h-1.5 rounded-full transition-all ${
                          idx === mediaGalleryOpen.currentIndex
                            ? `${isLight ? "bg-white" : "bg-white"} w-8`
                            : `${isLight ? "bg-white/40" : "bg-white/40"} w-1.5`
                        }`}
                        aria-label={`Go to media ${idx + 1}`}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

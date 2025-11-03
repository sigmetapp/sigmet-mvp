'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import Button from '@/components/Button';
import PostReactions, { ReactionType } from '@/components/PostReactions';
import { useTheme } from '@/components/ThemeProvider';
import PostActionMenu from '@/components/PostActionMenu';
import PostCard from '@/components/PostCard';
import { supabase } from '@/lib/supabaseClient';
import { resolveDirectionEmoji } from '@/lib/directions';
import EmojiPicker from '@/components/EmojiPicker';

type PostRecord = {
  id: number;
  user_id: string | null;
  body: string | null;
  image_url: string | null;
  video_url: string | null;
  category: string | null;
  created_at: string;
  views: number;
  likes_count: number;
};

type Profile = {
  username: string | null;
  avatar_url: string | null;
};

type CommentRecord = {
  id: number;
  post_id: number;
  user_id: string | null;
  body: string | null;
  media_url: string | null;
  parent_id: number | null;
  created_at: string;
};

const AVATAR_FALLBACK =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='100%' height='100%' fill='%23222'/><circle cx='32' cy='24' r='14' fill='%23555'/><rect x='12' y='44' width='40' height='12' rx='6' fill='%23555'/></svg>";

const EMPTY_COUNTS: Record<ReactionType, number> = {
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
  const { theme } = useTheme();
  const isLight = theme === 'light';

  const [uid, setUid] = useState<string | null>(null);
  const [post, setPost] = useState<PostRecord>(initialPost.post);
  const [authorProfile, setAuthorProfile] = useState<Profile | null>(initialPost.authorProfile);
  const [loadingPost, setLoadingPost] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  const [reactionCounts, setReactionCounts] = useState<Record<ReactionType, number>>(EMPTY_COUNTS);
  const [selectedReaction, setSelectedReaction] = useState<ReactionType | null>(null);

  const [comments, setComments] = useState<CommentRecord[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [commenterProfiles, setCommenterProfiles] = useState<Record<string, Profile>>({});

  const [commentInput, setCommentInput] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [replyOpen, setReplyOpen] = useState<Record<number, boolean>>({});
  const [replyInput, setReplyInput] = useState<Record<number, string>>({});
  const [replySubmitting, setReplySubmitting] = useState<Record<number, boolean>>({});

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(post.body ?? '');
  const [updatingPost, setUpdatingPost] = useState(false);

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
  }, [initialPost]);

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
    setEditDraft(data.body ?? '');

    if (data.user_id) {
      const { data: profile } = await supabase
        .from<Profile>('profiles')
        .select('username, avatar_url')
        .eq('user_id', data.user_id)
        .maybeSingle();
      if (profile) setAuthorProfile(profile);
    }

    setLoadingPost(false);
  }, [postId]);

  useEffect(() => {
    loadPost();
  }, [loadPost]);

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
    };
    let selected: ReactionType | null = null;

    const reactionMap: Record<string, ReactionType> = {
      inspire: 'inspire',
      respect: 'respect',
      relate: 'relate',
      support: 'support',
      celebrate: 'celebrate',
    };

    for (const row of data as Array<{ kind: string; user_id: string }>) {
      const reactionType = reactionMap[row.kind];
      if (!reactionType) continue;
      counts[reactionType] = (counts[reactionType] || 0) + 1;
      if (uid && row.user_id === uid) {
        selected = reactionType;
      }
    }

    setReactionCounts(counts);
    setSelectedReaction(selected);
  }, [postId, uid]);

  useEffect(() => {
    loadReactions();
  }, [loadReactions]);

  const loadComments = useCallback(async () => {
    setCommentsLoading(true);
    setCommentsError(null);
    const { data, error } = await supabase
      .from<CommentRecord>('comments')
      .select('*')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });

    if (error) {
      setCommentsError('Failed to load comments.');
      setComments([]);
      setCommentsLoading(false);
      return;
    }

    const list = data ?? [];
    setComments(list);

    const userIds = Array.from(
      new Set(
        list
          .map((c) => c.user_id)
          .filter((value): value is string => Boolean(value))
      )
    );
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, username, avatar_url')
        .in('user_id', userIds);
      if (profiles) {
        const map: Record<string, Profile> = {};
        for (const row of profiles as Array<{ user_id: string; username: string | null; avatar_url: string | null }>) {
          map[row.user_id] = { username: row.username ?? null, avatar_url: row.avatar_url ?? null };
        }
        setCommenterProfiles(map);
      }
    }

    setCommentsLoading(false);
  }, [postId]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

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
          const { error } = await supabase.from('comments').insert({
            post_id: postId,
            user_id: uid,
            body: value,
            parent_id: parentId,
          });
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
          const { error } = await supabase.from('comments').insert({
            post_id: postId,
            user_id: uid,
            body: value,
          });
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
    if (!uid || uid !== post.user_id) return;
    const value = editDraft.trim();
    setUpdatingPost(true);
    try {
      const { data, error } = await supabase
        .from<PostRecord>('posts')
        .update({ body: value || null })
        .eq('id', postId)
        .select('*')
        .maybeSingle();
      if (error || !data) throw error;
      setPost(data);
      setEditing(false);
    } catch (error: any) {
      console.error('Failed to update post', error);
      alert(error?.message || 'Unable to update post.');
    } finally {
      setUpdatingPost(false);
    }
  }, [editDraft, post.user_id, postId, uid]);

  const deletePost = useCallback(async () => {
    if (!uid || uid !== post.user_id) return;
    if (!confirm('Delete this post? This cannot be undone.')) return;
    try {
      const { error } = await supabase.from('posts').delete().eq('id', postId);
      if (error) throw error;
      router.push('/feed');
    } catch (error: any) {
      console.error('Failed to delete post', error);
      alert(error?.message || 'Unable to delete post.');
    }
  }, [post.user_id, postId, router, uid]);

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
        const profile = comment.user_id ? commenterProfiles[comment.user_id] : undefined;
        const username = profile?.username || (comment.user_id ? comment.user_id.slice(0, 8) : 'Anon');
        const avatar = profile?.avatar_url || AVATAR_FALLBACK;

        return (
          <div key={comment.id} className={`mt-4 ${depth === 0 ? '' : 'ml-4 border-l border-slate-200 dark:border-slate-700 pl-4'}`}>
            <div className={`rounded-xl p-3 ${isLight ? 'bg-white shadow-sm' : 'bg-slate-800/70 shadow-md'} transition-all`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <img src={avatar} alt="avatar" className="h-8 w-8 rounded-full object-cover border border-white/10" />
                  <div className="flex flex-col min-w-0">
                    <span className={`text-sm font-medium truncate ${isLight ? 'text-slate-900' : 'text-white'}`}>{username}</span>
                    <time className="text-xs text-slate-500 dark:text-slate-400" dateTime={comment.created_at}>
                      {new Date(comment.created_at).toLocaleString()}
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
              {comment.body && (
                <p className={`mt-3 whitespace-pre-wrap text-sm ${isLight ? 'text-slate-700' : 'text-slate-200'}`}>
                  {comment.body}
                </p>
              )}
              {comment.media_url && (
                <div className="mt-3">
                  {comment.media_url.match(/\.(mp4|webm|ogg)(\?|$)/i) ? (
                    <video
                      controls
                      preload="metadata"
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700"
                    >
                      <source src={comment.media_url} />
                    </video>
                  ) : (
                    <img
                      src={comment.media_url}
                      alt="comment media"
                      loading="lazy"
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700"
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
            </div>
            {renderThread(comment.id, depth + 1)}
          </div>
        );
      });
    },
    [commenterProfiles, isLight, replyInput, replyOpen, replySubmitting, submitComment, toggleReply, commentsByParent]
  );

  const formattedDate = useMemo(() => {
    if (!post?.created_at) return '';
    try {
      return new Intl.DateTimeFormat('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(post.created_at));
    } catch (error) {
      return new Date(post.created_at).toLocaleString('en-US');
    }
  }, [post?.created_at]);

  const commentCount = comments.length || initialPost.commentCount || 0;
  const avatar = authorProfile?.avatar_url || AVATAR_FALLBACK;
  const username = authorProfile?.username || (post.user_id ? post.user_id.slice(0, 8) : 'anon');

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
        content: post.body ?? '',
        createdAt: post.created_at,
        commentsCount: undefined, // Hide comment count in PostCard header
      }}
      disableNavigation
      className="select-text"
      renderContent={(postCardPost, defaultContent) => (
        <div className="relative z-10 flex flex-col gap-3">
          {/* Header with avatar and clickable nickname */}
          <header className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <img
                src={avatar}
                alt="avatar"
                className="h-9 w-9 rounded-full object-cover border border-white/10 shrink-0"
              />
              <div className="flex flex-col min-w-0">
                <a
                  href={`/u/${encodeURIComponent(authorProfile?.username || post.user_id || '')}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate hover:underline"
                  data-prevent-card-navigation="true"
                >
                  {username}
                </a>
                {post.category && (
                  <div className={`text-xs px-2 py-1 rounded-md font-medium inline-block mt-1 ${
                    hasCategory && categoryDirection
                      ? isLight
                        ? 'bg-telegram-blue/25 text-telegram-blue border border-telegram-blue/40 shadow-sm'
                        : 'bg-telegram-blue/35 text-telegram-blue-light border border-telegram-blue/60 shadow-sm'
                      : isLight
                      ? 'text-slate-500 bg-slate-100/50 border border-slate-200'
                      : 'text-slate-400 bg-white/5 border border-slate-700'
                  }`}>
                    {categoryDirection ? `${categoryDirection.emoji} ${post.category}` : post.category}
                  </div>
                )}
              </div>
            </div>
            {formattedDate && (
              <time
                dateTime={postCardPost.createdAt}
                className="text-xs text-slate-500 dark:text-slate-400 shrink-0"
              >
                {formattedDate}
              </time>
            )}
          </header>

          {/* Content */}
          <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-slate-300">
            {postCardPost.content}
          </p>

          {/* Media */}
          {(post.image_url || post.video_url) && (
            <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
              {post.image_url && (
                <img
                  src={post.image_url}
                  alt="Post media"
                  className="w-full object-cover"
                  loading="lazy"
                />
              )}
              {post.video_url && (
                <video controls preload="metadata" className="w-full">
                  <source src={post.video_url} />
                </video>
              )}
            </div>
          )}

          {/* Stats and actions */}
          <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
            <span>{post.views ?? 0} views</span>
            <span>{totalReactions} likes</span>
            <span>{commentCount} comments</span>
          </div>

          <div className="flex items-center justify-between gap-3" data-prevent-card-navigation="true">
            <PostReactions
              postId={post.id}
              initialCounts={reactionCounts}
              initialSelected={selectedReaction}
              onReactionChange={handleReactionChange}
            />
            {uid && uid === post.user_id && (
              <PostActionMenu
                onEdit={() => setEditing(true)}
                onDelete={() => setDeleteConfirmOpen(true)}
                className="shrink-0"
                data-prevent-card-navigation="true"
              />
            )}
          </div>
        </div>
      )}
    />
  );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 md:py-8">
      {/* Back button */}
      <Button
        variant="ghost"
        size="md"
        icon={<ArrowLeft className="h-4 w-4" />}
        onClick={() => router.push('/feed')}
        className="self-start"
      >
        Back to feed
      </Button>

      {postError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-600 dark:border-rose-900/40 dark:bg-rose-950/60">
          {postError}
        </div>
      ) : loadingPost ? (
        <div className="h-48 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
      ) : (
        <article className="space-y-4">
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
            postCard
          )}
        </article>
      )}

      <section className="space-y-4">
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
          />
          <div className="mt-3 flex items-center justify-end gap-2">
            <EmojiPicker
              onEmojiSelect={handleCommentEmojiSelect}
              variant={isLight ? 'light' : 'dark'}
              align="right"
              position="top"
            />
            <Button variant="primary" disabled={commentSubmitting} onClick={() => submitComment()}>
              {commentSubmitting ? 'Sending?' : 'Post'}
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
    </div>
  );
}

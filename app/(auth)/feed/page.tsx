'use client';

import {
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
} from "react";
import { supabase } from "@/lib/supabaseClient";
import { RequireAuth } from "@/components/RequireAuth";
import Button from "@/components/Button";
import PostCard from "@/components/PostCard";
import { useTheme } from "@/components/ThemeProvider";
import PostReactions, { ReactionType } from "@/components/PostReactions";
import PostActionMenu from "@/components/PostActionMenu";
import PostCommentsBadge from "@/components/PostCommentsBadge";
import { useRouter } from "next/navigation";
import { resolveDirectionEmoji } from "@/lib/directions";

export default function FeedPage() {
  return (
    <RequireAuth>
      <FeedInner />
    </RequireAuth>
  );
}

type Post = {
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

type Comment = {
  id: number;
  post_id: number;
  user_id: string | null;
  body: string | null;
  media_url?: string | null;
  parent_id?: number | null;
  created_at: string;
};

function FeedInner() {
  const router = useRouter();
  const { theme } = useTheme();
  const isLight = theme === "light";

  const AVATAR_FALLBACK =
    "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='100%' height='100%' fill='%23222'/><circle cx='32' cy='24' r='14' fill='%23555'/><rect x='12' y='44' width='40' height='12' rx='6' fill='%23555'/></svg>";
  const [text, setText] = useState("");
  const [img, setImg] = useState<File | null>(null);
  const [vid, setVid] = useState<File | null>(null);
  const unifiedFileRef = useRef<HTMLInputElement>(null);

  const [uid, setUid] = useState<string | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);

  // Map author user_id -> profile info (username, avatar)
  const [profilesByUserId, setProfilesByUserId] = useState<Record<string, { username: string | null; avatar_url: string | null }>>({});

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editBody, setEditBody] = useState<string>("");
  const [openComments, setOpenComments] = useState<Record<number, boolean>>({});
  const [commentInput, setCommentInput] = useState<Record<number, string>>({});
  const [replyInput, setReplyInput] = useState<Record<number, string>>({});
  const [replyOpen, setReplyOpen] = useState<Record<number, boolean>>({});
  const [commentFile, setCommentFile] = useState<Record<number, File | null>>({});
  const [comments, setComments] = useState<Record<number, Comment[]>>({});
  const [commentCounts, setCommentCounts] = useState<Record<number, number>>({});
  const [commentScores, setCommentScores] = useState<Record<number, number>>({});
  const [myCommentVotes, setMyCommentVotes] = useState<Record<number, -1 | 0 | 1>>({});
  const [commenterProfiles, setCommenterProfiles] = useState<Record<string, { username: string | null; avatar_url: string | null }>>({});
  const [likedByMe, setLikedByMe] = useState<Set<number>>(new Set());
  const viewedOnce = useRef<Set<number>>(new Set());

  // Post reactions state
  const [reactionsByPostId, setReactionsByPostId] = useState<
    Record<number, Record<ReactionType, number>>
  >({});
  const [selectedReactionsByPostId, setSelectedReactionsByPostId] = useState<
    Record<number, ReactionType | null>
  >({});

  // Directions from growth-directions API
  const [availableDirections, setAvailableDirections] = useState<Array<{ id: string; slug: string; title: string; emoji: string }>>([]);
  const [myDirections, setMyDirections] = useState<string[]>([]);
  const [activeDirection, setActiveDirection] = useState<string | null>(null);

  const loadFeed = useCallback(async (directionId?: string | null) => {
    setLoading(true);
    let query = supabase
      .from("posts")
      .select("*");
    
    // Filter by direction if specified
    if (directionId && availableDirections.length > 0) {
      const direction = availableDirections.find((dir) => dir.id === directionId);
      if (direction) {
        // Filter posts where category matches direction title or slug
        query = query.or(`category.ilike.%${direction.title}%,category.ilike.%${direction.slug}%`);
      }
    }
    
    const { data, error } = await query
      .order("created_at", { ascending: false })
      .limit(50);
    if (!error && data) {
      setPosts(data as Post[]);
      // Preload comment counts for visible posts
      preloadCommentCounts(data as Post[]);

      // Preload author profiles (username, avatar)
      const userIds = Array.from(
        new Set((data as Post[]).map((p) => p.user_id).filter((x): x is string => Boolean(x)))
      );
      if (userIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, username, avatar_url")
          .in("user_id", userIds);
        if (profs) {
          const map: Record<string, { username: string | null; avatar_url: string | null }> = {};
          for (const p of profs as any[]) {
            map[p.user_id as string] = { username: p.username ?? null, avatar_url: p.avatar_url ?? null };
          }
          setProfilesByUserId(map);
        }
      }
    }
    setLoading(false);
  }, [availableDirections]);

  // page mount
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUid(data.user?.id ?? null));
    // Initial load - load all posts without filter
    loadFeed(null);
  }, [loadFeed]);

  // Reload feed when active direction changes
  useEffect(() => {
    if (availableDirections.length > 0) {
      loadFeed(activeDirection);
    }
  }, [activeDirection, availableDirections, loadFeed]);

  // Load directions from growth-directions API - only primary (priority) directions
  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) return;

      // Load available directions from API
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
          // Filter only primary (priority) directions that are selected and not in development
          const directionsInDevelopment = ['creativity', 'mindfulness_purpose', 'relationships', 'career', 'finance'];
          const mapped = rawDirections
            .filter((dir: any) => {
              const isInDevelopment = directionsInDevelopment.includes(dir.slug);
              return dir.isSelected && dir.isPrimary === true && !isInDevelopment;
            })
            .map((dir: any) => ({
              id: dir.id,
              slug: dir.slug,
              title: dir.title,
              emoji: resolveDirectionEmoji(dir.slug, dir.emoji),
            }));
          setAvailableDirections(mapped);

          // Use primary directions IDs directly (no need to check profile)
          const priorityIds = mapped.map((dir) => dir.id);
          
          setMyDirections(priorityIds);
          // Default to "All" (null) instead of first direction
          setActiveDirection(null);
        }
      } catch (error) {
        console.error('Error loading directions:', error);
      }
    })();
  }, []);


  // preload likes state for my user
  useEffect(() => {
    if (!uid || posts.length === 0) return;
    (async () => {
      const ids = posts.map((p) => p.id);
      const { data } = await supabase
        .from("post_likes")
        .select("post_id")
        .eq("user_id", uid)
        .in("post_id", ids);
      setLikedByMe(new Set((data || []).map((r) => r.post_id as number)));
    })();
  }, [uid, posts]);

  // Load reactions for posts
  useEffect(() => {
    if (posts.length === 0) return;
    (async () => {
      try {
        const ids = posts.map((p) => p.id);
        // Map new reaction types to DB types (for now, we'll use the kind field as-is)
        // Note: You may need to update the DB schema to support new reaction types
        const { data } = await supabase
          .from("post_reactions")
          .select("post_id, kind, user_id")
          .in("post_id", ids);

        const counts: Record<number, Record<ReactionType, number>> = {};
        const selected: Record<number, ReactionType | null> = {};

        for (const post of posts) {
          counts[post.id] = {
            inspire: 0,
            respect: 0,
            relate: 0,
            support: 0,
            celebrate: 0,
          };
          selected[post.id] = null;
        }

        if (data) {
          for (const r of data as any[]) {
            const pid = r.post_id as number;
            const kind = r.kind as string;
            const userId = r.user_id as string;

            // Map DB reaction types to component types
            const reactionMap: Record<string, ReactionType> = {
              inspire: 'inspire',
              respect: 'respect',
              relate: 'relate',
              support: 'support',
              celebrate: 'celebrate',
            };

            const reactionType = reactionMap[kind];
            if (reactionType && counts[pid]) {
              counts[pid][reactionType] = (counts[pid][reactionType] || 0) + 1;
              if (uid && userId === uid) {
                selected[pid] = reactionType;
              }
            }
          }
        }

        setReactionsByPostId(counts);
        setSelectedReactionsByPostId(selected);
      } catch (error) {
        console.error('Error loading reactions:', error);
        // Initialize with zeros even on error
        const counts: Record<number, Record<ReactionType, number>> = {};
        const selected: Record<number, ReactionType | null> = {};
        for (const post of posts) {
          counts[post.id] = {
            inspire: 0,
            respect: 0,
            relate: 0,
            support: 0,
            celebrate: 0,
          };
          selected[post.id] = null;
        }
        setReactionsByPostId(counts);
        setSelectedReactionsByPostId(selected);
      }
    })();
  }, [uid, posts]);

  // --- uploads
  async function uploadToStorage(file: File, folder: "images" | "videos") {
    const ext = file.name.split(".").pop() || "bin";
    const path = `${folder}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.${ext}`;
    const bucket = supabase.storage.from("posts");
    const { error } = await bucket.upload(path, file, {
      upsert: false,
      contentType: file.type,
    });
    if (error) throw error;
    const { data } = bucket.getPublicUrl(path);
    return data.publicUrl as string;
  }

  async function uploadCommentToStorage(file: File) {
    const ext = file.name.split(".").pop() || "bin";
    const path = `media/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const bucket = supabase.storage.from("comments");
    const { error } = await bucket.upload(path, file, {
      upsert: false,
      contentType: file.type,
    });
    if (error) throw error;
    const { data } = bucket.getPublicUrl(path);
    return data.publicUrl as string;
  }

  // --- create post
  async function onPublish() {
    if (!uid) return alert("Sign in required");
    if (!text && !img && !vid) return alert("Post cannot be empty");
    setPublishing(true);
    try {
      let image_url: string | null = null;
      let video_url: string | null = null;
      if (img) image_url = await uploadToStorage(img, "images");
      if (vid) video_url = await uploadToStorage(vid, "videos");
      const { data, error } = await supabase
        .from("posts")
        .insert({ user_id: uid, body: text || null, image_url, video_url })
        .select("*")
        .single();
      if (error) throw error;
      if (data) {
        const newPost = data as Post;
        setPosts((prev) => [newPost, ...prev]);
        setCommentCounts((prev) => ({ ...prev, [newPost.id]: 0 }));
        
        // Track first post activity
        const { trackUserActivity } = await import("@/lib/invite-tracking");
        await trackUserActivity(uid, "first_post");
      }
      setText("");
      setImg(null);
      setVid(null);
      setComposerOpen(false);
    } catch (err: any) {
      alert(err.message || "Publish error");
    } finally {
      setPublishing(false);
    }
  }

  // --- views via RPC
  async function addViewOnce(postId: number) {
    if (viewedOnce.current.has(postId)) return;
    viewedOnce.current.add(postId);
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId ? { ...p, views: (p.views ?? 0) + 1 } : p
      )
    );
    try {
      const { error } = await supabase.rpc("increment_post_views", {
        p_id: postId,
      });
      if (error) throw error;
    } catch {
      const current = posts.find((p) => p.id === postId)?.views ?? 0;
      await supabase
        .from("posts")
        .update({ views: current + 1 })
        .eq("id", postId);
    }
  }

  // --- likes
  async function toggleLike(post: Post) {
    if (!uid) return alert("Sign in required");
    const isLiked = likedByMe.has(post.id);

    if (!isLiked) {
      const { error } = await supabase
        .from("post_likes")
        .insert({ post_id: post.id, user_id: uid });
      if (!error) {
        setLikedByMe((prev) => new Set(prev).add(post.id));
        setPosts((prev) =>
          prev.map((p) =>
            p.id === post.id
              ? { ...p, likes_count: (p.likes_count ?? 0) + 1 }
              : p
          )
        );
      }
    } else {
      const { error } = await supabase
        .from("post_likes")
        .delete()
        .eq("post_id", post.id)
        .eq("user_id", uid);
      if (!error) {
        setLikedByMe((prev) => {
          const next = new Set(prev);
          next.delete(post.id);
          return next;
        });
        setPosts((prev) =>
          prev.map((p) =>
            p.id === post.id
              ? { ...p, likes_count: Math.max(0, (p.likes_count ?? 1) - 1) }
              : p
          )
        );
      }
    }
  }


  // --- edit/delete
  async function deletePost(p: Post) {
    const { error } = await supabase.from("posts").delete().eq("id", p.id);
    if (error) return alert(error.message);
    setPosts((prev) => prev.filter((x) => x.id !== p.id));
  }

  async function saveEdit(p: Post) {
    const { data, error } = await supabase
      .from("posts")
      .update({ body: editBody })
      .eq("id", p.id)
      .select("*")
      .single();
    if (!error && data) {
      setPosts((prev) =>
        prev.map((x) => (x.id === p.id ? (data as Post) : x))
      );
      setEditingId(null);
    }
  }

  // --- comments
  async function preloadCommentCounts(list: Post[]) {
    try {
      const ids = list.map((p) => p.id);
      const { data } = await supabase
        .from("comments")
        .select("post_id")
        .in("post_id", ids);
      const counts: Record<number, number> = {};
      for (const row of (data as any[]) || []) {
        const pid = row.post_id as number;
        counts[pid] = (counts[pid] || 0) + 1;
      }
      setCommentCounts(counts);
    } catch {
      // fallback: leave zeroes
    }
  }

  async function loadComments(postId: number) {
    const { data, error, count } = await supabase
      .from("comments")
      .select("*", { count: "exact" })
      .eq("post_id", postId)
      .order("created_at", { ascending: true });
    if (!error && data) {
      setComments((prev) => ({ ...prev, [postId]: data as Comment[] }));
      setCommentCounts((prev) => ({ ...prev, [postId]: count ?? data.length }));

      // Preload commenter profiles
      const uids = Array.from(
        new Set((data as any[]).map((c) => c.user_id).filter((x): x is string => Boolean(x)))
      );
      if (uids.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, username, avatar_url")
          .in("user_id", uids);
        if (profs) {
          setCommenterProfiles((prev) => {
            const map = { ...prev };
            for (const p of profs as any[]) {
              map[p.user_id as string] = { username: p.username ?? null, avatar_url: p.avatar_url ?? null };
            }
            return map;
          });
        }
      }

      // Preload votes for these comments
      try {
        const cids = (data as any[]).map((c) => c.id as number);
        const { data: votes } = await supabase
          .from("comment_votes")
          .select("comment_id, user_id, value")
          .in("comment_id", cids);
        if (votes) {
          const scoreMap: Record<number, number> = {};
          const myMap: Record<number, -1 | 0 | 1> = {};
          for (const v of votes as any[]) {
            const cid = v.comment_id as number;
            const val = Number(v.value) as -1 | 1;
            scoreMap[cid] = (scoreMap[cid] || 0) + val;
            if (v.user_id === uid) myMap[cid] = val;
          }
          setCommentScores((prev) => ({ ...prev, ...scoreMap }));
          setMyCommentVotes((prev) => ({ ...prev, ...myMap }));
        }
      } catch {
        // ignore if table missing
      }
    }
  }

  async function addComment(postId: number, parentId?: number | null) {
    if (!uid) return alert("Sign in required");
    const text = (commentInput[postId] || "").trim();
    const file = commentFile[postId] || null;
    if (!text && !file) return;
    try {
      let media_url: string | null = null;
      if (file) {
        media_url = await uploadCommentToStorage(file);
      }
      const { data, error } = await supabase
        .from("comments")
        .insert({ post_id: postId, user_id: uid, body: text || null, media_url, parent_id: parentId || null })
        .select("*")
        .single();
      if (error) throw error;
      if (data) {
        setComments((prev) => ({ ...prev, [postId]: [...(prev[postId] || []), data as Comment] }));
        setCommentCounts((prev) => ({ ...prev, [postId]: (prev[postId] || 0) + 1 }));
        setCommentInput((prev) => ({ ...prev, [postId]: "" }));
        setCommentFile((prev) => ({ ...prev, [postId]: null }));
      }
    } catch (e: any) {
      alert(e.message || "Failed to add comment");
    }
  }

  async function voteComment(commentId: number, value: -1 | 1) {
    if (!uid) return alert("Sign in required");
    const current = myCommentVotes[commentId] || 0;
    const next = current === value ? 0 : value; // toggle if same
    try {
      if (next === 0) {
        await supabase
          .from("comment_votes")
          .delete()
          .eq("comment_id", commentId)
          .eq("user_id", uid);
      } else if (current === 0) {
        await supabase
          .from("comment_votes")
          .insert({ comment_id: commentId, user_id: uid, value: next });
      } else {
        await supabase
          .from("comment_votes")
          .update({ value: next })
          .eq("comment_id", commentId)
          .eq("user_id", uid);
      }
      setMyCommentVotes((prev) => ({ ...prev, [commentId]: next }));
      setCommentScores((prev) => ({ ...prev, [commentId]: (prev[commentId] || 0) + (next - (current || 0)) }));
    } catch (e) {
      // ignore
    }
  }

  // icons
  const Eye = () => (
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
  );

  const Pencil = () => (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M16.862 3.487a1.75 1.75 0 0 1 2.476 2.476l-10.3 10.3a4 4 0 0 1-1.694 1.01l-3.2.914.914-3.2a4 4 0 0 1 1.01-1.694l10.294-10.306Z" />
      <path d="M15 5l4 4" />
    </svg>
  );

  const Trash = () => (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 7h16" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    </svg>
  );

  const Plus = () => (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 md:py-8">
      {/* Page header */}
      <div className="mb-6 md:mb-8">
        <div>
          <h1 className={`text-2xl md:text-3xl font-semibold tracking-tight ${isLight ? "bg-gradient-to-r from-telegram-blue to-telegram-blue-light bg-clip-text text-transparent" : "gradient-text"}`}>Your feed</h1>
        </div>
      </div>

      <div className="max-w-3xl mx-auto space-y-6">
        {/* Directions toggle (selected in profile) */}
        {myDirections.length > 0 && availableDirections.length > 0 && (
          <div className="card p-3 md:p-4">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setActiveDirection(null)}
                className={`px-3 py-1.5 rounded-full text-sm transition border ${
                  activeDirection === null
                    ? isLight
                      ? "bg-telegram-blue text-white border-telegram-blue shadow-[0_2px_8px_rgba(51,144,236,0.25)]"
                      : "bg-telegram-blue text-white border-telegram-blue shadow-[0_2px_8px_rgba(51,144,236,0.3)]"
                    : isLight
                    ? "text-telegram-text-secondary border-telegram-blue/20 hover:bg-telegram-blue/10 hover:text-telegram-blue"
                    : "text-telegram-text-secondary border-telegram-blue/30 hover:bg-telegram-blue/15 hover:text-telegram-blue-light"
                }`}
              >
                All
              </button>
              {myDirections.map((id) => {
                const meta = availableDirections.find((a) => a.id === id);
                const slug = meta ? meta.slug : '';
                const emoji = meta ? meta.emoji : resolveDirectionEmoji(slug, null);
                const title = meta ? meta.title : id;
                const label = `${emoji} ${title}`;
                const active = activeDirection === id;
                return (
                  <button
                    key={id}
                    onClick={() => setActiveDirection(active ? null : id)}
                    className={`px-3 py-1.5 rounded-full text-sm transition border ${
                      active
                        ? isLight
                          ? "bg-telegram-blue text-white border-telegram-blue shadow-[0_2px_8px_rgba(51,144,236,0.25)]"
                          : "bg-telegram-blue text-white border-telegram-blue shadow-[0_2px_8px_rgba(51,144,236,0.3)]"
                        : isLight
                        ? "text-telegram-text-secondary border-telegram-blue/20 hover:bg-telegram-blue/10 hover:text-telegram-blue"
                        : "text-telegram-text-secondary border-telegram-blue/30 hover:bg-telegram-blue/15 hover:text-telegram-blue-light"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Feed */}
        {loading ? (
          <div className={isLight ? "text-telegram-text-secondary" : "text-telegram-text-secondary"}>Loading?</div>
        ) : (
          posts.map((p) => {
            const profile = p.user_id ? profilesByUserId[p.user_id] : undefined;
            const avatar = profile?.avatar_url || AVATAR_FALLBACK;
            const username = profile?.username || (p.user_id ? p.user_id.slice(0, 8) : "Unknown");
            const commentCount = commentCounts[p.id] ?? 0;
            
            // Check if post has category that matches available directions
            const hasCategory = p.category && p.category.trim() !== '';
            const categoryDirection = hasCategory && availableDirections.find((dir) => {
              const categoryLower = p.category?.toLowerCase() || '';
              const dirTitleLower = dir.title.toLowerCase();
              const dirSlugLower = dir.slug.toLowerCase();
              return categoryLower.includes(dirTitleLower) || 
                     categoryLower.includes(dirSlugLower) ||
                     dirTitleLower.includes(categoryLower) ||
                     dirSlugLower.includes(categoryLower);
            });

            return (
              <PostCard
                key={p.id}
                post={{
                  id: String(p.id),
                  author: username,
                  content: p.body ?? '',
                  createdAt: p.created_at,
                  commentsCount: commentCount,
                }}
                disableNavigation={true}
                className={`telegram-card-feature md:p-6 space-y-2 relative transition-transform duration-200 ease-out ${
                  hasCategory && categoryDirection
                    ? 'ring-2 ring-telegram-blue border-2 border-telegram-blue/60 shadow-lg bg-gradient-to-br from-telegram-blue/5 to-telegram-blue-light/5'
                    : ''
                }`}
                onMouseEnter={() => addViewOnce(p.id)}
                renderContent={() => (
                  <div className="relative z-10 space-y-2">
                    {/* header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0 flex-1 pr-2">
                        <img
                          src={avatar}
                          alt="avatar"
                          className="h-9 w-9 rounded-full object-cover border border-white/10 shrink-0"
                        />
                        <div className="flex flex-col min-w-0">
                          <a 
                            href={`/u/${p.user_id}`}
                            onClick={(e) => e.stopPropagation()}
                            className={`text-sm truncate hover:underline ${isLight ? "text-telegram-text" : "text-telegram-text"}`}
                            data-prevent-card-navigation="true"
                          >
                            {username}
                          </a>
                          {p.category && (
                            <div className={`text-xs px-2 py-1 rounded-md font-medium inline-block mt-1 ${
                              hasCategory && categoryDirection
                                ? isLight
                                  ? 'bg-telegram-blue/25 text-telegram-blue border border-telegram-blue/40 shadow-sm'
                                  : 'bg-telegram-blue/35 text-telegram-blue-light border border-telegram-blue/60 shadow-sm'
                                : isLight
                                ? 'text-telegram-text-secondary bg-telegram-bg-secondary/50'
                                : 'text-telegram-text-secondary bg-white/5'
                            }`}>
                              {categoryDirection ? `${categoryDirection.emoji} ${p.category}` : p.category}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className={`relative flex items-center gap-2 text-xs shrink-0 ${isLight ? "text-telegram-text-secondary" : "text-telegram-text-secondary"}`}>
                        <span className="whitespace-nowrap">{new Date(p.created_at).toLocaleString()}</span>
                        {uid === p.user_id && editingId !== p.id && (
                          <div onClick={(e) => e.stopPropagation()} data-prevent-card-navigation="true">
                            <PostActionMenu
                              onEdit={() => {
                                setEditingId(p.id);
                                setEditBody(p.body || "");
                              }}
                              onDelete={() => deletePost(p)}
                              className="ml-2"
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* content */}
                    {editingId === p.id ? (
                      <div className="space-y-3">
                        <textarea
                          value={editBody}
                          onChange={(e) => setEditBody(e.target.value)}
                          className={`input w-full rounded-2xl p-3 ${isLight ? "placeholder-telegram-text-secondary/60" : "placeholder-telegram-text-secondary/50"}`}
                        />
                        <div className="flex gap-2">
                          <Button onClick={() => saveEdit(p)} variant="primary">Save</Button>
                          <Button onClick={() => setEditingId(null)} variant="secondary">Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <div 
                        className="relative cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/post/${p.id}`);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            router.push(`/post/${p.id}`);
                          }
                        }}
                        tabIndex={0}
                        role="button"
                        aria-label="Open post"
                      >
                        {p.body && <p className={`leading-relaxed break-words ${isLight ? "text-telegram-text" : "text-telegram-text"}`}>{p.body}</p>}
                        {p.image_url && (
                          <img src={p.image_url} loading="lazy" className={`w-full rounded-2xl border ${isLight ? "border-telegram-blue/20" : "border-telegram-blue/30"}`} alt="post image" />
                        )}
                        {p.video_url && (
                          <video controls preload="metadata" className={`w-full rounded-2xl border ${isLight ? "border-telegram-blue/20" : "border-telegram-blue/30"}`}>
                            <source src={p.video_url} />
                          </video>
                        )}
                      </div>
                    )}

                    {/* footer */}
                    <div className={`flex items-center gap-5 ${isLight ? "text-telegram-text-secondary" : "text-telegram-text-secondary"}`}>
                      <div className="flex items-center gap-1" title="Views">
                        <Eye />
                        <span className="text-sm">{p.views ?? 0}</span>
                      </div>

                      <div onClick={(e) => e.stopPropagation()} data-prevent-card-navigation="true">
                        <PostReactions
                          postId={p.id}
                          initialCounts={reactionsByPostId[p.id] || {
                            inspire: 0,
                            respect: 0,
                            relate: 0,
                            support: 0,
                            celebrate: 0,
                          }}
                          initialSelected={selectedReactionsByPostId[p.id] || null}
                          onReactionChange={async (reaction, counts) => {
                          if (!uid) {
                            alert("Sign in required");
                            return;
                          }

                          try {
                            const previousReaction = selectedReactionsByPostId[p.id];

                            if (previousReaction) {
                              const { error: deleteError } = await supabase
                                .from("post_reactions")
                                .delete()
                                .eq("post_id", p.id)
                                .eq("user_id", uid)
                                .eq("kind", previousReaction);
                              if (deleteError) {
                                console.error("Error deleting reaction:", deleteError);
                                throw deleteError;
                              }
                            }

                            if (reaction) {
                              const { error: insertError } = await supabase
                                .from("post_reactions")
                                .insert({
                                  post_id: p.id,
                                  user_id: uid,
                                  kind: reaction,
                                });
                              if (insertError) {
                                console.error("Error inserting reaction:", insertError);
                                if (insertError.code === '23514' || insertError.message?.includes('check constraint')) {
                                  throw new Error(`Reaction type '${reaction}' is not allowed. Please apply migration 129_add_new_post_reaction_types.sql`);
                                }
                                throw insertError;
                              }
                            }

                            const { data } = await supabase
                              .from("post_reactions")
                              .select("post_id, kind, user_id")
                              .eq("post_id", p.id);

                            const newCounts: Record<ReactionType, number> = {
                              inspire: 0,
                              respect: 0,
                              relate: 0,
                              support: 0,
                              celebrate: 0,
                            };

                            if (data) {
                              for (const r of data as any[]) {
                                const kind = r.kind as string;
                                const reactionMap: Record<string, ReactionType> = {
                                  inspire: 'inspire',
                                  respect: 'respect',
                                  relate: 'relate',
                                  support: 'support',
                                  celebrate: 'celebrate',
                                };
                                const reactionType = reactionMap[kind];
                                if (reactionType) {
                                  newCounts[reactionType] = (newCounts[reactionType] || 0) + 1;
                                }
                              }
                            }

                            setReactionsByPostId((prev) => ({
                              ...prev,
                              [p.id]: newCounts,
                            }));
                            setSelectedReactionsByPostId((prev) => ({
                              ...prev,
                              [p.id]: reaction,
                            }));
                          } catch (error: any) {
                            console.error("Error updating reaction:", error);
                            const errorMessage = error?.message || error?.details || error?.hint || "Unknown error";

                            if (errorMessage.includes("table") && errorMessage.includes("not found") ||
                                errorMessage.includes("schema cache")) {
                              alert(`Database table not found. Please apply migration 130_create_post_reactions_if_not_exists.sql`);
                            } else {
                              alert(`Failed to update reaction: ${errorMessage}`);
                            }
                          }
                        }}
                        />
                      </div>

                      <PostCommentsBadge
                        count={commentCount}
                        size="md"
                        onOpen={async () => {
                          const willOpen = !openComments[p.id];
                          setOpenComments((prev) => ({ ...prev, [p.id]: willOpen }));
                          if (willOpen && !(comments[p.id]?.length > 0)) {
                            await loadComments(p.id);
                          }
                        }}
                        onFocusComposer={() => {
                          const composer = document.getElementById(`comment-composer-${p.id}`);
                          if (composer) {
                            composer.focus();
                            composer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                          }
                        }}
                        className="ml-auto"
                      />
                    </div>

                    {/* comments */}
                    {openComments[p.id] && (
                      <div className="space-y-2">
                        {(() => {
                          const list = comments[p.id] || [];
                          const byParent: Record<number | "root", Comment[]> = { root: [] } as any;
                          for (const c of list) {
                            const pid = (c.parent_id as number | null) ?? null;
                            const key = (pid ?? "root") as any;
                            if (!byParent[key]) byParent[key] = [] as any;
                            byParent[key].push(c);
                          }
                          const renderThread = (parentId: number | null, depth: number): JSX.Element[] => {
                            const key = (parentId ?? "root") as any;
                            const children = byParent[key] || [];
                            return children.map((c) => (
                              <div key={c.id} className={`mt-2 ${depth === 0 ? "" : "ml-4"}`}>
                                <div className={`telegram-card-glow rounded-xl p-2 text-sm ${isLight ? "" : ""}`}>
                                  <div className={`text-xs flex items-center justify-between ${isLight ? "text-telegram-text-secondary" : "text-telegram-text-secondary"}`}>
                                    <div className="flex items-center gap-2 min-w-0">
                                      {(() => {
                                        const commentProfile = c.user_id ? commenterProfiles[c.user_id] : undefined;
                                        const commentAvatar = commentProfile?.avatar_url || AVATAR_FALLBACK;
                                        const commentUsername = commentProfile?.username || (c.user_id ? c.user_id.slice(0, 8) : "Anon");
                                        return (
                                          <>
                                            <img src={commentAvatar} alt="avatar" className="h-6 w-6 rounded-full object-cover border border-white/10" />
                                            <span className="truncate">{commentUsername}</span>
                                          </>
                                        );
                                      })()}
                                    </div>
                                    <span>{new Date(c.created_at).toLocaleString()}</span>
                                  </div>
                                  {c.body && <div className={`mt-1 whitespace-pre-wrap ${isLight ? "text-telegram-text" : "text-telegram-text"}`}>{c.body}</div>}
                                  {c.media_url && (
                                    c.media_url.match(/\.(mp4|webm|ogg)(\?|$)/i) ? (
                                      <video controls preload="metadata" className={`mt-2 w-full rounded-xl border ${isLight ? "border-telegram-blue/20" : "border-telegram-blue/30"}`}>
                                        <source src={c.media_url} />
                                      </video>
                                    ) : (
                                      <img
                                        src={c.media_url}
                                        loading="lazy"
                                        className={`mt-2 rounded-xl border max-h-80 object-contain ${isLight ? "border-telegram-blue/20" : "border-telegram-blue/30"}`}
                                        alt="comment media"
                                      />
                                    )
                                  )}
                                  <div className="mt-2 flex items-center gap-2 text-xs">
                                    <button
                                      onClick={() => voteComment(c.id, 1)}
                                      className={`px-2 py-1 rounded-lg border transition ${
                                        myCommentVotes[c.id] === 1
                                          ? isLight
                                            ? "bg-emerald-500 text-white border-emerald-500"
                                            : "bg-emerald-400 text-white border-emerald-400"
                                          : isLight
                                          ? "border-telegram-blue/30 hover:bg-emerald-50"
                                          : "border-telegram-blue/30 hover:bg-emerald-400/10"
                                      }`}
                                    >
                                      +
                                    </button>
                                    <div className="min-w-[2ch] text-center text-white/80">{commentScores[c.id] || 0}</div>
                                    <button
                                      onClick={() => voteComment(c.id, -1)}
                                      className={`px-2 py-1 rounded-lg border ${
                                        myCommentVotes[c.id] === -1 ? "bg-rose-300 text-black border-rose-300" : "border-white/20 hover:bg-white/10"
                                      }`}
                                    >
                                      -
                                    </button>
                                    <button
                                      onClick={() => setReplyOpen((prev) => ({ ...prev, [c.id]: !prev[c.id] }))}
                                      className="ml-2 px-2 py-1 rounded-lg border border-white/20 hover:bg-white/10"
                                    >
                                      Reply
                                    </button>
                                  </div>
                                  {replyOpen[c.id] && (
                                    <div className="mt-2 flex items-center gap-2">
                                      <input
                                        value={replyInput[c.id] || ""}
                                        onChange={(e) => setReplyInput((prev) => ({ ...prev, [c.id]: e.target.value }))}
                                        placeholder="Write a reply?"
                                        className={`input py-2 focus:ring-0 ${isLight ? "placeholder-telegram-text-secondary/60" : "placeholder-telegram-text-secondary/50"}`}
                                      />
                                      <button
                                        onClick={() => {
                                          addComment(p.id, c.id);
                                          setReplyOpen((prev) => ({ ...prev, [c.id]: false }));
                                          setReplyInput((prev) => ({ ...prev, [c.id]: "" }));
                                        }}
                                        className="btn btn-primary"
                                      >
                                        Reply
                                      </button>
                                    </div>
                                  )}
                                </div>
                                {renderThread(c.id, depth + 1)}
                              </div>
                            ));
                          };
                          return <>{renderThread(null, 0)}</>;
                        })()}
                        <div className="flex gap-2 items-center">
                          <input
                            id={`comment-composer-${p.id}`}
                            value={commentInput[p.id] || ""}
                            onChange={(e) =>
                              setCommentInput((prev) => ({
                                ...prev,
                                [p.id]: e.target.value,
                              }))
                            }
                            placeholder="Write a comment?"
                            className={`input py-2 focus:ring-0 ${isLight ? "placeholder-telegram-text-secondary/60" : "placeholder-telegram-text-secondary/50"}`}
                          />
                          <input
                            id={`cfile-${p.id}`}
                            type="file"
                            accept="image/*,video/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0] || null;
                              setCommentFile((prev) => ({ ...prev, [p.id]: file }));
                            }}
                          />
                          <label htmlFor={`cfile-${p.id}`} className={`px-3 py-2 rounded-xl border text-sm cursor-pointer transition ${
                            isLight
                              ? "border-telegram-blue/30 text-telegram-blue hover:bg-telegram-blue/10"
                              : "border-telegram-blue/30 text-telegram-blue-light hover:bg-telegram-blue/15"
                          }`}>
                            ??
                          </label>
                          {commentFile[p.id] && (
                            <span className={`text-xs truncate max-w-[120px] ${isLight ? "text-telegram-text-secondary" : "text-telegram-text-secondary"}`}>{commentFile[p.id]?.name}</span>
                          )}
                          <button onClick={() => addComment(p.id)} className="btn btn-primary">
                            Send
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              />
            );
          })
        )}
      </div>

      {/* Create Post button - positioned at bottom right, 12px from posts edge */}
      <Button
        onClick={() => setComposerOpen(true)}
        variant="primary"
        className="fixed bottom-6 right-[max(1rem,calc(50vw+min(24rem,(100vw-2rem)/2)+12px))] shadow-lg z-40 rounded-full px-6 py-4 text-base"
        icon={<Plus />}
      >
        Create post
      </Button>

      {/* Composer modal */}
      {composerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className={`absolute inset-0 ${isLight ? "bg-black/50" : "bg-black/80"}`}
            onClick={() => !publishing && setComposerOpen(false)}
          />
          <div className="relative z-10 w-full max-w-xl mx-auto p-4">
            <div className={`telegram-card-glow p-4 md:p-6 space-y-4 ${isLight ? "" : ""}`}>
              <div className="flex items-center justify-between">
                <div className={`font-medium ${isLight ? "text-telegram-text" : "text-telegram-text"}`}>Create post</div>
                <button
                  onClick={() => !publishing && setComposerOpen(false)}
                  className={`transition ${isLight ? "text-telegram-text-secondary hover:text-telegram-blue" : "text-telegram-text-secondary hover:text-telegram-blue-light"}`}
                  aria-label="Close"
                >
                  ?
                </button>
              </div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="What do you want to share?"
                className={`input w-full outline-none min-h-[120px] text.base md:text-lg ${isLight ? "placeholder-telegram-text-secondary/60" : "placeholder-telegram-text-secondary/50"}`}
              />
              <input
                ref={unifiedFileRef}
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  if (!file) { setImg(null); setVid(null); return; }
                  if (file.type.startsWith("image/")) { setImg(file); setVid(null); }
                  else if (file.type.startsWith("video/")) { setVid(file); setImg(null); }
                  else { setImg(null); setVid(null); }
                }}
              />
              <div className="flex items-center gap-3">
                <button
                  onClick={() => unifiedFileRef.current?.click()}
                  className={`px-3 py-2 rounded-xl border text-sm transition ${
                    isLight
                      ? "border-telegram-blue/30 text-telegram-blue hover:bg-telegram-blue/10"
                      : "border-telegram-blue/30 text-telegram-blue-light hover:bg-telegram-blue/15"
                  }`}
                >
                  ?? Media
                </button>
                {(img || vid) && (
                  <span className={`text-sm ${isLight ? "text-telegram-text-secondary" : "text-telegram-text-secondary"}`}>
                    {img ? `Image: ${img.name}` : vid ? `Video: ${vid.name}` : ""}
                  </span>
                )}
                <div className="ml-auto">
                  <Button onClick={onPublish} disabled={publishing} variant="primary">
                    {publishing ? "Publishing?" : "Publish"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

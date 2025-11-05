'use client';

import {
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
} from "react";
import { supabase } from "@/lib/supabaseClient";
import Button from "@/components/Button";
import PostCard from "@/components/PostCard";
import { useTheme } from "@/components/ThemeProvider";
import PostReactions, { ReactionType } from "@/components/PostReactions";
import PostActionMenu from "@/components/PostActionMenu";
import PostCommentsBadge from "@/components/PostCommentsBadge";
import { useRouter } from "next/navigation";
import { resolveDirectionEmoji } from "@/lib/directions";
import EmojiPicker from "@/components/EmojiPicker";
import MentionInput from "@/components/MentionInput";
import { Image as ImageIcon, Paperclip, X as CloseIcon } from "lucide-react";
import { formatTextWithMentions } from "@/lib/formatText";
import ViewsChart from "@/components/ViewsChart";

function formatPostDate(dateString: string): string {
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
  const datePart = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
  
  // Format: "Nov 3, 2025, 11:04 AM"
  return `${datePart}, ${timePart}`;
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

export type PostFeedProps = {
  filterUserId?: string | null; // Filter posts by user_id (for profile page)
  showFilters?: boolean; // Show filter buttons (All, Discuss, Directions)
  showComposer?: boolean; // Show "Create post" button
  backToProfileUsername?: string | null; // If set, add from=profile parameter when navigating to post
  className?: string;
  renderFiltersOutside?: boolean; // If true, filters will be rendered outside via renderFilters prop
  renderFilters?: (filters: React.ReactNode) => void; // Callback to render filters externally
};

export default function PostFeed({
  filterUserId = null,
  showFilters = true,
  showComposer = true,
  backToProfileUsername = null,
  className = "",
  renderFiltersOutside = false,
  renderFilters,
}: PostFeedProps) {
  const router = useRouter();
  const { theme } = useTheme();
  const isLight = theme === "light";

  const AVATAR_FALLBACK =
    "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='100%' height='100%' fill='%23222'/><circle cx='32' cy='24' r='14' fill='%23555'/><rect x='12' y='44' width='40' height='12' rx='6' fill='%23555'/></svg>";
  const DISCUSS_EMOJI = String.fromCodePoint(0x1F4AC); // speech bubble emoji
  const [text, setText] = useState("");
  const [img, setImg] = useState<File | null>(null);
  const [vid, setVid] = useState<File | null>(null);
  const unifiedFileRef = useRef<HTMLInputElement>(null);

  const [uid, setUid] = useState<string | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);

  // Map author user_id -> profile info (username, full_name, avatar)
  const [profilesByUserId, setProfilesByUserId] = useState<Record<string, { username: string | null; full_name: string | null; avatar_url: string | null }>>({});

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editBody, setEditBody] = useState<string>("");
  const [openComments, setOpenComments] = useState<Record<number, boolean>>({});
  const [commentInput, setCommentInput] = useState<Record<number, string>>({});
  const [replyInput, setReplyInput] = useState<Record<number, string>>({});
  const [replyOpen, setReplyOpen] = useState<Record<number, boolean>>({});
  const [commentFile, setCommentFile] = useState<Record<number, File | null>>({});
  const [viewsChartOpen, setViewsChartOpen] = useState<number | null>(null);
  
  const handleEmojiSelect = useCallback((emoji: string) => {
    setText((prev) => prev + emoji);
  }, []);
  
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

  // Growth statuses from growth-directions (proud, grateful, drained)
  const [growthStatusesByPostId, setGrowthStatusesByPostId] = useState<
    Record<number, Array<'proud' | 'grateful' | 'drained'>>
  >({});

  // Directions from growth-directions API
  const [availableDirections, setAvailableDirections] = useState<Array<{ id: string; slug: string; title: string; emoji: string }>>([]);
  const [myDirections, setMyDirections] = useState<string[]>([]);
  const [activeDirection, setActiveDirection] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'discuss' | 'direction'>( 'all');

  const loadFeed = useCallback(async (directionId?: string | null, filterType?: 'all' | 'discuss' | 'direction') => {
    setLoading(true);
    let query = supabase
      .from("posts")
      .select("*");
    
    // Filter by user_id if provided (for profile page)
    if (filterUserId) {
      query = query.eq('user_id', filterUserId);
    }
    
    // Apply filter based on filterType
    if (filterType === 'discuss') {
      // Filter posts that contain "?" in body (body must not be null and not empty)
      query = query
        .not('body', 'is', null)
        .not('body', 'eq', '')
        .ilike('body', '%?%');
    } else if (filterType === 'direction' && directionId && availableDirections.length > 0) {
      const direction = availableDirections.find((dir) => dir.id === directionId);
      if (direction) {
        // Filter posts where category matches direction title or slug
        query = query.or(`category.ilike.%${direction.title}%,category.ilike.%${direction.slug}%`);
      }
    }
    // filterType === 'all' means no additional filtering
    
    const { data, error } = await query
      .order("created_at", { ascending: false })
      .limit(50);
    if (!error && data) {
      setPosts(data as Post[]);
      // Preload comment counts for visible posts
      preloadCommentCounts(data as Post[]);

      // Preload author profiles (username, full_name, avatar)
      const userIds = Array.from(
        new Set((data as Post[]).map((p) => p.user_id).filter((x): x is string => Boolean(x)))
      );
      if (userIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, username, full_name, avatar_url")
          .in("user_id", userIds);
        if (profs) {
          const map: Record<string, { username: string | null; full_name: string | null; avatar_url: string | null }> = {};
          for (const p of profs as any[]) {
            map[p.user_id as string] = { 
              username: p.username ?? null, 
              full_name: p.full_name ?? null,
              avatar_url: p.avatar_url ?? null 
            };
          }
          setProfilesByUserId(map);
        }
      }
    }
    setLoading(false);
  }, [availableDirections, filterUserId]);

  // page mount
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUid(data.user?.id ?? null));
    // Initial load - load all posts without filter
    loadFeed(null, 'all');
  }, [loadFeed]);

  // Reload feed when active filter or direction changes
  useEffect(() => {
    if (!showFilters) {
      // If filters are hidden, just load all posts (or filtered by user_id)
      loadFeed(null, 'all');
      return;
    }
    
    if (activeFilter === 'discuss') {
      loadFeed(null, 'discuss');
    } else if (activeFilter === 'direction') {
      if (availableDirections.length > 0) {
        loadFeed(activeDirection, 'direction');
      }
    } else {
      // activeFilter === 'all'
      loadFeed(null, 'all');
    }
  }, [activeFilter, activeDirection, availableDirections, loadFeed, showFilters]);

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
              respect: 'inspire', // Migrate to inspire
              relate: 'inspire', // Migrate to inspire
              support: 'inspire', // Migrate to inspire
              celebrate: 'inspire', // Migrate to inspire
            };

            const reactionType = reactionMap[kind];
            if (reactionType && counts[pid]) {
              // All reactions go to inspire
              counts[pid].inspire = (counts[pid].inspire || 0) + 1;
              if (uid && userId === uid) {
                selected[pid] = 'inspire';
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

  // Load growth statuses (proud, grateful, drained) for posts
  useEffect(() => {
    if (posts.length === 0) return;
    (async () => {
      try {
        const ids = posts.map((p) => p.id);
        const { data } = await supabase
          .from('post_reactions')
          .select('post_id, kind')
          .in('post_id', ids)
          .in('kind', ['proud', 'grateful', 'drained']);

        const statusesByPost: Record<number, Array<'proud' | 'grateful' | 'drained'>> = {};
        
        for (const post of posts) {
          statusesByPost[post.id] = [];
        }

        if (data) {
          for (const r of data as any[]) {
            const pid = r.post_id as number;
            const kind = r.kind as string;
            if ((kind === 'proud' || kind === 'grateful' || kind === 'drained') && statusesByPost[pid] !== undefined) {
              const status = kind as 'proud' | 'grateful' | 'drained';
              if (!statusesByPost[pid].includes(status)) {
                statusesByPost[pid].push(status);
              }
            }
          }
        }

        setGrowthStatusesByPostId(statusesByPost);
      } catch (error) {
        console.error('Error loading growth statuses:', error);
        const statusesByPost: Record<number, Array<'proud' | 'grateful' | 'drained'>> = {};
        for (const post of posts) {
          statusesByPost[post.id] = [];
        }
        setGrowthStatusesByPostId(statusesByPost);
      }
    })();
  }, [posts]);

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
      
      // Also increment view history
      try {
        await supabase.rpc("increment_post_view_history", {
          p_post_id: postId,
          p_date: new Date().toISOString().split('T')[0], // Current date in YYYY-MM-DD format
        });
      } catch (historyError) {
        // Silently fail if history table doesn't exist yet
        console.warn('Failed to update view history:', historyError);
      }
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

  const Plus = () => (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );


  // Build post URL with optional back to profile parameter
  const getPostUrl = useCallback((postId: number) => {
    if (backToProfileUsername) {
      return `/post/${postId}?from=profile&username=${encodeURIComponent(backToProfileUsername)}`;
    }
    return `/post/${postId}`;
  }, [backToProfileUsername]);

  // Build filters JSX
  const filtersJSX = useMemo(() => {
    if (!showFilters) return null;
    
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => {
            setActiveFilter('all');
            setActiveDirection(null);
          }}
          className={`px-3 py-1.5 rounded-full text-sm transition border ${
            activeFilter === 'all'
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
        <button
          onClick={() => {
            setActiveFilter('discuss');
            setActiveDirection(null);
          }}
          className={`px-3 py-1.5 rounded-full text-sm transition border ${
            activeFilter === 'discuss'
              ? isLight
                ? "bg-telegram-blue text-white border-telegram-blue shadow-[0_2px_8px_rgba(51,144,236,0.25)]"
                : "bg-telegram-blue text-white border-telegram-blue shadow-[0_2px_8px_rgba(51,144,236,0.3)]"
              : isLight
              ? "text-telegram-text-secondary border-telegram-blue/20 hover:bg-telegram-blue/10 hover:text-telegram-blue"
              : "text-telegram-text-secondary border-telegram-blue/30 hover:bg-telegram-blue/15 hover:text-telegram-blue-light"
          }`}
        >
          {DISCUSS_EMOJI} Discuss
        </button>
        {myDirections.length > 0 && availableDirections.length > 0 && myDirections.map((id) => {
          const meta = availableDirections.find((a) => a.id === id);
          const slug = meta ? meta.slug : '';
          const emoji = meta ? meta.emoji : resolveDirectionEmoji(slug, null);
          const title = meta ? meta.title : id;
          const label = `${emoji} ${title}`;
          const active = activeFilter === 'direction' && activeDirection === id;
          return (
            <button
              key={id}
              onClick={() => {
                if (active) {
                  // Toggle off: switch back to 'all'
                  setActiveFilter('all');
                  setActiveDirection(null);
                } else {
                  // Toggle on: switch to 'direction' filter
                  setActiveFilter('direction');
                  setActiveDirection(id);
                }
              }}
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
    );
  }, [showFilters, activeFilter, activeDirection, myDirections, availableDirections, isLight, DISCUSS_EMOJI]);

  // Render filters externally if requested
  useEffect(() => {
    if (renderFiltersOutside && renderFilters) {
      renderFilters(filtersJSX);
    }
  }, [renderFiltersOutside, renderFilters, filtersJSX]);

  return (
    <div className={className}>
      {/* Filters toggle - render inside if not rendering outside */}
      {showFilters && !renderFiltersOutside && (
        <div className="card p-3 md:p-4 mb-6">
          {filtersJSX}
        </div>
      )}

      {/* Create Post button - positioned next to posts */}
      {showComposer && (
        <div className="flex justify-center mb-4">
          <Button
            onClick={() => setComposerOpen(true)}
            variant="primary"
            className="shadow-lg z-40 rounded-full px-6 py-4 text-base"
            icon={<Plus />}
          >
            Create post
          </Button>
        </div>
      )}

      {/* Feed */}
      <div className="space-y-3">
        {loading ? (
          <div className={isLight ? "text-telegram-text-secondary" : "text-telegram-text-secondary"}>Loading?</div>
        ) : (
          posts.map((p) => {
            const profile = p.user_id ? profilesByUserId[p.user_id] : undefined;
            const avatar = profile?.avatar_url || AVATAR_FALLBACK;
            const username = profile?.username || (p.user_id ? p.user_id.slice(0, 8) : "Unknown");
            const fullName = profile?.full_name || null;
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
                className={`card p-3 md:p-4 space-y-2 relative transition-transform duration-200 ease-out w-[68%] mx-auto ${
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
                          <div className="flex items-center gap-2 flex-wrap">
                            <a 
                              href={`/u/${p.user_id}`}
                              onClick={(e) => e.stopPropagation()}
                              className={`text-sm truncate hover:underline ${isLight ? "text-telegram-text" : "text-telegram-text"}`}
                              data-prevent-card-navigation="true"
                            >
                              {username}
                            </a>
                            {(fullName || p.category || (growthStatusesByPostId[p.id] && growthStatusesByPostId[p.id].length > 0)) && (
                              <span className={`text-sm ${isLight ? "text-telegram-text-secondary" : "text-telegram-text-secondary"}`}>
                                |
                              </span>
                            )}
                            {fullName && (
                              <>
                                <span className={`text-sm ${isLight ? "text-telegram-text-secondary" : "text-telegram-text-secondary"}`}>
                                  {fullName}
                                </span>
                                {(p.category || (growthStatusesByPostId[p.id] && growthStatusesByPostId[p.id].length > 0)) && (
                                  <span className={`text-sm ${isLight ? "text-telegram-text-secondary" : "text-telegram-text-secondary"}`}>
                                    |
                                  </span>
                                )}
                              </>
                            )}
                            {p.category && (
                              <>
                                <div className={`text-xs px-2 py-1 rounded-md font-medium ${
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
                                {(growthStatusesByPostId[p.id] && growthStatusesByPostId[p.id].length > 0) && (
                                  <span className={`text-sm ${isLight ? "text-telegram-text-secondary" : "text-telegram-text-secondary"}`}>
                                    |
                                  </span>
                                )}
                              </>
                            )}
                            {growthStatusesByPostId[p.id] && growthStatusesByPostId[p.id].length > 0 && growthStatusesByPostId[p.id].map((status) => {
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
                      <div className={`relative flex items-center gap-2 text-xs shrink-0 ${isLight ? "text-telegram-text-secondary" : "text-telegram-text-secondary"}`}>
                        <span className="whitespace-nowrap">{formatPostDate(p.created_at)}</span>
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
                          router.push(getPostUrl(p.id));
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            router.push(getPostUrl(p.id));
                          }
                        }}
                        tabIndex={0}
                        role="button"
                        aria-label="Open post"
                      >
                        {p.body && <p className={`leading-relaxed break-words ${isLight ? "text-telegram-text" : "text-telegram-text"}`}>{formatTextWithMentions(p.body)}</p>}
                        {p.image_url && (
                          <div className="mt-3 flex justify-center">
                            <img 
                              src={p.image_url} 
                              loading="lazy" 
                              className={`max-w-full max-h-[500px] w-auto h-auto rounded-none border object-contain ${isLight ? "border-telegram-blue/20" : "border-telegram-blue/30"}`} 
                              alt="post image" 
                            />
                          </div>
                        )}
                        {p.video_url && (
                          <div className="mt-3 flex justify-center">
                            <video 
                              controls 
                              preload="metadata" 
                              className={`max-w-full max-h-[500px] w-auto h-auto rounded-none border ${isLight ? "border-telegram-blue/20" : "border-telegram-blue/30"}`}
                            >
                              <source src={p.video_url} />
                            </video>
                          </div>
                        )}
                      </div>
                    )}

                    {/* footer */}
                    <div className={`flex items-center gap-5 ${isLight ? "text-telegram-text-secondary" : "text-telegram-text-secondary"}`}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setViewsChartOpen(p.id);
                        }}
                        className="flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity"
                        title="View statistics"
                        data-prevent-card-navigation="true"
                      >
                        <Eye />
                        <span className="text-sm">{p.views ?? 0}</span>
                      </button>

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
                                  respect: 'inspire', // Migrate to inspire
                                  relate: 'inspire', // Migrate to inspire
                                  support: 'inspire', // Migrate to inspire
                                  celebrate: 'inspire', // Migrate to inspire
                                };
                                const reactionType = reactionMap[kind];
                                if (reactionType) {
                                  // All reactions go to inspire
                                  newCounts.inspire = (newCounts.inspire || 0) + 1;
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
                        onOpen={() => {
                          const willOpen = !openComments[p.id];
                          setOpenComments((prev) => ({ ...prev, [p.id]: willOpen }));
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

                    {/* Quick comment form only - no history */}
                    {openComments[p.id] && (
                      <div className="mt-3">
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
                            className={`input py-2 focus:ring-0 flex-1 ${isLight ? "placeholder-telegram-text-secondary/60" : "placeholder-telegram-text-secondary/50"}`}
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
                          <label
                            htmlFor={`cfile-${p.id}`}
                            className={`px-3 py-2 rounded-xl border text-sm cursor-pointer transition flex items-center justify-center gap-2 ${
                              isLight
                                ? "border-telegram-blue/30 text-telegram-blue hover:bg-telegram-blue/10"
                                : "border-telegram-blue/30 text-telegram-blue-light hover:bg-telegram-blue/15"
                            }`}
                          >
                            <Paperclip className="h-4 w-4" aria-hidden="true" />
                            <span className="sr-only">Attach file</span>
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

      {/* Composer modal */}
      {showComposer && composerOpen && (
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
                      aria-label="Close composer"
                    >
                      <CloseIcon className="h-5 w-5" aria-hidden="true" />
                    </button>
                  </div>
                  <div className={`flex items-start gap-2 px-3 py-2 rounded-lg border ${isLight ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-amber-900/20 border-amber-700/30 text-amber-300"}`}>
                    <svg className="h-5 w-5 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                      <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                    </svg>
                    <span className="text-sm font-medium">Publish only your own content, do not use AI-generated content or content from others.</span>
                  </div>
                  <MentionInput
                    value={text}
                    onChange={setText}
                    placeholder="What do you want to share?"
                    className={`input w-full outline-none min-h-[120px] text-base md:text-lg ${isLight ? "placeholder-telegram-text-secondary/60" : "placeholder-telegram-text-secondary/50"}`}
                    userId={uid}
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
                    <EmojiPicker
                      onEmojiSelect={handleEmojiSelect}
                      variant={isLight ? 'light' : 'dark'}
                      align="left"
                    />
                    <button
                      onClick={() => unifiedFileRef.current?.click()}
                      className={`px-3 py-2 rounded-xl border text-sm transition flex items-center gap-2 ${
                        isLight
                          ? "border-telegram-blue/30 text-telegram-blue hover:bg-telegram-blue/10"
                          : "border-telegram-blue/30 text-telegram-blue-light hover:bg-telegram-blue/15"
                      }`}
                    >
                      <ImageIcon className="h-4 w-4" aria-hidden="true" />
                      <span>Media</span>
                    </button>
                    {(img || vid) && (
                      <span className={`text-sm ${isLight ? "text-telegram-text-secondary" : "text-telegram-text-secondary"}`}>
                        {img ? `Image: ${img.name}` : vid ? `Video: ${vid.name}` : ""}
                      </span>
                    )}
                    <div className="ml-auto">
                      <Button onClick={onPublish} disabled={publishing} variant="primary">
                        {publishing ? "Publishing..." : "Publish"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
      )}

      {/* Views Chart Modal */}
      {viewsChartOpen && (
        <ViewsChart
          postId={viewsChartOpen}
          isOpen={true}
          onClose={() => setViewsChartOpen(null)}
        />
      )}
    </div>
  );
}

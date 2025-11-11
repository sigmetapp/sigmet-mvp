'use client';

import {
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from 'framer-motion';
import { supabase } from "@/lib/supabaseClient";
import Button from "@/components/Button";
import PostCard from "@/components/PostCard";
import { useTheme } from "@/components/ThemeProvider";
import PostReactions, { ReactionType } from "@/components/PostReactions";
import PostActionMenu from "@/components/PostActionMenu";
import PostCommentsBadge from "@/components/PostCommentsBadge";
import PostReportModal from "@/components/PostReportModal";
import Toast from "@/components/Toast";
import { useRouter } from "next/navigation";
import { resolveDirectionEmoji } from "@/lib/directions";
import EmojiPicker from "@/components/EmojiPicker";
import MentionInput from "@/components/MentionInput";
import { Image as ImageIcon, Paperclip, X as CloseIcon, Flag, UserPlus, HelpCircle } from "lucide-react";
import { formatTextWithMentions, hasMentions } from "@/lib/formatText";
import ViewsChart from "@/components/ViewsChart";
import AvatarWithBadge from "@/components/AvatarWithBadge";
import PostSkeleton from "@/components/PostSkeleton";
import { resolveAvatarUrl } from "@/lib/utils";
import { useSWLevels } from "@/hooks/useSWLevels";

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

function formatPostDateShort(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (dateOnly.getTime() === today.getTime()) {
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date);
  }
  // Show short month and day; omit year to save space
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
}

type Post = {
  id: number;
  user_id: string | null;
  body: string | null;
  image_url: string | null;
  video_url: string | null;
  image_urls?: string[] | null;
  video_urls?: string[] | null;
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
  buttonPosition?: 'fixed' | 'inline'; // Position of Create Post button: 'fixed' = fixed to viewport, 'inline' = next to posts
  enableLazyLoad?: boolean; // Enable lazy loading with pagination
  postsMaxWidth?: string; // Max width for posts container (e.g., "960px", "75%")
};

export default function PostFeed({
  filterUserId = null,
  showFilters = true,
  showComposer = true,
  backToProfileUsername = null,
  className = "",
  renderFiltersOutside = false,
  renderFilters,
  buttonPosition = 'fixed',
  enableLazyLoad = false,
  postsMaxWidth,
}: PostFeedProps) {
  const router = useRouter();
  const { theme } = useTheme();
  const isLight = theme === "light";
  const swLevels = useSWLevels(); // Load SW levels from database

  const AVATAR_FALLBACK =
    "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='100%' height='100%' fill='%23222'/><circle cx='32' cy='24' r='14' fill='%23555'/><rect x='12' y='44' width='40' height='12' rx='6' fill='%23555'/></svg>";
  const DISCUSS_EMOJI = String.fromCodePoint(0x1F4AC); // speech bubble emoji
  const [text, setText] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [videos, setVideos] = useState<File[]>([]);
  const unifiedFileRef = useRef<HTMLInputElement>(null);

  const [uid, setUid] = useState<string | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const inlineButtonRef = useRef<HTMLDivElement>(null);
  const buttonColumnRef = useRef<HTMLDivElement>(null);
  const measurementRaf = useRef<number | null>(null);
  const [fixedButtonStyle, setFixedButtonStyle] = useState<{
    left: number;
    width: number;
    top: number;
  } | null>(null);

  // Map author user_id -> profile info (username, full_name, avatar)
  const [profilesByUserId, setProfilesByUserId] = useState<Record<string, { username: string | null; full_name: string | null; avatar_url: string | null }>>({});
  
  // Map author user_id -> SW score
  const [swScoresByUserId, setSwScoresByUserId] = useState<Record<string, number>>({});

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editBody, setEditBody] = useState<string>("");
  const [openComments, setOpenComments] = useState<Record<number, boolean>>({});
  const [commentInput, setCommentInput] = useState<Record<number, string>>({});
  const [replyInput, setReplyInput] = useState<Record<number, string>>({});
  const [replyOpen, setReplyOpen] = useState<Record<number, boolean>>({});
  const [commentFile, setCommentFile] = useState<Record<number, File | null>>({});
  const [viewsChartOpen, setViewsChartOpen] = useState<number | null>(null);
  const [reportModalOpen, setReportModalOpen] = useState<number | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  
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
  const availableDirectionsRef = useRef<Array<{ id: string; slug: string; title: string; emoji: string }>>([]);
  const [myDirections, setMyDirections] = useState<string[]>([]);
  const [activeDirection, setActiveDirection] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'connections' | 'discuss' | 'direction'>( 'all');
  const [loadingDirections, setLoadingDirections] = useState(false);

  // Update ref when directions change
  useEffect(() => {
    availableDirectionsRef.current = availableDirections;
  }, [availableDirections]);

  const loadFeed = useCallback(async (directionId?: string | null, filterType?: 'all' | 'connections' | 'discuss' | 'direction', offset = 0, limit = 50) => {
    if (offset === 0) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    
    let query = supabase
      .from("posts")
      .select("*", { count: 'exact' });
    
    // Filter by user_id if provided (for profile page)
    if (filterUserId) {
      query = query.eq('user_id', filterUserId);
    }
    
    // Apply filter based on filterType
    if (filterType === 'connections') {
      // Filter posts that contain mentions (@username pattern)
      // body must not be null and not empty, and must contain @ followed by word characters
      query = query
        .not('body', 'is', null)
        .not('body', 'eq', '')
        .ilike('body', '%@%');
    } else if (filterType === 'discuss') {
      // Filter posts that contain "?" in body (body must not be null and not empty)
      query = query
        .not('body', 'is', null)
        .not('body', 'eq', '')
        .ilike('body', '%?%');
    } else if (filterType === 'direction' && directionId && availableDirectionsRef.current.length > 0) {
      const direction = availableDirectionsRef.current.find((dir) => dir.id === directionId);
      if (direction) {
        // Filter posts where category matches direction title or slug
        query = query.or(`category.ilike.%${direction.title}%,category.ilike.%${direction.slug}%`);
      }
    }
    // filterType === 'all' means no additional filtering
    
    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
      
    if (!error && data) {
      if (offset === 0) {
        setPosts(data as Post[]);
      } else {
        setPosts((prev) => [...prev, ...(data as Post[])]);
      }
      
      // Check if there are more posts
      const totalLoaded = offset + (data as Post[]).length;
      setHasMore(count ? totalLoaded < count : (data as Post[]).length === limit);
      
      // Preload comment counts for visible posts
      preloadCommentCounts(data as Post[]);

      // Preload author profiles (username, full_name, avatar)
      // Load profiles together with posts to ensure avatars are available
      const userIds = Array.from(
        new Set((data as Post[]).map((p) => p.user_id).filter((x): x is string => Boolean(x)))
      );
      if (userIds.length > 0) {
        try {
          const { data: profs, error: profError } = await supabase
            .from("profiles")
            .select("user_id, username, full_name, avatar_url")
            .in("user_id", userIds);
          
          if (profError) {
            console.error('Error loading profiles:', profError);
          }
          
          if (profs && profs.length > 0) {
            setProfilesByUserId((prev) => {
              const map = { ...prev };
              for (const p of profs as any[]) {
                map[p.user_id as string] = { 
                  username: p.username ?? null, 
                  full_name: p.full_name ?? null,
                  avatar_url: p.avatar_url ?? null 
                };
              }
              return map;
            });
          } else {
            // If no profiles found, still set empty profiles to prevent re-fetching
            setProfilesByUserId((prev) => {
              const map = { ...prev };
              for (const uid of userIds) {
                if (!map[uid]) {
                  map[uid] = { 
                    username: null, 
                    full_name: null,
                    avatar_url: null 
                  };
                }
              }
              return map;
            });
          }
        } catch (error) {
          console.error('Error loading profiles:', error);
          // Set empty profiles to prevent re-fetching
          setProfilesByUserId((prev) => {
            const map = { ...prev };
            for (const uid of userIds) {
              if (!map[uid]) {
                map[uid] = { 
                  username: null, 
                  full_name: null,
                  avatar_url: null 
                };
              }
            }
            return map;
          });
        }

        // Load SW scores for authors
        try {
          const { data: swData } = await supabase
            .from("sw_scores")
            .select("user_id, total")
            .in("user_id", userIds);
          if (swData) {
            setSwScoresByUserId((prev) => {
              const map = { ...prev };
              for (const row of swData as any[]) {
                map[row.user_id as string] = (row.total as number) || 0;
              }
              return map;
            });
          }
        } catch {
          // SW scores table may not exist
        }
      }
    }
    setLoading(false);
    setLoadingMore(false);
  }, [filterUserId]); // Removed availableDirections from dependencies - using ref instead

  // Load directions from growth-directions API - only primary (priority) directions
  // Load immediately on mount, in parallel with posts
  const loadingDirectionsRef = useRef(false);
  const loadDirections = useCallback(async () => {
    if (loadingDirectionsRef.current) return; // Prevent duplicate loads
    
    loadingDirectionsRef.current = true;
    setLoadingDirections(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) {
        loadingDirectionsRef.current = false;
        setLoadingDirections(false);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        loadingDirectionsRef.current = false;
        setLoadingDirections(false);
        return;
      }

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
    } finally {
      loadingDirectionsRef.current = false;
      setLoadingDirections(false);
    }
  }, []);

  // Track if initial load has been done
  const initialLoadDoneRef = useRef(false);
  
  // page mount - load posts and directions in parallel (only once)
  useEffect(() => {
    if (initialLoadDoneRef.current) return; // Prevent duplicate initial loads
    
    initialLoadDoneRef.current = true;
    supabase.auth.getUser().then(({ data }) => setUid(data.user?.id ?? null));
    // Initial load - load all posts without filter
    const initialLimit = enableLazyLoad ? 10 : 50;
    loadFeed(null, 'all', 0, initialLimit);
    // Load directions in parallel
    if (showFilters) {
      loadDirections();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Reload feed when active filter or direction changes (but not on initial mount)
  const prevFilterRef = useRef<{ filter: typeof activeFilter; direction: typeof activeDirection } | null>(null);
  useEffect(() => {
    // Skip on initial mount - initial load is handled by the first useEffect
    if (prevFilterRef.current === null) {
      prevFilterRef.current = { filter: activeFilter, direction: activeDirection };
      return;
    }
    
    // Only reload if filter or direction actually changed
    if (prevFilterRef.current.filter === activeFilter && prevFilterRef.current.direction === activeDirection) {
      return;
    }
    
    prevFilterRef.current = { filter: activeFilter, direction: activeDirection };
    
    const limit = enableLazyLoad ? 10 : 50;
    if (!showFilters) {
      // If filters are hidden, just load all posts (or filtered by user_id)
      loadFeed(null, 'all', 0, limit);
      return;
    }
    
    if (activeFilter === 'connections') {
      loadFeed(null, 'connections', 0, limit);
    } else if (activeFilter === 'discuss') {
      loadFeed(null, 'discuss', 0, limit);
    } else if (activeFilter === 'direction') {
      if (availableDirectionsRef.current.length > 0 && activeDirection) {
        loadFeed(activeDirection, 'direction', 0, limit);
      }
    } else {
      // activeFilter === 'all'
      loadFeed(null, 'all', 0, limit);
    }
  }, [activeFilter, activeDirection, loadFeed, showFilters, enableLazyLoad]); // Removed availableDirections - using ref in loadFeed

  // Lazy load more posts when scrolling to bottom
  useEffect(() => {
    if (!enableLazyLoad || !hasMore || loadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          const currentFilter = !showFilters ? 'all' : activeFilter;
          const currentDirection = activeFilter === 'direction' ? activeDirection : null;
          loadFeed(currentDirection, currentFilter as 'all' | 'connections' | 'discuss' | 'direction', posts.length, 10);
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => {
      if (loadMoreRef.current) {
        observer.unobserve(loadMoreRef.current);
      }
    };
  }, [enableLazyLoad, hasMore, loadingMore, posts.length, loadFeed, showFilters, activeFilter, activeDirection]);
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (!(showComposer && buttonPosition === "inline")) {
      setFixedButtonStyle(null);
      return;
    }

    const getStickyTopOffset = () => {
      const rootStyles = getComputedStyle(document.documentElement);
      const raw = rootStyles.getPropertyValue("--app-header-height").trim();
      const headerHeight = raw.endsWith("px") ? parseFloat(raw) : parseFloat(raw || "56");
      const safeHeaderHeight = Number.isFinite(headerHeight) ? headerHeight : 56;
      return safeHeaderHeight + 24;
    };

    const measure = () => {
      if (!buttonColumnRef.current || !inlineButtonRef.current) {
        return;
      }

      const columnRect = buttonColumnRef.current.getBoundingClientRect();
      const buttonRect = inlineButtonRef.current.getBoundingClientRect();
      const topOffset = getStickyTopOffset();
      const buttonHeight = buttonRect.height;
      const shouldFix =
        columnRect.top < topOffset && columnRect.bottom - buttonHeight > topOffset;

      const nextStyle = shouldFix
        ? {
            left: buttonRect.left,
            width: buttonRect.width,
            top: topOffset,
          }
        : null;

      setFixedButtonStyle((prev) => {
        if (!nextStyle) {
          return prev ? null : prev;
        }

        if (
          prev &&
          Math.abs(prev.left - nextStyle.left) < 0.5 &&
          Math.abs(prev.width - nextStyle.width) < 0.5 &&
          Math.abs(prev.top - nextStyle.top) < 0.5
        ) {
          return prev;
        }

        return nextStyle;
      });
    };

    const scheduleMeasure = () => {
      if (measurementRaf.current !== null) {
        return;
      }

      measurementRaf.current = window.requestAnimationFrame(() => {
        measurementRaf.current = null;
        measure();
      });
    };

    // Initial measurement
    scheduleMeasure();
    measure();

    const scrollContainer = buttonColumnRef.current?.closest(
      "[data-scroll-container=\"true\"]"
    );

    const handleScroll = () => scheduleMeasure();

    scrollContainer?.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("scroll", scheduleMeasure, true);
    window.addEventListener("resize", scheduleMeasure);

    return () => {
      if (measurementRaf.current !== null) {
        window.cancelAnimationFrame(measurementRaf.current);
        measurementRaf.current = null;
      }
      scrollContainer?.removeEventListener("scroll", handleScroll);
      window.removeEventListener("scroll", scheduleMeasure, true);
      window.removeEventListener("resize", scheduleMeasure);
    };
  }, [showComposer, buttonPosition, posts.length]);

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
    if (!text && images.length === 0 && videos.length === 0) return alert("Post cannot be empty");
    setPublishing(true);
    try {
      // Upload all images
      const image_urls: string[] = [];
      for (const img of images) {
        const url = await uploadToStorage(img, "images");
        image_urls.push(url);
      }
      
      // Upload all videos
      const video_urls: string[] = [];
      for (const vid of videos) {
        const url = await uploadToStorage(vid, "videos");
        video_urls.push(url);
      }
      
      // For backward compatibility, set image_url and video_url to first item if exists
      const image_url = image_urls.length > 0 ? image_urls[0] : null;
      const video_url = video_urls.length > 0 ? video_urls[0] : null;
      
      const { data, error } = await supabase
        .from("posts")
        .insert({ 
          user_id: uid, 
          body: text || null, 
          image_url, 
          video_url,
          image_urls: image_urls.length > 0 ? image_urls : null,
          video_urls: video_urls.length > 0 ? video_urls : null
        })
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
      setImages([]);
      setVideos([]);
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

  // Handle post report submission
  const handleReportSubmit = useCallback(async (postId: number, complaintType: 'harassment' | 'misinformation' | 'inappropriate_content' | 'unreliable_information', description: string) => {
    if (!uid) {
      setToast({ message: 'Sign in required', type: 'error' });
      return;
    }

    const postUrl = getPostUrl(postId);
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
      
      setToast({ message: 'Your complaint has been submitted', type: 'success' });
    } catch (error: any) {
      setToast({ message: error?.message || 'Failed to submit complaint', type: 'error' });
      throw error;
    }
  }, [uid, getPostUrl]);

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
                ? "bg-primary-blue text-white border-primary-blue shadow-[0_2px_8px_rgba(51,144,236,0.25)]"
                : "bg-primary-blue text-white border-primary-blue shadow-[0_2px_8px_rgba(51,144,236,0.3)]"
              : isLight
              ? "text-primary-text-secondary border-primary-blue/20 hover:bg-primary-blue/10 hover:text-primary-blue"
              : "text-primary-text-secondary border-primary-blue/30 hover:bg-primary-blue/15 hover:text-primary-blue-light"
          }`}
        >
          All
        </button>
        <button
          onClick={() => {
            setActiveFilter('connections');
            setActiveDirection(null);
          }}
          className={`px-3 py-1.5 rounded-full text-sm transition border flex items-center justify-center ${
            activeFilter === 'connections'
              ? isLight
                ? "bg-primary-blue text-white border-primary-blue shadow-[0_2px_8px_rgba(51,144,236,0.25)]"
                : "bg-primary-blue text-white border-primary-blue shadow-[0_2px_8px_rgba(51,144,236,0.3)]"
              : isLight
              ? "text-primary-text-secondary border-primary-blue/20 hover:bg-primary-blue/10 hover:text-primary-blue"
              : "text-primary-text-secondary border-primary-blue/30 hover:bg-primary-blue/15 hover:text-primary-blue-light"
          }`}
          title="Connections"
        >
          <UserPlus size={18} />
        </button>
        <button
          onClick={() => {
            setActiveFilter('discuss');
            setActiveDirection(null);
          }}
          className={`px-3 py-1.5 rounded-full text-sm transition border flex items-center justify-center ${
            activeFilter === 'discuss'
              ? isLight
                ? "bg-primary-blue text-white border-primary-blue shadow-[0_2px_8px_rgba(51,144,236,0.25)]"
                : "bg-primary-blue text-white border-primary-blue shadow-[0_2px_8px_rgba(51,144,236,0.3)]"
              : isLight
              ? "text-primary-text-secondary border-primary-blue/20 hover:bg-primary-blue/10 hover:text-primary-blue"
              : "text-primary-text-secondary border-primary-blue/30 hover:bg-primary-blue/15 hover:text-primary-blue-light"
          }`}
          title="Discuss"
        >
          <HelpCircle size={18} />
        </button>
        {myDirections.length > 0 && availableDirections.length > 0 && myDirections.map((id) => {
          const meta = availableDirections.find((a) => a.id === id);
          const slug = meta ? meta.slug : '';
          const emoji = meta ? meta.emoji : resolveDirectionEmoji(slug, null);
          const title = meta ? meta.title : id;
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
              className={`px-3 py-1.5 rounded-full text-sm transition border flex items-center justify-center ${
                active
                  ? isLight
                    ? "bg-primary-blue text-white border-primary-blue shadow-[0_2px_8px_rgba(51,144,236,0.25)]"
                    : "bg-primary-blue text-white border-primary-blue shadow-[0_2px_8px_rgba(51,144,236,0.3)]"
                  : isLight
                  ? "text-primary-text-secondary border-primary-blue/20 hover:bg-primary-blue/10 hover:text-primary-blue"
                  : "text-primary-text-secondary border-primary-blue/30 hover:bg-primary-blue/15 hover:text-primary-blue-light"
              }`}
              title={title}
            >
              <span className="text-lg leading-none" aria-hidden="true">{emoji}</span>
            </button>
          );
        })}
      </div>
    );
  }, [showFilters, activeFilter, activeDirection, myDirections, availableDirections, isLight]);

  // Render filters externally if requested
  useEffect(() => {
    if (renderFiltersOutside && renderFilters) {
      renderFilters(filtersJSX);
    }
  }, [renderFiltersOutside, renderFilters, filtersJSX]);

  // Render posts list
  const renderPostsList = () => (
    <>
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <PostSkeleton 
              key={`skeleton-${i}`}
              showImage={i === 0}
              showActions={true}
            />
          ))}
        </div>
      ) : (
        <AnimatePresence mode="popLayout">
          {posts.map((p, index) => {
          const profile = p.user_id ? profilesByUserId[p.user_id] : undefined;
          const avatar = resolveAvatarUrl(profile?.avatar_url) ?? AVATAR_FALLBACK;
          const username = profile?.username || (p.user_id ? p.user_id.slice(0, 8) : "Unknown");
          const fullName = profile?.full_name || null;
          const commentCount = commentCounts[p.id] ?? 0;
          
          // Check if post has mentions
          const postHasMentions = hasMentions(p.body);
          
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

          const isMyPost = uid === p.user_id;

          return (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{
                duration: 0.3,
                delay: Math.min(index * 0.05, 0.3), // Stagger animation, max 0.3s delay
                ease: [0.4, 0, 0.2, 1], // Custom easing for smooth animation
              }}
            >
              <PostCard
                post={{
                  id: String(p.id),
                  author: username,
                  content: p.body ?? '',
                  createdAt: p.created_at,
                  commentsCount: commentCount,
                }}
                disableNavigation={true}
                className={`card p-3 md:p-4 space-y-2 relative transition-transform duration-200 ease-out rounded-none md:rounded-none ${
                  hasCategory && categoryDirection
                    ? 'ring-2 ring-primary-blue border-2 border-primary-blue/60 shadow-lg bg-gradient-to-br from-primary-blue/5 to-primary-blue-light/5'
                    : ''
                }`}
                onMouseEnter={() => addViewOnce(p.id)}
              renderContent={() => (
                <div className="relative z-10 space-y-2">
                  {/* header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0 flex-1 pr-2">
                      <AvatarWithBadge
                        avatarUrl={avatar}
                        swScore={p.user_id ? (swScoresByUserId[p.user_id] || 0) : 0}
                        swLevels={swLevels}
                        size="sm"
                        alt="avatar"
                        href={`/u/${encodeURIComponent(profile?.username || p.user_id || '')}`}
                        priority={true}
                      />
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <a 
                            href={`/u/${encodeURIComponent(profile?.username || p.user_id || '')}`}
                            onClick={(e) => e.stopPropagation()}
                            className={`text-sm truncate hover:underline ${isLight ? "text-primary-text" : "text-primary-text"}`}
                            data-prevent-card-navigation="true"
                          >
                            {username}
                          </a>
                          {(fullName || p.category || postHasMentions || (growthStatusesByPostId[p.id] && growthStatusesByPostId[p.id].length > 0)) && (
                            <span className={`text-sm ${isLight ? "text-primary-text-secondary" : "text-primary-text-secondary"}`}>
                              |
                            </span>
                          )}
                          {fullName && (
                            <>
                              <span className={`text-sm ${isLight ? "text-primary-text-secondary" : "text-primary-text-secondary"}`}>
                                {fullName}
                              </span>
                              {(p.category || postHasMentions || (growthStatusesByPostId[p.id] && growthStatusesByPostId[p.id].length > 0)) && (
                                <span className={`text-sm ${isLight ? "text-primary-text-secondary" : "text-primary-text-secondary"}`}>
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
                                    ? 'bg-primary-blue/25 text-primary-blue border border-primary-blue/40 shadow-sm'
                                    : 'bg-primary-blue/35 text-primary-blue-light border border-primary-blue/60 shadow-sm'
                                  : isLight
                                  ? 'text-primary-text-secondary bg-primary-bg-secondary/50'
                                  : 'text-primary-text-secondary bg-white/5'
                              }`}>
                                {categoryDirection ? `${categoryDirection.emoji} ${p.category}` : p.category}
                              </div>
                              {(postHasMentions || (growthStatusesByPostId[p.id] && growthStatusesByPostId[p.id].length > 0)) && (
                                <span className={`text-sm ${isLight ? "text-primary-text-secondary" : "text-primary-text-secondary"}`}>
                                  |
                                </span>
                              )}
                            </>
                          )}
                          {postHasMentions && (
                            <>
                              <div className={`text-xs px-2 py-1 rounded-md font-medium ${
                                isLight
                                  ? 'bg-green-500/20 text-green-600 border border-green-500/30 shadow-sm'
                                  : 'bg-green-500/25 text-green-400 border border-green-500/40 shadow-sm'
                              }`}>
                                Connections
                              </div>
                              {(growthStatusesByPostId[p.id] && growthStatusesByPostId[p.id].length > 0) && (
                                <span className={`text-sm ${isLight ? "text-primary-text-secondary" : "text-primary-text-secondary"}`}>
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
                    {/* Report button - only for other users' posts, positioned at top right */}
                    {!isMyPost && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setReportModalOpen(p.id);
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
                  </div>

                  {/* content */}
                  {editingId === p.id ? (
                    <div className="space-y-3">
                      <textarea
                        value={editBody}
                        onChange={(e) => setEditBody(e.target.value)}
                        className={`input w-full rounded-2xl p-3 ${isLight ? "placeholder-primary-text-secondary/60" : "placeholder-primary-text-secondary/50"}`}
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
                      {p.body && <p className={`leading-relaxed break-words ${isLight ? "text-primary-text" : "text-primary-text"}`}>{formatTextWithMentions(p.body)}</p>}
                      {/* Display multiple images if available, otherwise fall back to single image_url */}
                      {(() => {
                        const imageUrls = (p.image_urls && p.image_urls.length > 0) ? p.image_urls : (p.image_url ? [p.image_url] : []);
                        const videoUrls = (p.video_urls && p.video_urls.length > 0) ? p.video_urls : (p.video_url ? [p.video_url] : []);
                        const allMedia = [...imageUrls.map(url => ({ type: 'image', url })), ...videoUrls.map(url => ({ type: 'video', url }))];
                        
                        if (allMedia.length === 0) return null;
                        
                        return (
                          <div className="mt-3 space-y-3">
                            {allMedia.map((media, idx) => (
                              <div key={`media-${idx}`} className="flex justify-center">
                                {media.type === 'image' ? (
                                  <img 
                                    src={media.url} 
                                    loading="lazy" 
                                    className={`max-w-full max-h-[500px] w-auto h-auto rounded-none border object-contain ${isLight ? "border-primary-blue/20" : "border-primary-blue/30"}`} 
                                    alt={`post image ${idx + 1}`} 
                                  />
                                ) : (
                                  <div className="w-full max-w-full relative" style={{ maxHeight: '500px' }}>
                                    <video 
                                      controls 
                                      preload="metadata"
                                      playsInline
                                      poster={imageUrls[0] || undefined}
                                      className={`w-full max-w-full max-h-[500px] h-auto rounded-none border relative ${isLight ? "border-primary-blue/20" : "border-primary-blue/30"}`}
                                      style={{ objectFit: 'contain' }}
                                      onLoadedMetadata={(e) => {
                                        const target = e.currentTarget;
                                        const placeholder = target.parentElement?.querySelector('.video-placeholder');
                                        if (placeholder) {
                                          (placeholder as HTMLElement).style.display = 'none';
                                        }
                                      }}
                                      onLoadedData={(e) => {
                                        const target = e.currentTarget;
                                        const placeholder = target.parentElement?.querySelector('.video-placeholder');
                                        if (placeholder) {
                                          (placeholder as HTMLElement).style.display = 'none';
                                        }
                                      }}
                                      onPlay={(e) => {
                                        const target = e.currentTarget;
                                        const placeholder = target.parentElement?.querySelector('.video-placeholder');
                                        if (placeholder) {
                                          (placeholder as HTMLElement).style.display = 'none';
                                        }
                                      }}
                                    >
                                      <source src={media.url} type="video/mp4" />
                                      <source src={media.url} />
                                    </video>
                                    {!imageUrls[0] && (
                                      <div className={`video-placeholder absolute inset-0 flex items-center justify-center pointer-events-none z-10 ${isLight ? "bg-slate-100/80" : "bg-slate-900/80"}`}>
                                        <svg className={`w-16 h-16 ${isLight ? "text-slate-400" : "text-white/50"}`} fill="currentColor" viewBox="0 0 24 24">
                                          <path d="M8 5v14l11-7z"/>
                                        </svg>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* footer */}
                  <div className={`flex items-center gap-5 ${isLight ? "text-primary-text-secondary" : "text-primary-text-secondary"}`}>
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

                    {/* Right group: date, comments, menu */}
                    <div className="ml-auto flex items-center gap-3">
                      <span className="text-xs whitespace-nowrap">
                        <span className="sm:hidden">{formatPostDateShort(p.created_at)}</span>
                        <span className="hidden sm:inline">{formatPostDate(p.created_at)}</span>
                      </span>
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
                      />
                      {uid === p.user_id && editingId !== p.id && (
                        <div onClick={(e) => e.stopPropagation()} data-prevent-card-navigation="true">
                          <PostActionMenu
                            onEdit={() => {
                              setEditingId(p.id);
                              setEditBody(p.body || "");
                            }}
                            onDelete={() => deletePost(p)}
                            className="ml-1"
                          />
                        </div>
                      )}
                    </div>
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
                          className={`input py-2 focus:ring-0 flex-1 ${isLight ? "placeholder-primary-text-secondary/60" : "placeholder-primary-text-secondary/50"}`}
                          style={{ fontSize: '16px' }} // Prevent zoom on mobile
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
                              ? "border-primary-blue/30 text-primary-blue hover:bg-primary-blue/10"
                              : "border-primary-blue/30 text-primary-blue-light hover:bg-primary-blue/15"
                          }`}
                        >
                          <Paperclip className="h-4 w-4" aria-hidden="true" />
                          <span className="sr-only">Attach file</span>
                        </label>
                        {commentFile[p.id] && (
                          <span className={`text-xs truncate max-w-[120px] ${isLight ? "text-primary-text-secondary" : "text-primary-text-secondary"}`}>{commentFile[p.id]?.name}</span>
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
            </motion.div>
          );
          })}
        </AnimatePresence>
      )}
      {/* Lazy load trigger */}
      {enableLazyLoad && (
        <div ref={loadMoreRef} className="h-20 flex items-center justify-center">
          {loadingMore && (
            <div className="space-y-3 w-full">
              {Array.from({ length: 2 }).map((_, i) => (
                <PostSkeleton 
                  key={`loading-more-${i}`}
                  showImage={false}
                  showActions={true}
                />
              ))}
            </div>
          )}
          {!hasMore && posts.length > 0 && (
            <div className={`text-sm ${isLight ? "text-primary-text-secondary" : "text-primary-text-secondary"}`}>
              No more posts
            </div>
          )}
        </div>
      )}
    </>
  );

  const renderCreatePostButton = () => (
    <Button
      onClick={() => setComposerOpen(true)}
      variant="primary"
      className="shadow-lg rounded-full px-6 py-4 text-base whitespace-nowrap"
      icon={<Plus />}
    >
      Create post
    </Button>
  );

  return (
    <div className={className || ''}>
      {/* Filters toggle - render inside if not rendering outside */}
      {showFilters && !renderFiltersOutside && (
        <div className="card p-3 md:p-4 mb-6 px-4 md:px-4">
          {filtersJSX}
        </div>
      )}

      {/* Feed with Create Post button on the right (if inline) */}
      {buttonPosition === 'inline' && showComposer ? (
        <div className="flex flex-col-reverse lg:flex-row gap-4 lg:gap-6 items-stretch lg:items-start">
          {/* Posts */}
          <div className="flex-1 space-y-3 min-w-0 lg:max-w-3xl">
            {renderPostsList()}
          </div>

          {/* Create Post button - inline on the right for large screens */}
          <div ref={buttonColumnRef} className="relative hidden lg:block flex-shrink-0 self-start">
            <div
              ref={inlineButtonRef}
              style={{ visibility: fixedButtonStyle ? 'hidden' : 'visible' }}
            >
              {renderCreatePostButton()}
            </div>
          </div>

          {/* Floating action button for mobile/tablet */}
          <div className="lg:hidden fixed z-40 right-4 bottom-20">
            {renderCreatePostButton()}
          </div>
        </div>
      ) : (
        <>
          {/* Feed */}
          <div 
            className="space-y-3"
            style={postsMaxWidth ? { maxWidth: postsMaxWidth, margin: '0 auto' } : undefined}
          >
            {renderPostsList()}
          </div>

          {/* Create Post button - fixed on the right, follows scroll */}
          {showComposer && buttonPosition === 'fixed' && (
            <div
              className="fixed z-40"
              style={{
                top: 'calc(var(--app-header-height, 56px) + 24px)',
                right: '24px',
              }}
            >
              {renderCreatePostButton()}
            </div>
          )}
        </>
      )}

      {fixedButtonStyle && typeof document !== 'undefined' && createPortal(
        <div
          className="z-40"
          style={{
            position: 'fixed',
            top: fixedButtonStyle.top,
            left: fixedButtonStyle.left,
            width: fixedButtonStyle.width,
          }}
        >
          {renderCreatePostButton()}
        </div>,
        document.body
      )}

      {/* Composer modal - rendered via portal to cover entire viewport */}
      {showComposer && composerOpen && typeof window !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
          <div
            className={`absolute inset-0 ${isLight ? "bg-black/50" : "bg-black/80"}`}
            onClick={() => !publishing && setComposerOpen(false)}
          />
          <div className="relative z-10 w-full max-w-xl mx-auto p-4">
            <div className={`card-glow-primary p-4 md:p-6 space-y-4 ${isLight ? "" : ""}`}>
              <div className="flex items-center justify-between">
                <div className={`font-medium ${isLight ? "text-primary-text" : "text-primary-text"}`}>Create post</div>
                <button
                  onClick={() => !publishing && setComposerOpen(false)}
                  className={`transition ${isLight ? "text-primary-text-secondary hover:text-primary-blue" : "text-primary-text-secondary hover:text-primary-blue-light"}`}
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
                className={`input w-full outline-none min-h-[120px] text-base md:text-lg ${isLight ? "placeholder-primary-text-secondary/60" : "placeholder-primary-text-secondary/50"}`}
                userId={uid}
              />
              <input
                ref={unifiedFileRef}
                type="file"
                accept="image/*,video/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  if (files.length === 0) {
                    return;
                  }
                  
                  const newImages: File[] = [...images];
                  const newVideos: File[] = [...videos];
                  
                  files.forEach((file) => {
                    if (file.type.startsWith("image/")) {
                      newImages.push(file);
                    } else if (file.type.startsWith("video/")) {
                      newVideos.push(file);
                    }
                  });
                  
                  setImages(newImages);
                  setVideos(newVideos);
                  
                  // Reset input to allow selecting the same files again
                  if (e.target) {
                    e.target.value = '';
                  }
                }}
              />
              <div className="flex items-center gap-3">
                <EmojiPicker
                  onEmojiSelect={handleEmojiSelect}
                  variant={isLight ? 'light' : 'dark'}
                  align="left"
                  position="top"
                />
                <button
                  onClick={() => unifiedFileRef.current?.click()}
                  className={`px-3 py-2 rounded-xl border text-sm transition flex items-center gap-2 ${
                    isLight
                      ? "border-primary-blue/30 text-primary-blue hover:bg-primary-blue/10"
                      : "border-primary-blue/30 text-primary-blue-light hover:bg-primary-blue/15"
                  }`}
                >
                  <ImageIcon className="h-4 w-4" aria-hidden="true" />
                  <span>Media</span>
                </button>
                {(images.length > 0 || videos.length > 0) && (
                  <div className="flex flex-wrap gap-2 items-center">
                    {images.map((img, idx) => (
                      <span 
                        key={`img-${idx}`}
                        className={`text-xs px-2 py-1 rounded-md ${isLight ? "bg-blue-100 text-blue-700" : "bg-blue-900/30 text-blue-300"}`}
                      >
                        📷 {img.name}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setImages(images.filter((_, i) => i !== idx));
                          }}
                          className="ml-2 hover:opacity-70"
                          aria-label="Remove image"
                        >
                          <CloseIcon className="h-3 w-3 inline" />
                        </button>
                      </span>
                    ))}
                    {videos.map((vid, idx) => (
                      <span 
                        key={`vid-${idx}`}
                        className={`text-xs px-2 py-1 rounded-md ${isLight ? "bg-purple-100 text-purple-700" : "bg-purple-900/30 text-purple-300"}`}
                      >
                        🎥 {vid.name}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setVideos(videos.filter((_, i) => i !== idx));
                          }}
                          className="ml-2 hover:opacity-70"
                          aria-label="Remove video"
                        >
                          <CloseIcon className="h-3 w-3 inline" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="ml-auto">
                  <Button onClick={onPublish} disabled={publishing} variant="primary">
                    {publishing ? "Publishing..." : "Publish"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Views Chart Modal */}
      {viewsChartOpen && (
        <ViewsChart
          postId={viewsChartOpen}
          isOpen={true}
          onClose={() => setViewsChartOpen(null)}
        />
      )}

      {/* Report Modal */}
      {reportModalOpen && (
        <PostReportModal
          postId={reportModalOpen}
          postUrl={getPostUrl(reportModalOpen)}
          isOpen={true}
          onClose={() => setReportModalOpen(null)}
          onSubmit={async (complaintType, description) => {
            await handleReportSubmit(reportModalOpen, complaintType, description);
          }}
        />
      )}

      {/* Toast Notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}

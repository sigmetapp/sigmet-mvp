'use client';

import { useEffect, useRef, useState, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { RequireAuth } from "@/components/RequireAuth";
import Button from "@/components/Button";

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
  const [openMenuFor, setOpenMenuFor] = useState<number | null>(null);

  // Reactions state: per-post counts by kind and my reactions set
  type ReactionKind = "growth" | "value" | "with_you";
  const REACTION_META: Record<ReactionKind, { label: string; emoji: string }> = {
    growth: { label: "Growth", emoji: "🌱" },
    value: { label: "Value", emoji: "💎" },
    with_you: { label: "With You", emoji: "🤝" },
  };
  const [reactionsByPostId, setReactionsByPostId] = useState<
    Record<number, { growth: number; value: number; with_you: number }>
  >({});
  const [myReactionsByPostId, setMyReactionsByPostId] = useState<
    Record<number, Set<ReactionKind>>
  >({});
  const [reactionBursts, setReactionBursts] = useState<Record<string, number>>({});

  // Directions toggle (from profile selections)
  const GROWTH_AREAS = useMemo(
    () => [
      { id: "health", emoji: "💚", title: "Health" },
      { id: "thinking", emoji: "🧠", title: "Thinking" },
      { id: "learning", emoji: "📚", title: "Learning" },
      { id: "career", emoji: "🧩", title: "Career" },
      { id: "finance", emoji: "💰", title: "Finance" },
      { id: "relationships", emoji: "🤝", title: "Relationships" },
      { id: "creativity", emoji: "🎨", title: "Creativity" },
      { id: "sport", emoji: "🏃‍♂️", title: "Sport" },
      { id: "habits", emoji: "⏱️", title: "Habits" },
      { id: "emotions", emoji: "🌿", title: "Emotions" },
      { id: "meaning", emoji: "✨", title: "Meaning" },
      { id: "community", emoji: "🏙️", title: "Community" },
    ],
    []
  );
  const [myDirections, setMyDirections] = useState<string[]>([]);
  const [activeDirection, setActiveDirection] = useState<string | null>(null);

  // page mount
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUid(data.user?.id ?? null));
    loadFeed();
  }, []);

  // Load selected directions from profile (up to 3)
  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) return;
      const { data } = await supabase
        .from("profiles")
        .select("directions_selected")
        .eq("user_id", userId)
        .maybeSingle();
      const dirs = (data?.directions_selected as string[] | undefined) || [];
      setMyDirections(dirs.slice(0, 3));
      setActiveDirection(dirs[0] ?? null);
    })();
  }, []);

  async function loadFeed() {
    setLoading(true);
    const { data, error } = await supabase
      .from("posts")
      .select("*")
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
  }

  // Preload reactions for current posts
  useEffect(() => {
    if (posts.length === 0) return;
    (async () => {
      try {
        const ids = posts.map((p) => p.id);
        const { data, error } = await supabase
          .from("post_reactions")
          .select("post_id, kind, user_id")
          .in("post_id", ids);
        if (error || !data) return;
        const counts: Record<number, { growth: number; value: number; with_you: number }> = {};
        const mine: Record<number, Set<ReactionKind>> = {};
        for (const r of data as any[]) {
          const pid = r.post_id as number;
          const kind = (r.kind as string) as ReactionKind;
          if (!counts[pid]) counts[pid] = { growth: 0, value: 0, with_you: 0 };
          if (kind in counts[pid]) (counts[pid] as any)[kind] += 1;
          if (r.user_id && r.user_id === uid) {
            if (!mine[pid]) mine[pid] = new Set();
            mine[pid].add(kind);
          }
        }
        setReactionsByPostId(counts);
        setMyReactionsByPostId(mine);
      } catch {
        // silently ignore if table not present
      }
    })();
  }, [posts, uid]);

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

  // --- reactions V2 (separate kinds)
  async function toggleReaction(postId: number, kind: ReactionKind) {
    if (!uid) return alert("Sign in required");
    const mySet = myReactionsByPostId[postId] || new Set<ReactionKind>();
    const has = mySet.has(kind);
    try {
      if (!has) {
        const { error } = await supabase
          .from("post_reactions")
          .insert({ post_id: postId, user_id: uid, kind });
        if (error) throw error;
        setMyReactionsByPostId((prev) => {
          const next = { ...prev };
          const s = new Set(next[postId] || []);
          s.add(kind);
          next[postId] = s;
          return next;
        });
        setReactionsByPostId((prev) => {
          const base = prev[postId] || { growth: 0, value: 0, with_you: 0 };
          return { ...prev, [postId]: { ...base, [kind]: (base as any)[kind] + 1 } } as any;
        });
        const key = `${postId}:${kind}`;
        setReactionBursts((prev) => ({ ...prev, [key]: Date.now() }));
        setTimeout(() => {
          setReactionBursts((prev) => {
            const next = { ...prev } as any;
            delete next[key];
            return next;
          });
        }, 500);
      } else {
        const { error } = await supabase
          .from("post_reactions")
          .delete()
          .eq("post_id", postId)
          .eq("user_id", uid)
          .eq("kind", kind);
        if (error) throw error;
        setMyReactionsByPostId((prev) => {
          const next = { ...prev };
          const s = new Set(next[postId] || []);
          s.delete(kind);
          next[postId] = s;
          return next;
        });
        setReactionsByPostId((prev) => {
          const base = prev[postId] || { growth: 0, value: 0, with_you: 0 };
          return { ...prev, [postId]: { ...base, [kind]: Math.max(0, (base as any)[kind] - 1) } } as any;
        });
      }
    } catch (e: any) {
      console.error(e);
    }
  }

  // --- edit/delete
  async function deletePost(p: Post) {
    if (!confirm("Delete this post?")) return;
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
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight gradient-text">Your feed</h1>
            <p className="text-white/70 mt-1">Share progress and see what others are building.</p>
          </div>
          <div className="hidden sm:block">
            <Button onClick={() => setComposerOpen(true)} variant="primary" className="shadow-md" icon={<Plus />}>Create post</Button>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto space-y-6">
        {/* Directions toggle (selected in profile) */}
        {myDirections.length > 0 && (
          <div className="card p-3 md:p-4">
            <div className="flex flex-wrap items-center gap-2">
              {myDirections.map((id) => {
                const meta = GROWTH_AREAS.find((a) => a.id === id);
                const label = meta ? `${meta.emoji} ${meta.title}` : id;
                const active = activeDirection === id;
                return (
                  <button
                    key={id}
                    onClick={() => setActiveDirection(id)}
                    className={`px-3 py-1.5 rounded-full text-sm transition border ${
                      active
                        ? "bg-white text-black border-white"
                        : "text-white/80 border-white/20 hover:bg-white/10"
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
          <div className="text-white/60">Loading…</div>
        ) : (
          posts.map((p) => (
            <div
              key={p.id}
              className="card card-glow p-4 md:p-6 space-y-4 transition-shadow hover:shadow-[0_12px_60px_rgba(0,0,0,0.45)]"
              onMouseEnter={() => addViewOnce(p.id)}
            >
              {/* header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  {(() => {
                    const prof = p.user_id ? profilesByUserId[p.user_id] : undefined;
                    const avatar = prof?.avatar_url || "/avatar-fallback.png";
                    const username = prof?.username || (p.user_id ? p.user_id.slice(0, 8) : "Unknown");
                    return (
                      <>
                        <img
                          src={avatar}
                          alt="avatar"
                          className="h-9 w-9 rounded-full object-cover border border-white/10 shrink-0"
                        />
                        <div className="flex flex-col min-w-0">
                          <div className="text-sm text-white truncate">{username}</div>
                        </div>
                      </>
                    );
                  })()}
                </div>
                <div className="relative flex items-center gap-2 text-xs text-white/60">
                  <span>{new Date(p.created_at).toLocaleString()}</span>
                  {uid === p.user_id && editingId !== p.id && (
                    <div className="ml-2">
                      <Button
                        variant="icon"
                        size="sm"
                        ariaLabel="Post actions"
                        title="Actions"
                        onClick={() => setOpenMenuFor((cur) => (cur === p.id ? null : p.id))}
                      >
                        ⋯
                      </Button>
                      {openMenuFor === p.id && (
                        <div className="absolute right-0 mt-2 w-40 rounded-xl border border-white/10 bg-[#0f1628] shadow-[0_12px_40px_rgba(0,0,0,0.45)] z-10">
                          <button
                            onClick={() => {
                              setOpenMenuFor(null);
                              setEditingId(p.id);
                              setEditBody(p.body || "");
                            }}
                            className="w-full text-left px-3 py-2 text-white/90 hover:bg-white/10 rounded-t-xl"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => {
                              setOpenMenuFor(null);
                              deletePost(p);
                            }}
                            className="w-full text-left px-3 py-2 text-red-300 hover:bg-white/10 rounded-b-xl"
                          >
                            Delete
                          </button>
                        </div>
                      )}
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
                    className="w-full bg-transparent border border-white/10 rounded-2xl p-3 outline-none"
                  />
                  <div className="flex gap-2">
                    <Button onClick={() => saveEdit(p)} variant="primary">Save</Button>
                    <Button onClick={() => setEditingId(null)} variant="secondary">Cancel</Button>
                  </div>
                </div>
              ) : (
                <>
                  {p.body && <p className="leading-relaxed text-white">{p.body}</p>}
                  {p.image_url && (
                    <img src={p.image_url} loading="lazy" className="rounded-2xl border border-white/10" alt="post image" />
                  )}
                  {p.video_url && (
                    <video controls preload="metadata" className="w-full rounded-2xl border border-white/10">
                      <source src={p.video_url} />
                    </video>
                  )}
                </>
              )}

              {/* author actions moved to header near date */}

              {/* footer */}
              <div className="flex items-center gap-5 text-white/80">
                <div className="flex items-center gap-1" title="Views">
                  <Eye />
                  <span className="text-sm">{p.views ?? 0}</span>
                </div>

              <div className="flex items-center gap-2">
                {(["growth", "value", "with_you"] as ReactionKind[]).map((k) => {
                  const active = myReactionsByPostId[p.id]?.has(k);
                  const counts = reactionsByPostId[p.id] || { growth: 0, value: 0, with_you: 0 };
                  const color =
                    k === "growth"
                      ? active
                        ? "bg-emerald-300 text-black border-emerald-300"
                        : "hover:bg-emerald-300/15 border-emerald-300/30"
                      : k === "value"
                      ? active
                        ? "bg-cyan-300 text-black border-cyan-300"
                        : "hover:bg-cyan-300/15 border-cyan-300/30"
                      : active
                      ? "bg-violet-300 text-black border-violet-300"
                      : "hover:bg-violet-300/15 border-violet-300/30";
                  return (
                    <button
                      key={k}
                      onClick={() => toggleReaction(p.id, k)}
                      className={`relative overflow-hidden px-2.5 py-1 rounded-lg text-sm border transition will-change-transform active:scale-95 ${color}`}
                      title={REACTION_META[k].label}
                    >
                      <span className="mr-1">{REACTION_META[k].emoji}</span>
                      <span>{REACTION_META[k].label}</span>
                      <span className="ml-1 text-white/70">{(counts as any)[k] ?? 0}</span>
                      {reactionBursts[`${p.id}:${k}`] && (
                        <span
                          className={`pointer-events-none absolute inset-0 animate-ping rounded-lg opacity-40 ${
                            k === "growth"
                              ? "bg-emerald-300"
                              : k === "value"
                              ? "bg-cyan-300"
                              : "bg-violet-300"
                          }`}
                        />
                      )}
                    </button>
                  );
                })}
              </div>

                <button
                  className="ml-auto text-sm underline hover:no-underline"
                  onClick={async () => {
                    const willOpen = !openComments[p.id];
                    setOpenComments((prev) => ({ ...prev, [p.id]: willOpen }));
                    if (willOpen && !(comments[p.id]?.length > 0)) {
                      await loadComments(p.id);
                    }
                  }}
                >
                  Comments ({commentCounts[p.id] ?? 0})
                </button>
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
                          <div className="rounded-xl bg-white/5 border border-white/10 p-2 text-sm">
                            <div className="text-xs text-white/60 flex items-center justify-between">
                              <div className="flex items-center gap-2 min-w-0">
                                {(() => {
                                  const prof = c.user_id ? commenterProfiles[c.user_id] : undefined;
                                  const avatar = prof?.avatar_url || "/avatar-fallback.png";
                                  const username = prof?.username || (c.user_id ? c.user_id.slice(0, 8) : "Anon");
                                  return (
                                    <>
                                      <img src={avatar} alt="avatar" className="h-6 w-6 rounded-full object-cover border border-white/10" />
                                      <span className="truncate">{username}</span>
                                    </>
                                  );
                                })()}
                              </div>
                              <span>{new Date(c.created_at).toLocaleString()}</span>
                            </div>
                            {c.body && <div className="mt-1 whitespace-pre-wrap">{c.body}</div>}
                            {c.media_url && (
                              c.media_url.match(/\.(mp4|webm|ogg)(\?|$)/i) ? (
                                <video controls preload="metadata" className="mt-2 w-full rounded-xl border border-white/10">
                                  <source src={c.media_url} />
                                </video>
                              ) : (
                                <img
                                  src={c.media_url}
                                  loading="lazy"
                                  className="mt-2 rounded-xl border border-white/10 max-h-80 object-contain"
                                  alt="comment media"
                                />
                              )
                            )}
                            <div className="mt-2 flex items-center gap-2 text-xs">
                              <button
                                onClick={() => voteComment(c.id, 1)}
                                className={`px-2 py-1 rounded-lg border ${
                                  myCommentVotes[c.id] === 1 ? "bg-emerald-300 text-black border-emerald-300" : "border-white/20 hover:bg-white/10"
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
                                  placeholder="Write a reply…"
                                  className="input bg-transparent border border-white/10 py-2 focus:ring-0"
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
                      value={commentInput[p.id] || ""}
                      onChange={(e) =>
                        setCommentInput((prev) => ({
                          ...prev,
                          [p.id]: e.target.value,
                        }))
                      }
                      placeholder="Write a comment…"
                      className="input bg-transparent border border-white/10 py-2 focus:ring-0"
                    />
                    <input
                      id={`cfile-${p.id}`}
                      type="file"
                      accept="image/*,video/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0] || null;
                        setCommentFile((prev) => ({ ...prev, [p.id]: f }));
                      }}
                    />
                    <label htmlFor={`cfile-${p.id}`} className="px-3 py-2 rounded-xl border border-white/20 text-white/80 hover:bg-white/10 text-sm cursor-pointer">
                      📎
                    </label>
                    {commentFile[p.id] && (
                      <span className="text-xs text-white/60 truncate max-w-[120px]">{commentFile[p.id]?.name}</span>
                    )}
                    <button onClick={() => addComment(p.id)} className="btn btn-primary">
                      Send
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}

        {/* Floating Post button (mobile) */}
        <Button
          onClick={() => setComposerOpen(true)}
          variant="primary"
          className="sm:hidden fixed right-6 bottom-6 shadow-lg"
          icon={<Plus />}
        >
          Post
        </Button>
      </div>

      {/* Composer modal */}
      {composerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/90"
            onClick={() => !publishing && setComposerOpen(false)}
          />
          <div className="relative z-10 w-full max-w-xl mx-auto p-4">
            <div className="card p-4 md:p-6 shadow-[0_8px_40px_rgba(0,0,0,0.45)] space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-white/80 font-medium">Create post</div>
                <button
                  onClick={() => !publishing && setComposerOpen(false)}
                  className="text-white/60 hover:text-white"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="What do you want to share?"
                className="w-full bg-transparent outline-none placeholder-white/40 min-h-[120px] text.base md:text-lg text-white"
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
                  className="px-3 py-2 rounded-xl border border-white/20 text-white/80 hover:bg-white/10 text-sm"
                >
                  📎 Media
                </button>
                {(img || vid) && (
                  <span className="text-white/60 text-sm">
                    {img ? `Image: ${img.name}` : vid ? `Video: ${vid.name}` : ""}
                  </span>
                )}
                <div className="ml-auto">
                  <Button onClick={onPublish} disabled={publishing} variant="primary">
                    {publishing ? "Publishing…" : "Publish"}
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

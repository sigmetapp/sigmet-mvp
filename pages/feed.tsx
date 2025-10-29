import { useEffect, useRef, useState, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { RequireAuth } from "@/components/RequireAuth";

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

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editBody, setEditBody] = useState<string>("");
  const [openComments, setOpenComments] = useState<Record<number, boolean>>({});
  const [commentInput, setCommentInput] = useState<Record<number, string>>({});
  const [comments, setComments] = useState<Record<number, Comment[]>>({});
  const [commentCounts, setCommentCounts] = useState<Record<number, number>>({});
  const [likedByMe, setLikedByMe] = useState<Set<number>>(new Set());
  const viewedOnce = useRef<Set<number>>(new Set());

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
    }
    setLoading(false);
  }

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
    // простая версия: один запрос на пост (head count).
    const entries = await Promise.all(
      list.map(async (p) => {
        const { count } = await supabase
          .from("comments")
          .select("*", { count: "exact", head: true })
          .eq("post_id", p.id);
        return [p.id, count || 0] as const;
      })
    );
    setCommentCounts(Object.fromEntries(entries));
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
    }
  }

  async function addComment(postId: number) {
    if (!uid) return alert("Sign in required");
    const body = (commentInput[postId] || "").trim();
    if (!body) return;
    const { data, error } = await supabase
      .from("comments")
      .insert({ post_id: postId, user_id: uid, body })
      .select("*")
      .single();
    if (!error && data) {
      setComments((prev) => ({
        ...prev,
        [postId]: [...(prev[postId] || []), data as Comment],
      }));
      setCommentCounts((prev) => ({
        ...prev,
        [postId]: (prev[postId] ?? 0) + 1,
      }));
      setCommentInput((prev) => ({ ...prev, [postId]: "" }));
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

  return (
    <div className="min-h-[100dvh] bg-[radial-gradient(1200px_600px_at_50%_-10%,rgba(255,255,255,0.08),transparent),linear-gradient(180deg,rgba(255,255,255,0.04),transparent)]">
      <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-6">
        {/* Directions toggle (selected in profile) */}
        {myDirections.length > 0 && (
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
        )}

        {/* Feed */}
        {loading ? (
          <div className="text-white/60">Loading…</div>
        ) : (
          posts.map((p) => (
            <div
              key={p.id}
              className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-md p-4 md:p-6 space-y-4 shadow-[0_8px_40px_rgba(0,0,0,0.25)]"
              onMouseEnter={() => addViewOnce(p.id)}
            >
              {/* header */}
              <div className="flex justify-between text-sm text-white/70">
                <div className="truncate">
                  <b>Author:</b> {p.user_id ? p.user_id.slice(0, 8) : "Unknown"}
                </div>
                <div>{new Date(p.created_at).toLocaleString()}</div>
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
                    <button
                      onClick={() => saveEdit(p)}
                      className="px-4 py-2 rounded-xl bg-white/90 text-black hover:bg-white"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-4 py-2 rounded-xl border border-white/20"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {p.body && <p className="leading-relaxed">{p.body}</p>}
                  {p.image_url && (
                    <img
                      src={p.image_url}
                      className="rounded-2xl border border-white/10"
                      alt=""
                    />
                  )}
                  {p.video_url && (
                    <video
                      controls
                      className="w-full rounded-2xl border border-white/10"
                    >
                      <source src={p.video_url} />
                    </video>
                  )}
                </>
              )}

              {/* author actions */}
              {uid === p.user_id && editingId !== p.id && (
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setEditingId(p.id);
                      setEditBody(p.body || "");
                    }}
                    className="px-3 py-1.5 rounded-lg border border-white/20 hover:bg-white/5"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deletePost(p)}
                    className="px-3 py-1.5 rounded-lg border border-white/20 hover:bg-white/5"
                  >
                    Delete
                  </button>
                </div>
              )}

              {/* footer */}
              <div className="flex items-center gap-5 text-white/80">
                <div className="flex items-center gap-1" title="Views">
                  <Eye />
                  <span className="text-sm">{p.views ?? 0}</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleLike(p)}
                    className={`px-2 py-1 rounded-lg text-sm border transition ${
                      likedByMe.has(p.id)
                        ? "border-white bg-white text-black"
                        : "border-white/20 hover:bg-white/10"
                    }`}
                    title="Growth"
                  >
                    🌱 Growth
                  </button>
                  <button
                    onClick={() => toggleLike(p)}
                    className={`px-2 py-1 rounded-lg text-sm border transition ${
                      likedByMe.has(p.id)
                        ? "border-white bg-white text-black"
                        : "border-white/20 hover:bg-white/10"
                    }`}
                    title="Value"
                  >
                    💎 Value
                  </button>
                  <button
                    onClick={() => toggleLike(p)}
                    className={`px-2 py-1 rounded-lg text-sm border transition ${
                      likedByMe.has(p.id)
                        ? "border-white bg-white text-black"
                        : "border-white/20 hover:bg-white/10"
                    }`}
                    title="With You"
                  >
                    🤝 With You
                  </button>
                </div>
                <span className="text-sm text-white/60">{p.likes_count ?? 0}</span>

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
                  {/* комментарии (N) */}
                  Comments ({commentCounts[p.id] ?? 0})
                </button>
              </div>

              {/* comments */}
              {openComments[p.id] && (
                <div className="space-y-2">
                  {comments[p.id]?.map((c) => (
                    <div
                      key={c.id}
                      className="rounded-xl bg-white/5 border border-white/10 p-2 text-sm"
                    >
                      <div className="text-xs text-white/60 flex justify-between">
                        <span>{c.user_id?.slice(0, 8) || "Anon"}</span>
                        <span>{new Date(c.created_at).toLocaleString()}</span>
                      </div>
                      <div className="mt-1">{c.body}</div>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <input
                      value={commentInput[p.id] || ""}
                      onChange={(e) =>
                        setCommentInput((prev) => ({
                          ...prev,
                          [p.id]: e.target.value,
                        }))
                      }
                      placeholder="Write a comment…"
                      className="flex-1 rounded-lg bg-transparent border border-white/10 px-3 py-2 outline-none placeholder-white/40"
                    />
                    <button
                      onClick={() => addComment(p.id)}
                      className="px-3 py-2 rounded-xl bg-white/90 text-black hover:bg-white"
                    >
                      Send
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}

        {/* Floating Post button */}
        <button
          type="button"
          onClick={() => setComposerOpen(true)}
          className="fixed right-6 bottom-6 btn btn-primary shadow-lg"
        >
          Post
        </button>

        {/* Composer modal */}
        {composerOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black/60"
              onClick={() => !publishing && setComposerOpen(false)}
            />
            <div className="relative z-10 w-full max-w-xl mx-auto p-4">
              <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-md p-4 md:p-6 shadow-[0_8px_40px_rgba(0,0,0,0.45)] space-y-4">
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
                  className="w-full bg-transparent outline-none placeholder-white/40 min-h-[120px] text-base md:text-lg text-white"
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
                    <button
                      onClick={onPublish}
                      disabled={publishing}
                      className="btn btn-primary"
                    >
                      {publishing ? "Publishing…" : "Publish"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

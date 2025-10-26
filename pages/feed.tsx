import { useEffect, useRef, useState } from "react";
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
  const imgRef = useRef<HTMLInputElement>(null);
  const vidRef = useRef<HTMLInputElement>(null);

  const [uid, setUid] = useState<string | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editBody, setEditBody] = useState<string>("");
  const [openComments, setOpenComments] = useState<Record<number, boolean>>({});
  const [commentInput, setCommentInput] = useState<Record<number, string>>({});
  const [comments, setComments] = useState<Record<number, Comment[]>>({});
  const [likedByMe, setLikedByMe] = useState<Set<number>>(new Set());
  const viewedOnce = useRef<Set<number>>(new Set());

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUid(data.user?.id ?? null));
    loadFeed();
  }, []);

  async function loadFeed() {
    setLoading(true);
    const { data, error } = await supabase
      .from("posts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (!error && data) setPosts(data as Post[]);
    setLoading(false);
  }

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
      if (data) setPosts((prev) => [data as Post, ...prev]);
      setText("");
      setImg(null);
      setVid(null);
    } catch (err: any) {
      alert(err.message || "Publish error");
    } finally {
      setPublishing(false);
    }
  }

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

  async function loadComments(postId: number) {
    const { data, error } = await supabase
      .from("comments")
      .select("*")
      .eq("post_id", postId)
      .order("created_at", { ascending: true });
    if (!error && data)
      setComments((prev) => ({ ...prev, [postId]: data as Comment[] }));
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
      setCommentInput((prev) => ({ ...prev, [postId]: "" }));
    }
  }

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
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      {/* Composer */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What do you want to share?"
          className="w-full bg-transparent outline-none placeholder-white/40 min-h-[80px]"
        />
        <input
          ref={imgRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => setImg(e.target.files?.[0] || null)}
        />
        <input
          ref={vidRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => setVid(e.target.files?.[0] || null)}
        />

        <div className="flex items-center gap-3">
          <button
            onClick={() => imgRef.current?.click()}
            className="h-10 w-10 grid place-items-center rounded-xl border border-white/10 hover:bg-white/10"
          >
            📷
          </button>
          <button
            onClick={() => vidRef.current?.click()}
            className="h-10 w-10 grid place-items-center rounded-xl border border-white/10 hover:bg-white/10"
          >
            🎥
          </button>
          <div className="ml-auto">
            <button
              onClick={onPublish}
              disabled={publishing}
              className="px-4 py-2 rounded-xl bg-white/90 text-black hover:bg-white"
            >
              {publishing ? "Publishing…" : "Publish"}
            </button>
          </div>
        </div>
      </div>

      {/* Feed */}
      {loading ? (
        <div className="text-white/60">Loading…</div>
      ) : (
        posts.map((p) => (
          <div
            key={p.id}
            className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3"
            onMouseEnter={() => addViewOnce(p.id)}
          >
            <div className="flex justify-between text-sm text-white/70">
              <div>
                <b>Author:</b> {p.user_id ? p.user_id.slice(0, 8) : "Unknown"}
              </div>
              <div>{new Date(p.created_at).toLocaleString()}</div>
            </div>

            {editingId === p.id ? (
              <div className="space-y-2">
                <textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  className="w-full bg-transparent border border-white/10 rounded-xl p-2"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => saveEdit(p)}
                    className="px-3 py-1 bg-white/90 text-black rounded-lg"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="px-3 py-1 border border-white/20 rounded-lg"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                {p.body && <p>{p.body}</p>}
                {p.image_url && (
                  <img
                    src={p.image_url}
                    className="rounded-xl border border-white/10"
                    alt=""
                  />
                )}
                {p.video_url && (
                  <video
                    controls
                    className="w-full rounded-xl border border-white/10"
                  >
                    <source src={p.video_url} />
                  </video>
                )}
              </>
            )}

            {uid === p.user_id && editingId !== p.id && (
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setEditingId(p.id);
                    setEditBody(p.body || "");
                  }}
                  className="px-3 py-1 border border-white/20 rounded-lg"
                >
                  Edit
                </button>
                <button
                  onClick={() => deletePost(p)}
                  className="px-3 py-1 border border-white/20 rounded-lg"
                >
                  Delete
                </button>
              </div>
            )}

            <div className="flex items-center gap-5 text-white/80">
              <div className="flex items-center gap-1">
                <Eye />
                <span>{p.views ?? 0}</span>
              </div>
              <button
                onClick={() => toggleLike(p)}
                className={`flex items-center gap-1 hover:text-white ${
                  likedByMe.has(p.id) ? "text-red-500" : ""
                }`}
              >
                ❤️ <span>{p.likes_count ?? 0}</span>
              </button>
              <button
                className="ml-auto underline"
                onClick={async () => {
                  setOpenComments((prev) => ({
                    ...prev,
                    [p.id]: !prev[p.id],
                  }));
                  if (!openComments[p.id]) await loadComments(p.id);
                }}
              >
                Comments
              </button>
            </div>

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
                    <div>{c.body}</div>
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
                    className="px-3 py-2 rounded-lg bg-white/90 text-black hover:bg-white"
                  >
                    Send
                  </button>
                </div>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

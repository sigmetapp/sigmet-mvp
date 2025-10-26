import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { RequireAuth } from '@/components/RequireAuth';

export default function FeedPage() {
  return (
    <RequireAuth>
      <FeedInner />
    </RequireAuth>
  );
}

type Post = {
  id: string;
  user_id: string;
  title: string | null;
  body: string | null;
  image_url: string | null;
  video_url: string | null;
  created_at: string;
  views: number;
  likes_count: number;
};

type Comment = {
  id: string;
  post_id: string;
  user_id: string;
  body: string | null;
  image_url: string | null;
  video_url: string | null;
  created_at: string;
};

function FeedInner() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<FileList | null>(null);
  const [items, setItems] = useState<Post[]>([]);
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<string>();

  async function load() {
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) { setMsg(error.message); return; }
    setItems((data ?? []) as Post[]);
  }
  useEffect(() => { load(); }, []);

  function getExtFromMime(mime?: string) {
    if (!mime) return 'bin';
    const map: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'video/mp4': 'mp4',
      'video/webm': 'webm',
      'video/quicktime': 'mov',
      'video/ogg': 'ogv',
    };
    return map[mime] || mime.split('/').pop() || 'bin';
  }
  const isVideo = (f: File) => f.type.startsWith('video/');

  async function uploadTo(bucketName: 'posts'|'comments', f: File, userId: string) {
    const ext = getExtFromMime(f.type);
    const path = `${userId}/${crypto.randomUUID()}.${ext}`;
    const bucket = supabase.storage.from(bucketName);
    const { error: upErr } = await bucket.upload(path, f, { upsert: false, contentType: f.type || undefined });
    if (upErr) throw upErr;
    const { data } = bucket.getPublicUrl(path);
    return data.publicUrl as string;
  }

  async function createPost() {
    setPending(true);
    setMsg(undefined);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setMsg('Not authenticated'); return; }

      let image_url: string | null = null;
      let video_url: string | null = null;

      if (files && files.length) {
        // допускаем фото и видео вместе: берём первое фото и первое видео
        const arr = Array.from(files);
        const img = arr.find(f => !isVideo(f));
        const vid = arr.find(f => isVideo(f));
        if (img) image_url = await uploadTo('posts', img, user.id);
        if (vid) video_url = await uploadTo('posts', vid, user.id);
      }

      const { error: insErr } = await supabase.from('posts').insert({
        user_id: user.id,
        title: title || null,
        body: body || null,
        image_url,
        video_url,
      });
      if (insErr) throw insErr;

      setTitle(''); setBody(''); setFiles(null);
      await load();
    } catch (err: any) {
      setMsg(err.message || 'Failed to publish');
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="max-w-2xl mx-auto p-6 space-y-6">
      <section className="card p-6 space-y-3">
        <h1 className="text-white text-xl font-semibold">Create a post</h1>
        <input className="input" placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} />
        <textarea className="input" placeholder="Text" value={body} onChange={e => setBody(e.target.value)} />
        <div className="space-y-2">
          <label className="label">Media (photos and/or videos)</label>
          <input
            type="file"
            accept="image/*,video/*"
            multiple
            onChange={e => setFiles(e.target.files)}
            className="text-white"
          />
          {files && files.length > 0 && (
            <div className="text-white/70 text-sm">
              Selected: {Array.from(files).map(f => f.name).join(', ')}
            </div>
          )}
        </div>
        {msg && <div className="text-white/80 text-sm">{msg}</div>}
        <button onClick={createPost} disabled={pending} className="btn btn-primary w-full disabled:opacity-60">
          {pending ? 'Please wait…' : 'Publish'}
        </button>
      </section>

      <section className="space-y-4">
        {items.map(p => (
          <PostCard key={p.id} post={p} onChanged={load} />
        ))}
        {!items.length && <div className="text-white/60 text-sm text-center py-6">No posts yet.</div>}
      </section>
    </main>
  );
}

function PostCard({ post, onChanged }: { post: Post; onChanged: () => Promise<void> }) {
  const seenRef = useRef(false);
  useEffect(() => {
    // Простой инкремент просмотров при первом маунте карточки
    if (seenRef.current) return;
    seenRef.current = true;
    supabase.rpc('increment_post_view', { p_post_id: post.id }).catch(() => {});
  }, [post.id]);

  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [cBody, setCBody] = useState('');
  const [cFiles, setCFiles] = useState<FileList | null>(null);
  const [likePending, setLikePending] = useState(false);
  const [hasLike, setHasLike] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      // проверяем, лайкнул ли пользователь
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return setHasLike(false);
      const { data } = await supabase.from('post_likes')
        .select('post_id')
        .eq('post_id', post.id)
        .eq('user_id', user.id)
        .maybeSingle();
      setHasLike(!!data);
    })();
  }, [post.id]);

  async function toggleLike() {
    setLikePending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      if (hasLike) {
        await supabase.from('post_likes').delete().eq('post_id', post.id).eq('user_id', user.id);
        setHasLike(false);
      } else {
        await supabase.from('post_likes').insert({ post_id: post.id, user_id: user.id });
        setHasLike(true);
      }
      await onChanged();
    } finally {
      setLikePending(false);
    }
  }

  async function loadComments() {
    setLoadingComments(true);
    const { data } = await supabase
      .from('comments')
      .select('*')
      .eq('post_id', post.id)
      .order('created_at', { ascending: true });
    setComments((data ?? []) as Comment[]);
    setLoadingComments(false);
  }

  useEffect(() => { loadComments(); }, [post.id]);

  function getExtFromMime(mime?: string) {
    if (!mime) return 'bin';
    const map: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'video/mp4': 'mp4',
      'video/webm': 'webm',
      'video/quicktime': 'mov',
      'video/ogg': 'ogv',
    };
    return map[mime] || mime.split('/').pop() || 'bin';
  }
  const isVideo = (f: File) => f.type.startsWith('video/');

  async function uploadCommentFile(f: File, uid: string) {
    const ext = getExtFromMime(f.type);
    const path = `${uid}/${crypto.randomUUID()}.${ext}`;
    const bucket = supabase.storage.from('comments');
    const { error: upErr } = await bucket.upload(path, f, { upsert: false, contentType: f.type || undefined });
    if (upErr) throw upErr;
    const { data } = bucket.getPublicUrl(path);
    return data.publicUrl as string;
  }

  async function submitComment() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    let image_url: string | null = null;
    let video_url: string | null = null;
    if (cFiles && cFiles.length) {
      const arr = Array.from(cFiles);
      const img = arr.find(f => !isVideo(f));
      const vid = arr.find(f => isVideo(f));
      if (img) image_url = await uploadCommentFile(img, user.id);
      if (vid) video_url = await uploadCommentFile(vid, user.id);
    }
    await supabase.from('comments').insert({
      post_id: post.id,
      user_id: user.id,
      body: cBody || null,
      image_url,
      video_url,
    });
    setCBody('');
    setCFiles(null);
    await loadComments();
  }

  return (
    <article className="card overflow-hidden">
      {post.image_url && <img src={post.image_url} alt="" className="w-full aspect-video object-cover" />}
      {post.video_url && (
        <video className="w-full aspect-video object-cover" src={post.video_url} controls preload="metadata" />
      )}
      <div className="p-4 space-y-3">
        {post.title && <h3 className="text-white font-medium">{post.title}</h3>}
        {post.body && <p className="text-white/80 text-sm whitespace-pre-wrap">{post.body}</p>}

        <div className="flex items-center gap-4 text-white/70 text-sm">
          <div>Views: <span className="text-white">{post.views}</span></div>
          <button onClick={toggleLike} disabled={likePending} className="text-white/80 hover:text-white">
            {hasLike ? '−' : '+'} {post.likes_count}
          </button>
        </div>

        <div className="border-t border-white/10 pt-3">
          <h4 className="text-white/80 text-sm mb-2">Comments</h4>

          <div className="space-y-2 mb-3">
            <textarea
              className="input"
              placeholder="Write a comment…"
              value={cBody}
              onChange={e => setCBody(e.target.value)}
            />
            <input
              type="file"
              accept="image/*,video/*"
              multiple
              onChange={e => setCFiles(e.target.files)}
              className="text-white"
            />
            <button onClick={submitComment} className="btn btn-primary w-full">Publish comment</button>
          </div>

          {loadingComments && <div className="text-white/60 text-sm">Loading comments…</div>}
          {!!comments.length && (
            <ul className="space-y-3">
              {comments.map(c => (
                <li key={c.id} className="bg-white/5 rounded-xl p-3">
                  {c.body && <div className="text-white/80 text-sm whitespace-pre-wrap">{c.body}</div>}
                  {c.image_url && <img src={c.image_url} alt="" className="w-full mt-2 rounded-lg object-cover" />}
                  {c.video_url && (
                    <video className="w-full mt-2 rounded-lg object-cover" src={c.video_url} controls preload="metadata" />
                  )}
                  <div className="text-white/40 text-xs mt-2">{new Date(c.created_at).toLocaleString()}</div>
                </li>
              ))}
            </ul>
          )}
          {!comments.length && <div className="text-white/50 text-xs">No comments yet.</div>}
        </div>
      </div>
    </article>
  );
}

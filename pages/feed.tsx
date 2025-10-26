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
  id: string;
  post_id: number;
  user_id: string;
  body: string | null;
  image_url: string | null;
  video_url: string | null;
  created_at: string;
};

type Profile = {
  user_id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
};

function FeedInner() {
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
        const arr = Array.from(files);
        const img = arr.find(f => !isVideo(f));
        const vid = arr.find(f => isVideo(f));
        if (img) image_url = await uploadTo('posts', img, user.id);
        if (vid) video_url = await uploadTo('posts', vid, user.id);
      }

      const { error: insErr } = await supabase.from('posts').insert({
        user_id: user.id,
        author_id: user.id,
        body: body || null,
        image_url,
        video_url,
      });
      if (insErr) throw insErr;

      setBody(''); setFiles(null);
      await load();
    } catch (err: any) {
      setMsg(err.message || 'Failed to publish');
    } finally {
      setPending(false);
    }
  }

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const openFilePicker = () => fileInputRef.current?.click();

  return (
    <main className="max-w-2xl mx-auto p-6 space-y-6">
      <section className="card p-6 space-y-3">
        <h1 className="text-white text-xl font-semibold">Create a post</h1>

        <div className="flex items-start gap-3">
          <textarea
            className="input flex-1"
            placeholder="What's on your mind?"
            value={body}
            onChange={e => setBody(e.target.value)}
          />
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={openFilePicker}
              className="rounded-full w-10 h-10 bg-white/10 hover:bg-white/20 border border-white/10 flex items-center justify-center"
              title="Add photo/video"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" className="text-white/80">
                <path fill="currentColor" d="M16.5 6.5L7.5 15.5a3 3 0 1 0 4.24 4.24l9-9a5 5 0 1 0-7.07-7.07l-9 9" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              onChange={e => setFiles(e.target.files)}
              className="hidden"
            />
          </div>
        </div>

        {files && files.length > 0 && (
          <div className="text-white/70 text-xs">
            Attached: {Array.from(files).map(f => f.name).join(', ')}
          </div>
        )}

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

function timeAgo(dateStr: string) {
  const d = new Date(dateStr);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  const steps = [60, 60, 24, 7, 4.345, 12];
  let i = 0, val = s;
  while (i < steps.length && val >= steps[i]) { val = Math.floor(val / steps[i]); i++; }
  const label = ['sec','min','hr','day','wk','mo','yr'][i] || 'yr';
  return `${val} ${label}${val !== 1 ? 's' : ''} ago`;
}

function PostCard({ post, onChanged }: { post: Post; onChanged: () => Promise<void> }) {
  const seenRef = useRef(false);
  useEffect(() => {
    if (seenRef.current) return;
    seenRef.current = true;
    (async () => {
      const { error } = await supabase.rpc('increment_post_view', { p_post_id: post.id });
      // if (error) console.warn('increment view error', error);
    })();
  }, [post.id]);

  const [profile, setProfile] = useState<Profile | null>(null);
  useEffect(() => {
    (async () => {
      if (!post.user_id) return;
      const { data } = await supabase
        .from('profiles')
        .select('user_id,username,full_name,avatar_url')
        .eq('user_id', post.user_id)
        .maybeSingle();
      setProfile((data as Profile) || null);
    })();
  }, [post.user_id]);

  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [cBody, setCBody] = useState('');
  const [cFiles, setCFiles] = useState<FileList | null>(null);
  const [likePending, setLikePending] = useState(false);
  const [hasLike, setHasLike] = useState<boolean | null>(null);
  const [likesCount, setLikesCount] = useState<number>(post.likes_count);

  useEffect(() => {
    (async () => {
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
        setLikesCount(c => Math.max(c - 1, 0));
      } else {
        await supabase.from('post_likes').insert({ post_id: post.id, user_id: user.id });
        setHasLike(true);
        setLikesCount(c => c + 1);
      }
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
      <div className="p-4 flex items-center gap-3 border-b border-white/10">
        <img
          src={profile?.avatar_url || '/avatar-fallback.png'}
          className="w-9 h-9 rounded-full object-cover"
          alt="avatar"
        />
        <div className="min-w-0">
          <div className="text-white text-sm font-medium truncate">
            {profile?.full_name || profile?.username || 'Unknown user'}
          </div>
          <div className="text-white/50 text-xs">{timeAgo(post.created_at)}</div>
        </div>
      </div>

      {post.image_url && <img src={post.image_url} alt="" className="w-full aspect-video object-cover" />}
      {post.video_url && (
        <video className="w-full aspect-video object-cover" src={post.video_url} controls preload="metadata" />
      )}

      <div className="p-4 space-y-3">
        {post.body && <p className="text-white/80 text-sm whitespace-pre-wrap">{post.body}</p>}

        <div className="flex items-center gap-4 text-white/70 text-sm">
          <div>Views: <span className="text-white">{post.views}</span></div>
          <button
            onClick={toggleLike}
            disabled={likePending}
            className={`flex items-center gap-1 ${hasLike ? 'text-white' : 'text-white/80 hover:text-white'}`}
            title={hasLike ? 'Unlike' : 'Like'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" className="inline">
              <path fill="currentColor" d="M12 21s-6.716-4.35-9.193-7.18C1.05 12 2.3 8.5 5.5 8.5c2.1 0 3.1 1.5 3.5 2 .4-.5 1.4-2 3.5-2 3.2 0 4.45 3.5 2.693 5.32C18.716 16.65 12 21 12 21z"/>
            </svg>
            <span>{likesCount}</span>
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

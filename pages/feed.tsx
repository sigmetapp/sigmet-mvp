import { useEffect, useState } from 'react';
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
};

function FeedInner() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [items, setItems] = useState<Post[]>([]);
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<string>();

  async function load() {
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) {
      setMsg(error.message);
      return;
    }
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

  function isVideo(f?: File | null) {
    return !!f && f.type.startsWith('video/');
  }

  async function createPost() {
    setPending(true);
    setMsg(undefined);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setMsg('Not authenticated'); return; }

      let image_url: string | null = null;
      let video_url: string | null = null;

      if (file) {
        const ext = getExtFromMime(file.type);
        const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
        const bucket = supabase.storage.from('posts');
        const { error: upErr } = await bucket.upload(path, file, { upsert: false, contentType: file.type || undefined });
        if (upErr) throw upErr;
        const { data } = bucket.getPublicUrl(path);
        if (isVideo(file)) video_url = data.publicUrl;
        else image_url = data.publicUrl;
      }

      const { error: insErr } = await supabase.from('posts').insert({
        user_id: user.id,
        title: title || null,
        body: body || null,
        image_url,
        video_url,
      });
      if (insErr) throw insErr;

      setTitle('');
      setBody('');
      setFile(null);
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
        <input
          className="input"
          placeholder="Title"
          value={title}
          onChange={e => setTitle(e.target.value)}
        />
        <textarea
          className="input"
          placeholder="Text"
          value={body}
          onChange={e => setBody(e.target.value)}
        />
        <div className="space-y-2">
          <label className="label">Media (photo or video)</label>
          <input
            type="file"
            accept="image/*,video/*"
            onChange={e => setFile(e.target.files?.[0] || null)}
            className="text-white"
          />
          {file && (
            <div className="text-white/70 text-sm">
              Selected: <span className="font-medium">{file.name}</span> ({file.type || 'unknown'})
            </div>
          )}
        </div>

        {msg && <div className="text-white/80 text-sm">{msg}</div>}

        <button
          onClick={createPost}
          disabled={pending}
          className="btn btn-primary w-full disabled:opacity-60"
        >
          {pending ? 'Please wait…' : 'Publish'}
        </button>
      </section>

      <section className="space-y-4">
        {items.map(p => (
          <article key={p.id} className="card overflow-hidden">
            {p.image_url && (
              <img src={p.image_url} alt="" className="w-full aspect-video object-cover" />
            )}
            {p.video_url && (
              <video
                className="w-full aspect-video object-cover"
                src={p.video_url}
                controls
                preload="metadata"
              />
            )}
            <div className="p-4">
              {p.title && <h3 className="text-white font-medium">{p.title}</h3>}
              {p.body && <p className="text-white/80 text-sm mt-1 whitespace-pre-wrap">{p.body}</p>}
              <div className="text-white/40 text-xs mt-2">
                {new Date(p.created_at).toLocaleString()}
              </div>
            </div>
          </article>
        ))}
        {!items.length && (
          <div className="text-white/60 text-sm text-center py-6">No posts yet.</div>
        )}
      </section>
    </main>
  );
}

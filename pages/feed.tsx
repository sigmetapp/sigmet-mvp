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

function FeedInner() {
  const [text, setText] = useState('');
  const [img, setImg] = useState<File | null>(null);
  const [vid, setVid] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [uid, setUid] = useState<string | null>(null);

  const imgRef = useRef<HTMLInputElement>(null);
  const vidRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // берем текущего юзера
    supabase.auth.getUser().then(({ data }) => {
      setUid(data.user?.id ?? null);
    });
    // подгружаем последние посты (простая публичная лента)
    supabase
      .from('posts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (data) setPosts(data as Post[]);
      });
  }, []);

  function pickImg(){ imgRef.current?.click(); }
  function pickVid(){ vidRef.current?.click(); }

  function onPickImg(e: React.ChangeEvent<HTMLInputElement>){
    const f = e.target.files?.[0];
    if (f && f.type.startsWith('image/')) setImg(f);
  }
  function onPickVid(e: React.ChangeEvent<HTMLInputElement>){
    const f = e.target.files?.[0];
    if (f && f.type.startsWith('video/')) setVid(f);
  }

  async function uploadToStorage(file: File, folder: 'images'|'videos') {
    const ext = file.name.split('.').pop() || 'bin';
    const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const bucket = supabase.storage.from('posts'); // бакет posts
    const { error } = await bucket.upload(path, file, { upsert: false, contentType: file.type || undefined });
    if (error) throw error;
    const { data } = bucket.getPublicUrl(path);
    return data.publicUrl as string;
  }

  async function onPublish() {
    if (!uid) { alert('Нет пользователя'); return; }
    if (!text && !img && !vid) { alert('Пустой пост'); return; }

    setSubmitting(true);
    try {
      let image_url: string | null = null;
      let video_url: string | null = null;

      if (img) image_url = await uploadToStorage(img, 'images');
      if (vid) video_url = await uploadToStorage(vid, 'videos');

      const { data, error } = await supabase
        .from('posts')
        .insert({
          user_id: uid,
          body: text || null,
          image_url,
          video_url,
        })
        .select('*')
        .single();

      if (error) throw error;

      // prepend новый пост в ленту
      setPosts((prev) => data ? [data as Post, ...prev] : prev);
      setText('');
      setImg(null);
      setVid(null);
      alert('Опубликовано');
    } catch (e: any) {
      alert(e?.message || 'Ошибка публикации');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      {/* Composer */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="О чём расскажешь?"
          className="w-full resize-none bg-transparent outline-none placeholder-white/40 min-h-[80px]"
        />

        {/* скрытые инпуты */}
        <input ref={imgRef} type="file" accept="image/*" className="hidden" onChange={onPickImg} />
        <input ref={vidRef} type="file" accept="video/*" className="hidden" onChange={onPickVid} />

        {/* две круглые иконки */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={pickImg}
            className="h-10 w-10 grid place-items-center rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition"
            aria-label="Загрузить фото"
            title="Загрузить фото"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
              <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.5"/>
              <circle cx="9" cy="10" r="2" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M21 16l-4.5-4.5L9 19" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
            </svg>
          </button>

          <button
            type="button"
            onClick={pickVid}
            className="h-10 w-10 grid place-items-center rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition"
            aria-label="Загрузить видео"
            title="Загрузить видео"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
              <rect x="3" y="5" width="13" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M19 8l3 2v4l-3 2V8z" stroke="currentColor" strokeWidth="1.5" fill="none"/>
            </svg>
          </button>

          <div className="ml-auto">
            <button
              type="button"
              onClick={onPublish}
              disabled={submitting}
              className="px-4 py-2 rounded-xl bg-white/90 text-black hover:bg-white disabled:opacity-60"
            >
              {submitting ? 'Публикация…' : 'Опубликовать'}
            </button>
          </div>
        </div>
      </div>

      {/* Простая лента (минимум) */}
      <div className="space-y-4">
        {posts.map((p) => (
          <div key={p.id} className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-2">
            {p.body && <p className="whitespace-pre-wrap">{p.body}</p>}
            {p.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.image_url} alt="" className="rounded-xl border border-white/10" />
            )}
            {p.video_url && (
              <video controls className="w-full rounded-xl border border-white/10">
                <source src={p.video_url} />
              </video>
            )}
            <div className="text-xs text-white/50">{new Date(p.created_at).toLocaleString()}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

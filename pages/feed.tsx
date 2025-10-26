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

function FeedInner() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [items, setItems] = useState<any[]>([]);

  async function load() {
    const { data } = await supabase.from('posts').select('*').order('created_at', { ascending: false }).limit(50);
    setItems(data || []);
  }
  useEffect(() => { load(); }, []);

  async function createPost() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    let image_url: string | undefined;
    if (file) {
      const path = `${user.id}/${crypto.randomUUID()}.jpg`;
      const { error: upErr } = await supabase.storage.from('posts').upload(path, file, { upsert: false });
      if (upErr) { alert(upErr.message); return; }
      const { data } = supabase.storage.from('posts').getPublicUrl(path);
      image_url = data.publicUrl;
    }
    const { error } = await supabase.from('posts').insert({ user_id: user.id, title, body, image_url: image_url || null });
    if (error) { alert(error.message); return; }
    setTitle(''); setBody(''); setFile(null);
    await load();
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-3">
        <input
          className="w-full rounded-xl bg-white/10 text-white px-3 py-3"
          placeholder="Title"
          value={title}
          onChange={e => setTitle(e.target.value)}
        />
        <textarea
          className="w-full rounded-xl bg-white/10 text-white px-3 py-3"
          placeholder="Text"
          value={body}
          onChange={e => setBody(e.target.value)}
        />
        <input type="file" onChange={e => setFile(e.target.files?.[0] || null)} className="text-white" />
        <button onClick={createPost} className="w-full rounded-xl py-3 bg-white text-black font-medium">Publish</button>
      </div>

      <div className="space-y-4">
        {items.map(p => (
          <article key={p.id} className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            {p.image_url && <img src={p.image_url} alt="" className="w-full aspect-video object-cover" />}
            <div className="p-4">
              <h3 className="text-white font-medium">{p.title}</h3>
              {p.body && <p className="text-white/80 text-sm mt-1">{p.body}</p>}
              <div className="text-white/40 text-xs mt-2">{new Date(p.created_at).toLocaleString()}</div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

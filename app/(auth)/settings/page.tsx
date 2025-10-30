'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useSiteSettings } from '@/components/SiteSettingsContext';

export default function SettingsPage() {
  return <SettingsInner />;
}

function SettingsInner() {
  const { site_name, logo_url } = useSiteSettings();
  const [name, setName] = useState(site_name || '');
  const [logo, setLogo] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(logo_url || null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setName(site_name || ''); }, [site_name]);
  useEffect(() => { setPreview(logo_url || null); }, [logo_url]);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setLogo(f);
    setPreview(URL.createObjectURL(f));
  }

  async function uploadLogo(file: File) {
    const ext = file.name.split('.').pop() || 'png';
    const path = `logos/site-${Date.now()}.${ext}`;
    const bucket = supabase.storage.from('assets');
    const { error } = await bucket.upload(path, file, { upsert: true, contentType: file.type || 'image/png' });
    if (error) throw error;
    const { data } = bucket.getPublicUrl(path);
    return data.publicUrl as string;
  }

  async function save() {
    setSaving(true);
    try {
      let newLogoUrl = logo_url || null;
      if (logo) newLogoUrl = await uploadLogo(logo);

      const { data: u } = await supabase.auth.getUser();
      const uid = u?.user?.id ?? null;

      const payload = {
        id: 1,
        site_name: name || null,
        logo_url: newLogoUrl,
        updated_by: uid,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('site_settings')
        .upsert(payload, { onConflict: 'id' });

      if (error) throw error;
      window.location.reload();
    } catch (e: any) {
      alert(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto p-6 space-y-6">
      <h1 className="text-xl font-medium text-white/90">Site Settings</h1>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
        <label className="block space-y-2">
          <span className="text-sm text-white/70">Site name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="SIGMET"
            className="w-full rounded-xl bg-transparent border border-white/10 px-3 py-2 outline-none placeholder-white/40"
          />
        </label>

        <div className="space-y-2">
          <span className="text-sm text-white/70">Logo</span>
          <div className="flex items-center gap-3">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
            <button
              onClick={() => fileRef.current?.click()}
              className="h-10 px-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10"
            >
              Choose file
            </button>
            {preview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Logo preview" className="h-10 w-10 rounded-lg border border-white/10 object-cover" />
            )}
          </div>
          <p className="text-xs text-white/50">Recommended: square PNG/SVG, 36–40px height in header.</p>
        </div>

        <div className="pt-2">
          <button
            onClick={save}
            disabled={saving}
            className="relative inline-flex items-center gap-2 rounded-2xl px-5 py-2.5
                       bg-gradient-to-r from-white to-white/90 text-black
                       shadow-[0_8px_24px_rgba(255,255,255,0.25)] hover:shadow-[0_10px_36px_rgba(255,255,255,0.35)]
                       hover:translate-y-[-1px] active:translate-y-0 transition
                       disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save changes'}
            <span className="absolute inset-0 rounded-2xl ring-1 ring-white/30 pointer-events-none" />
          </button>
        </div>
      </div>
    </div>
  );
}

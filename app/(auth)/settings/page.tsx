'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useSiteSettings } from '@/components/SiteSettingsContext';

export default function SettingsPage() {
  return <SettingsInner />;
}

function SettingsInner() {
  const { site_name, logo_url, invites_only, allowed_continents } = useSiteSettings();
  const [isAdmin, setIsAdmin] = useState<null | boolean>(null);
  const [name, setName] = useState(site_name || '');
  const [logo, setLogo] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(logo_url || null);
  const [saving, setSaving] = useState(false);
  const [invitesOnly, setInvitesOnly] = useState<boolean>(!!invites_only);
  const [continents, setContinents] = useState<string[]>(Array.isArray(allowed_continents) ? allowed_continents! : []);
  const [users, setUsers] = useState<any[] | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(site_name || '');
  }, [site_name]);
  useEffect(() => {
    setPreview(logo_url || null);
  }, [logo_url]);
  useEffect(() => {
    setInvitesOnly(!!invites_only);
    setContinents(Array.isArray(allowed_continents) ? allowed_continents! : []);
  }, [invites_only, allowed_continents]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const email = data?.user?.email || '';
      const allowed = email === 'seosasha@gmail.com';
      setIsAdmin(!!allowed);
      if (!allowed && typeof window !== 'undefined') {
        // redirect non-admins
        window.location.href = '/';
      }
    })();
  }, []);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setLogo(f);
    setPreview(URL.createObjectURL(f));
  }

  function toggleContinent(code: string) {
    setContinents((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }

  async function fileToBase64(file: File): Promise<string> {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  async function save() {
    setSaving(true);
    try {
      let logoPayload: { name: string; type?: string; dataBase64: string } | null = null;
      if (logo) {
        const dataBase64 = await fileToBase64(logo);
        logoPayload = { name: logo.name, type: logo.type, dataBase64 };
      }

      const resp = await fetch('/api/admin/site-settings.update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site_name: name || null,
          invites_only: !!invitesOnly,
          allowed_continents: continents,
          logo: logoPayload,
        }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json?.error || 'Save failed');
      window.location.reload();
    } catch (e: any) {
      alert(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function loadUsers() {
    setLoadingUsers(true);
    try {
      const resp = await fetch('/api/admin/users.list');
      const json = await resp.json();
      if (!resp.ok) throw new Error(json?.error || 'Failed to load users');
      setUsers(json.users || []);
    } catch (e) {
      setUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  }

  async function deleteUser(userId: string) {
    if (!confirm('Delete this user? This cannot be undone.')) return;
    const resp = await fetch('/api/admin/users.delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    });
    const json = await resp.json();
    if (!resp.ok) {
      alert(json?.error || 'Failed to delete');
    } else {
      setUsers((prev) => (prev ? prev.filter((u) => u.id !== userId) : prev));
    }
  }

  if (isAdmin === null) return null;
  if (!isAdmin) return null;

  const continentOptions: { code: string; label: string }[] = [
    { code: 'AF', label: 'Africa' },
    { code: 'AN', label: 'Antarctica' },
    { code: 'AS', label: 'Asia' },
    { code: 'EU', label: 'Europe' },
    { code: 'NA', label: 'North America' },
    { code: 'OC', label: 'Oceania' },
    { code: 'SA', label: 'South America' },
  ];

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-xl font-medium text-white/90">Site Settings (Admin)</h1>

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

      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
        <h2 className="text-white/90 font-medium">Registration controls</h2>
        <label className="flex items-center gap-2 text-white/80">
          <input type="checkbox" checked={invitesOnly} onChange={(e) => setInvitesOnly(e.target.checked)} />
          <span>Registration by invites only</span>
        </label>
        <div className="pt-2 space-y-2">
          <div className="text-sm text-white/70">Allowed continents (by IP)</div>
          <div className="grid grid-cols-2 gap-2">
            {continentOptions.map((opt) => (
              <label key={opt.code} className="flex items-center gap-2 text-white/80">
                <input
                  type="checkbox"
                  checked={continents.includes(opt.code)}
                  onChange={() => toggleContinent(opt.code)}
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-white/90 font-medium">User management</h2>
          <button onClick={loadUsers} className="h-9 px-3 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10">
            {loadingUsers ? 'Loading…' : 'Load last 30 users'}
          </button>
        </div>
        {users && (
          <div className="divide-y divide-white/10 rounded-xl border border-white/10">
            {users.map((u) => (
              <div key={u.id} className="flex items-center justify-between px-3 py-2">
                <div className="text-white/80 text-sm">
                  <div>{u.email || '(no email)'}</div>
                  <div className="text-white/50 text-xs">{new Date(u.created_at).toLocaleString()}</div>
                </div>
                <button onClick={() => deleteUser(u.id)} className="h-8 px-3 rounded-lg border border-red-500/30 text-red-300 hover:bg-red-500/10">
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

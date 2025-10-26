import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { RequireAuth } from '@/components/RequireAuth';

export default function ProfilePage() {
  return (
    <RequireAuth>
      <ProfileSettings />
    </RequireAuth>
  );
}

function ProfileSettings() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState<string>();

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      setProfile(
        data || { user_id: user.id, username: '', full_name: '', bio: '', avatar_url: '' }
      );
      setLoading(false);
    })();
  }, []);

  async function saveProfile() {
    if (!profile) return;
    const { error } = await supabase.from('profiles').upsert(profile, { onConflict: 'user_id' });
    setNote(error ? error.message : 'Profile saved');
  }

  async function uploadAvatar() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !file) return;
    const path = `${user.id}/avatar.png`;
    const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
    if (upErr) { setNote(upErr.message); return; }
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    setProfile((p: any) => ({ ...p, avatar_url: data.publicUrl }));
  }

  if (loading) return <div className="p-6 text-white/70">Loading...</div>;

  return (
    <main className="max-w-2xl mx-auto p-6">
      <div className="card p-6 space-y-5">
        <h1 className="text-white text-xl font-semibold">Profile settings</h1>

        <div className="flex items-center gap-4">
          <img
            src={profile.avatar_url || '/avatar-fallback.png'}
            className="w-16 h-16 rounded-full object-cover"
            alt="avatar"
          />
          <div>
            <input type="file" onChange={e => setFile(e.target.files?.[0] || null)} className="text-white" />
            <button
              onClick={uploadAvatar}
              className="ml-2 px-3 py-2 rounded-lg bg-white text-black text-sm"
            >
              Upload
            </button>
          </div>

cat > pages/profile.tsx <<'TSX'
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { RequireAuth } from '@/components/RequireAuth';

export default function ProfilePage() {
  return (
    <RequireAuth>
      <ProfileSettings />
    </RequireAuth>
  );
}

function ProfileSettings() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState<string>();

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      setProfile(
        data || { user_id: user.id, username: '', full_name: '', bio: '', avatar_url: '' }
      );
      setLoading(false);
    })();
  }, []);

  async function saveProfile() {
    if (!profile) return;
    const { error } = await supabase.from('profiles').upsert(profile, { onConflict: 'user_id' });
    setNote(error ? error.message : 'Profile saved');
  }

  async function uploadAvatar() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !file) return;
    const path = `${user.id}/avatar.png`;
    const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
    if (upErr) { setNote(upErr.message); return; }
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    setProfile((p: any) => ({ ...p, avatar_url: data.publicUrl }));
  }

  if (loading) return <div className="p-6 text-white/70">Loading...</div>;

  return (
    <main className="max-w-2xl mx-auto p-6">
      <div className="card p-6 space-y-5">
        <h1 className="text-white text-xl font-semibold">Profile settings</h1>

        <div className="flex items-center gap-4">
          <img
            src={profile.avatar_url || '/avatar-fallback.png'}
            className="w-16 h-16 rounded-full object-cover"
            alt="avatar"
          />
          <div>
            <input type="file" onChange={e => setFile(e.target.files?.[0] || null)} className="text-white" />
            <button
              onClick={uploadAvatar}
              className="ml-2 px-3 py-2 rounded-lg bg-white text-black text-sm"
            >
              Upload
            </button>
          </div>
        </div>

        <div>
          <label className="label">Username</label>
          <input
            className="input"
            value={profile.username || ''}
            onChange={e => setProfile({ ...profile, username: e.target.value })}
          />
        </div>

        <div>
          <label className="label">Full name</label>
          <input
            className="input"
            value={profile.full_name || ''}
            onChange={e => setProfile({ ...profile, full_name: e.target.value })}
          />
        </div>

        <div>
          <label className="label">About</label>
          <textarea
            className="input"
            value={profile.bio || ''}
            onChange={e => setProfile({ ...profile, bio: e.target.value })}
          />
        </div>

        {note && <div className="text-white/70 text-sm">{note}</div>}
        <button
          onClick={saveProfile}
          className="btn btn-primary w-full"
        >
          Save
        </button>
      </div>
    </main>
  );
}

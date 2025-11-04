'use client';

import { useEffect, useState } from 'react';
import Button from '@/components/Button';
import { supabase } from '@/lib/supabaseClient';
import { RequireAuth } from '@/components/RequireAuth';
import CountryCitySelect from '@/components/CountryCitySelect';
import { useTheme } from '@/components/ThemeProvider';

export default function ProfilePage() {
  return (
    <RequireAuth>
      <ProfileSettings />
    </RequireAuth>
  );
}

function ProfileSettings() {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const AVATAR_FALLBACK =
    "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='100%' height='100%' fill='%23222'/><circle cx='32' cy='24' r='14' fill='%23555'/><rect x='12' y='44' width='40' height='12' rx='6' fill='%23555'/></svg>";
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
        data || {
          user_id: user.id,
          username: '',
          full_name: '',
          bio: '',
          avatar_url: '',
          country: '',
          website_url: '',
          facebook_url: '',
          instagram_url: '',
          twitter_url: '',
          directions_selected: [],
          show_online_status: true,
        }
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
    // Persist to DB immediately so other pages (public profile, feed, comments) see it
    try {
      await supabase.from('profiles').upsert({ user_id: user.id, avatar_url: data.publicUrl }, { onConflict: 'user_id' });
      setProfile((p: any) => ({ ...p, avatar_url: data.publicUrl }));
      setNote('Avatar updated');
    } catch (e: any) {
      setProfile((p: any) => ({ ...p, avatar_url: data.publicUrl }));
      setNote('Avatar uploaded, but failed to save profile');
    }
  }

  if (loading) return <div className={`p-6 ${isLight ? "text-telegram-text-secondary" : "text-telegram-text-secondary"}`}>Loading...</div>;

  return (
    <main className="max-w-2xl mx-auto px-4 py-6 md:p-6">
      <div className="telegram-card-glow p-4 md:p-6 space-y-5">
        <h1 className={`text-xl font-semibold ${isLight ? "text-telegram-text" : "text-telegram-text"}`}>Profile settings</h1>

        <div className="flex items-center gap-4">
          <img
            src={profile.avatar_url || AVATAR_FALLBACK}
            className={`w-16 h-16 rounded-full object-cover border ${isLight ? "border-telegram-blue/20" : "border-telegram-blue/30"}`}
            alt="avatar"
          />
          <div>
            <input type="file" onChange={e => setFile(e.target.files?.[0] || null)} className={`${isLight ? "text-telegram-text" : "text-telegram-text"}`} />
            <Button onClick={uploadAvatar} variant="secondary" size="sm" className="ml-2">
              Upload
            </Button>
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

        <div>
          <label className="label">Country - City</label>
          {/* Single searchable field that stores value as "City, Country" */}
          <CountryCitySelect
            value={profile.country || ''}
            onChange={(combined: string) => setProfile({ ...profile, country: combined })}
          />
        </div>

        <div>
          <label className="label">Website / Blog / Portfolio</label>
          <input
            className="input"
            value={profile.website_url || ''}
            onChange={e => setProfile({ ...profile, website_url: e.target.value })}
            placeholder="https://example.com"
          />
        </div>

        <div>
          <label className="label">Social Media</label>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-white/60 mb-1 block">Facebook</label>
              <input
                className="input"
                value={profile.facebook_url || ''}
                onChange={e => setProfile({ ...profile, facebook_url: e.target.value })}
                placeholder="https://facebook.com/yourprofile"
              />
            </div>
            <div>
              <label className="text-xs text-white/60 mb-1 block">Instagram</label>
              <input
                className="input"
                value={profile.instagram_url || ''}
                onChange={e => setProfile({ ...profile, instagram_url: e.target.value })}
                placeholder="https://instagram.com/yourprofile"
              />
            </div>
            <div>
              <label className="text-xs text-white/60 mb-1 block">X.com (Twitter)</label>
              <input
                className="input"
                value={profile.twitter_url || ''}
                onChange={e => setProfile({ ...profile, twitter_url: e.target.value })}
                placeholder="https://x.com/yourprofile"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="label">Online Status</label>
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="online_status"
                checked={profile.show_online_status !== false}
                onChange={() => setProfile({ ...profile, show_online_status: true })}
                className={isLight ? "text-telegram-blue" : "text-telegram-blue-light"}
              />
              <span className={isLight ? "text-telegram-text" : "text-telegram-text"}>Show online</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="online_status"
                checked={profile.show_online_status === false}
                onChange={() => setProfile({ ...profile, show_online_status: false })}
                className={isLight ? "text-telegram-blue" : "text-telegram-blue-light"}
              />
              <span className={isLight ? "text-telegram-text" : "text-telegram-text"}>Don't show online</span>
            </label>
          </div>
        </div>

        {note && <div className={`text-sm ${isLight ? "text-telegram-text-secondary" : "text-telegram-text-secondary"}`}>{note}</div>}
        <Button onClick={saveProfile} variant="primary" className="w-full">
          Save
        </Button>
      </div>
    </main>
  );
}

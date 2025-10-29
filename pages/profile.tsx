import { useEffect, useMemo, useState } from 'react';
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

  // 12 Areas of Growth (ids are saved to profiles.directions_selected)
  const GROWTH_AREAS = useMemo(
    () => [
      { id: 'health', emoji: '💚', title: 'Health', desc: 'Sleep, nutrition, prevention, daily energy' },
      { id: 'thinking', emoji: '🧠', title: 'Thinking', desc: 'Critical thinking, focus, deep work' },
      { id: 'learning', emoji: '📚', title: 'Learning', desc: 'Skills, languages, structured mastery' },
      { id: 'career', emoji: '🧩', title: 'Career', desc: 'Goals, strategy, portfolio, market impact' },
      { id: 'finance', emoji: '💰', title: 'Finance', desc: 'Income, budgeting, investing, safety buffer' },
      { id: 'relationships', emoji: '🤝', title: 'Relationships', desc: 'Family, friends, network and trust' },
      { id: 'creativity', emoji: '🎨', title: 'Creativity', desc: 'Projects, ideas, self expression and style' },
      { id: 'sport', emoji: '🏃‍♂️', title: 'Sport', desc: 'Strength, endurance, movement and discipline' },
      { id: 'habits', emoji: '⏱️', title: 'Habits', desc: 'Daily rhythm, order, life automation' },
      { id: 'emotions', emoji: '🌿', title: 'Emotions', desc: 'Resilience, mindfulness, inner balance' },
      { id: 'meaning', emoji: '✨', title: 'Meaning', desc: 'Values, mission, personal north star' },
      { id: 'community', emoji: '🏙️', title: 'Community', desc: 'Contribution, volunteering, local projects' },
    ],
    []
  );

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
        data || { user_id: user.id, username: '', full_name: '', bio: '', avatar_url: '', directions_selected: [] }
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

        {/* 12 Areas of Growth */}
        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <div>
              <div className="text-white font-medium">12 Areas of Growth</div>
              <div className="text-white/60 text-sm">Pick up to three priorities. This will tailor your personal feed and plan.</div>
            </div>
            <div className="text-white/70 text-sm">Selected: {(profile.directions_selected?.length || 0)} of 3</div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {GROWTH_AREAS.map((area) => {
              const selected = (profile.directions_selected || []).includes(area.id);
              return (
                <button
                  key={area.id}
                  type="button"
                  onClick={() => {
                    setNote(undefined);
                    setProfile((prev: any) => {
                      const current: string[] = prev?.directions_selected || [];
                      const isSelected = current.includes(area.id);
                      if (isSelected) {
                        return { ...prev, directions_selected: current.filter((x) => x !== area.id) };
                      }
                      if (current.length >= 3) {
                        // do not exceed 3
                        return prev;
                      }
                      return { ...prev, directions_selected: [...current, area.id] };
                    });
                  }}
                  className={`text-left rounded-2xl border px-4 py-3 transition ${
                    selected
                      ? 'border-white/40 bg-white/10'
                      : 'border-white/10 hover:border-white/20 hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="text-xl leading-none" aria-hidden>{area.emoji}</div>
                    <div>
                      <div className="text-white font-medium flex items-center gap-2">
                        {area.title}
                        {selected && (
                          <span className="inline-block h-2 w-2 rounded-full bg-white/80" />
                        )}
                      </div>
                      <div className="text-white/60 text-sm">{area.desc}</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          {profile?.directions_selected?.length > 3 && (
            <div className="text-red-400 text-sm">Please select up to 3 areas.</div>
          )}
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

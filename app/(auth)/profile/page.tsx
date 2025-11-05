'use client';

import { useEffect, useState } from 'react';
import Button from '@/components/Button';
import { supabase } from '@/lib/supabaseClient';
import { RequireAuth } from '@/components/RequireAuth';
import CountryCitySelect from '@/components/CountryCitySelect';
import EducationalInstitutionSelect from '@/components/EducationalInstitutionSelect';
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
  const [showSuccess, setShowSuccess] = useState(false);
  const [educationalInstitutionType, setEducationalInstitutionType] = useState<'school' | 'college' | 'university' | null>(null);
  const [educationalInstitutionName, setEducationalInstitutionName] = useState<string>('');

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      const profileData = data || {
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
        educational_institution_id: null,
        relationship_status: null,
      };
      
      // Load educational institution if exists
      if (profileData.educational_institution_id) {
        const { data: inst } = await supabase
          .from('educational_institutions')
          .select('*')
          .eq('id', profileData.educational_institution_id)
          .maybeSingle();
        if (inst) {
          setEducationalInstitutionType(inst.type);
        }
      }
      
      setProfile(profileData);
      setLoading(false);
    })();
  }, []);

  async function saveProfile() {
    if (!profile) return;
    
    // Handle educational institution
    let institutionId = profile.educational_institution_id;
    
    // If user typed a name but no ID is set (custom entry or external source)
    if (educationalInstitutionName && educationalInstitutionType && !institutionId) {
      // Try to find existing institution by name and type
      const { data: existing } = await supabase
        .from('educational_institutions')
        .select('id')
        .eq('name', educationalInstitutionName.trim())
        .eq('type', educationalInstitutionType)
        .maybeSingle();
      
      if (existing) {
        institutionId = existing.id;
      } else {
        // Create new institution in local database
        const countryCity = profile.country ? profile.country.split(', ') : [];
        const city = countryCity.length > 1 ? countryCity.slice(0, -1).join(', ') : null;
        const country = countryCity.length > 1 ? countryCity[countryCity.length - 1] : (countryCity[0] || null);
        
        const { data: newInst, error: instError } = await supabase
          .from('educational_institutions')
          .insert({
            name: educationalInstitutionName.trim(),
            type: educationalInstitutionType,
            country: country,
            city: city,
          })
          .select('id')
          .single();
        
        if (instError) {
          setNote(instError.message);
          setShowSuccess(false);
          return;
        }
        
        institutionId = newInst.id;
      }
    }
    
    const profileToSave = {
      ...profile,
      educational_institution_id: institutionId || null,
    };
    
    const { error } = await supabase.from('profiles').upsert(profileToSave, { onConflict: 'user_id' });
    if (error) {
      setNote(error.message);
      setShowSuccess(false);
    } else {
      setNote('');
      setShowSuccess(true);
      setProfile(profileToSave);
      // Hide success message after 3 seconds
      setTimeout(() => {
        setShowSuccess(false);
      }, 3000);
    }
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
    <main className="max-w-2xl mx-auto px-4 py-4 md:p-4">
      <div className="telegram-card-glow p-4 md:p-5 space-y-3">
        <h1 className={`text-lg font-semibold ${isLight ? "text-telegram-text" : "text-telegram-text"}`}>Profile settings</h1>

        {/* Avatar section - more compact */}
        <div className="flex items-center gap-3 pb-2 border-b border-white/10">
          <img
            src={profile.avatar_url || AVATAR_FALLBACK}
            className={`w-16 h-16 rounded-full object-cover border-2 ${isLight ? "border-telegram-blue/20" : "border-telegram-blue/30"}`}
            alt="avatar"
          />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <input
                type="file"
                accept="image/*"
                onChange={e => setFile(e.target.files?.[0] || null)}
                className="hidden"
                id="avatar-upload"
              />
              <label
                htmlFor="avatar-upload"
                className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                  isLight
                    ? "bg-telegram-blue text-white hover:bg-telegram-blue-dark"
                    : "bg-telegram-blue text-white hover:bg-telegram-blue-dark"
                }`}
              >
                Choose file
              </label>
              {file && (
                <Button
                  onClick={uploadAvatar}
                  variant="primary"
                  size="sm"
                  className="px-3 py-1.5 text-xs"
                >
                  Upload
                </Button>
              )}
            </div>
            {file && (
              <div className={`text-xs mt-1 ${isLight ? "text-telegram-text-secondary" : "text-telegram-text-secondary"}`}>
                {file.name}
              </div>
            )}
          </div>
        </div>

        {/* Basic info - grid layout for compactness */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="label text-xs">Username</label>
            <input
              className="input text-sm py-1.5"
              value={profile.username || ''}
              onChange={e => setProfile({ ...profile, username: e.target.value })}
            />
          </div>
          <div>
            <label className="label text-xs">Full name</label>
            <input
              className="input text-sm py-1.5"
              value={profile.full_name || ''}
              onChange={e => setProfile({ ...profile, full_name: e.target.value })}
            />
          </div>
        </div>

        <div>
          <label className="label text-xs">About</label>
          <textarea
            className="input text-sm py-1.5"
            rows={2}
            value={profile.bio || ''}
            onChange={e => setProfile({ ...profile, bio: e.target.value })}
          />
        </div>

        {/* Location and relationship - grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="label text-xs">Country - City</label>
            <CountryCitySelect
              value={profile.country || ''}
              onChange={(combined: string) => setProfile({ ...profile, country: combined })}
            />
          </div>
          <div>
            <label className="label text-xs">Relationship Status</label>
            <select
              className="input text-sm py-1.5"
              value={profile.relationship_status || ''}
              onChange={e => setProfile({ ...profile, relationship_status: e.target.value || null })}
            >
              <option value="">Not specified</option>
              <option value="single">Single</option>
              <option value="looking">Looking</option>
              <option value="dating">Dating</option>
              <option value="married">Married</option>
            </select>
          </div>
        </div>

        {/* Educational Institution */}
        <div>
          <label className="label text-xs">Place of Study</label>
          <div className="space-y-2">
            <div className="flex gap-2">
              <select
                className="input text-sm py-1.5 flex-1"
                value={educationalInstitutionType || ''}
                onChange={e => {
                  const val = e.target.value as 'school' | 'college' | 'university' | '';
                  setEducationalInstitutionType(val || null);
                  if (!val) {
                    setProfile({ ...profile, educational_institution_id: null });
                    setEducationalInstitutionName('');
                  }
                }}
              >
                <option value="">Select type</option>
                <option value="school">School</option>
                <option value="college">College</option>
                <option value="university">University</option>
              </select>
            </div>
            {educationalInstitutionType && (
              <>
                <EducationalInstitutionSelect
                  value={profile.educational_institution_id || null}
                  type={educationalInstitutionType}
                  onQueryChange={(query) => {
                    // If user types but doesn't select, use the query as manual entry
                    if (!profile.educational_institution_id) {
                      if (query.trim()) {
                        setEducationalInstitutionName(query);
                      } else {
                        setEducationalInstitutionName('');
                      }
                    }
                  }}
                  onChange={(id, institution) => {
                    setProfile({ ...profile, educational_institution_id: id });
                    if (institution) {
                      setEducationalInstitutionName(institution.name);
                    } else {
                      setEducationalInstitutionName('');
                    }
                  }}
                />
                {!profile.educational_institution_id && educationalInstitutionName && (
                  <div className="text-xs text-white/60">
                    Institution will be created on save
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Website */}
        <div>
          <label className="label text-xs">Website / Blog / Portfolio</label>
          <input
            className="input text-sm py-1.5"
            value={profile.website_url || ''}
            onChange={e => setProfile({ ...profile, website_url: e.target.value })}
            placeholder="https://example.com"
          />
        </div>

        {/* Social Media - compact grid */}
        <div>
          <label className="label text-xs">Social Media</label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-white/60 mb-1 block">Facebook</label>
              <input
                className="input text-sm py-1.5"
                value={profile.facebook_url || ''}
                onChange={e => setProfile({ ...profile, facebook_url: e.target.value })}
                placeholder="URL"
              />
            </div>
            <div>
              <label className="text-xs text-white/60 mb-1 block">Instagram</label>
              <input
                className="input text-sm py-1.5"
                value={profile.instagram_url || ''}
                onChange={e => setProfile({ ...profile, instagram_url: e.target.value })}
                placeholder="URL"
              />
            </div>
            <div>
              <label className="text-xs text-white/60 mb-1 block">X.com</label>
              <input
                className="input text-sm py-1.5"
                value={profile.twitter_url || ''}
                onChange={e => setProfile({ ...profile, twitter_url: e.target.value })}
                placeholder="URL"
              />
            </div>
          </div>
        </div>

        {/* Online Status - compact */}
        <div>
          <label className="label text-xs">Online Status</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="online_status"
                checked={profile.show_online_status !== false}
                onChange={() => setProfile({ ...profile, show_online_status: true })}
                className={isLight ? "text-telegram-blue" : "text-telegram-blue-light"}
              />
              <span className={`text-sm ${isLight ? "text-telegram-text" : "text-telegram-text"}`}>Show</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="online_status"
                checked={profile.show_online_status === false}
                onChange={() => setProfile({ ...profile, show_online_status: false })}
                className={isLight ? "text-telegram-blue" : "text-telegram-blue-light"}
              />
              <span className={`text-sm ${isLight ? "text-telegram-text" : "text-telegram-text"}`}>Hide</span>
            </label>
          </div>
        </div>

        {note && !showSuccess && (
          <div className={`text-sm ${isLight ? "text-red-500" : "text-red-400"}`}>{note}</div>
        )}
        {showSuccess && (
          <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
            <div className="bg-green-500 text-white px-6 py-4 rounded-lg shadow-lg flex items-center gap-2 border border-green-600 transform transition-all duration-300 pointer-events-auto">
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="font-medium">Profile saved successfully!</span>
            </div>
          </div>
        )}
        <Button onClick={saveProfile} variant="primary" className="w-full">
          Save
        </Button>
      </div>
    </main>
  );
}

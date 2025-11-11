'use client';

import { Suspense } from 'react';
import { useEffect, useState } from 'react';
import Button from '@/components/Button';
import { supabase } from '@/lib/supabaseClient';
import { RequireAuth } from '@/components/RequireAuth';
import CountryCitySelect from '@/components/CountryCitySelect';
import EducationalInstitutionSelect from '@/components/EducationalInstitutionSelect';
import { useTheme } from '@/components/ThemeProvider';
import ProfileSkeleton from '@/components/ProfileSkeleton';
import ProfileLoading from './loading';
import { resolveAvatarUrl } from '@/lib/utils';

export default function ProfilePage() {
  return (
    <RequireAuth>
      <Suspense fallback={<ProfileLoading />}>
        <ProfileSettings />
      </Suspense>
    </RequireAuth>
  );
}

function ProfileSettings() {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const AVATAR_FALLBACK =
    "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='100%' height='100%' fill='%23222'/><circle cx='32' cy='24' r='14' fill='%23555'/><rect x='12' y='44' width='40' height='12' rx='6' fill='%23555'/></svg>";
  const [activeTab, setActiveTab] = useState<'main' | 'settings'>('main');
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState<string>();
  const [showSuccess, setShowSuccess] = useState(false);
  const [educationalInstitutionType, setEducationalInstitutionType] = useState<'school' | 'college' | 'university' | null>(null);
  const [educationalInstitutionName, setEducationalInstitutionName] = useState<string>('');
  const [goals, setGoals] = useState<Array<{ id: string; text: string; target_date: string | null }>>([]);
  // Password change state
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordNote, setPasswordNote] = useState<string>();
  const [changingPassword, setChangingPassword] = useState(false);

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
        date_of_birth: null,
        work_career_status: null,
        goals: [],
      };
      
      // Load goals from profile data
      if (profileData.goals && Array.isArray(profileData.goals)) {
        setGoals(profileData.goals);
      } else {
        setGoals([]);
      }
      
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
    
    const profileToSave: any = {
      ...profile,
      educational_institution_id: institutionId || null,
    };
    
    // Only include goals if the column exists (will be added via migration)
    // Filter out empty goals before saving
    const validGoals = goals.filter(g => g.text && g.text.trim() !== '');
    if (validGoals.length > 0 || goals.length > 0) {
      profileToSave.goals = validGoals;
    }
    
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

  async function changePassword() {
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordNote('Please fill in all password fields');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordNote('New passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      setPasswordNote('Password must be at least 6 characters');
      return;
    }

    setChangingPassword(true);
    setPasswordNote(undefined);

    try {
      // First, verify current password by attempting to sign in
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) {
        setPasswordNote('Unable to get user information');
        setChangingPassword(false);
        return;
      }

      // Verify current password
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });

      if (signInError) {
        setPasswordNote('Current password is incorrect');
        setChangingPassword(false);
        return;
      }

      // Update password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        setPasswordNote(updateError.message);
        setChangingPassword(false);
        return;
      }

      setPasswordNote('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      
      // Clear success message and close form after 3 seconds
      setTimeout(() => {
        setPasswordNote(undefined);
        setShowPasswordForm(false);
      }, 3000);
    } catch (err: any) {
      setPasswordNote(err.message || 'Failed to change password');
    } finally {
      setChangingPassword(false);
    }
  }

  if (loading) {
    return <ProfileSkeleton />;
  }

  return (
    <main className="max-w-2xl mx-auto px-0 md:px-4 py-4 md:p-4">
      <div className="card-glow-primary no-hover p-4 md:p-5 space-y-3">
        <h1 className={`text-lg font-semibold ${isLight ? "text-primary-text" : "text-primary-text"}`}>Profile settings</h1>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-white/10 pb-2">
          <button
            onClick={() => setActiveTab('main')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'main'
                ? isLight
                  ? "text-primary-blue border-b-2 border-primary-blue"
                  : "text-primary-blue-light border-b-2 border-primary-blue-light"
                : isLight
                ? "text-primary-text-secondary hover:text-primary-text"
                : "text-white/60 hover:text-white/80"
            }`}
          >
            Main
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'settings'
                ? isLight
                  ? "text-primary-blue border-b-2 border-primary-blue"
                  : "text-primary-blue-light border-b-2 border-primary-blue-light"
                : isLight
                ? "text-primary-text-secondary hover:text-primary-text"
                : "text-white/60 hover:text-white/80"
            }`}
          >
            Settings
          </button>
        </div>

        {/* Main Tab Content */}
        {activeTab === 'main' && (
          <div className="space-y-3">

        {/* Avatar section - more compact */}
        <div className="flex items-center gap-3 pb-2 border-b border-white/10">
          <img
              src={resolveAvatarUrl(profile.avatar_url) ?? AVATAR_FALLBACK}
            className={`w-16 h-16 rounded-full object-cover border-2 ${isLight ? "border-primary-blue/20" : "border-primary-blue/30"}`}
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
                    ? "bg-primary-blue text-white hover:bg-primary-blue-dark"
                    : "bg-primary-blue text-white hover:bg-primary-blue-dark"
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
              <div className={`text-xs mt-1 ${isLight ? "text-primary-text-secondary" : "text-primary-text-secondary"}`}>
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

        {/* Date of birth and Work & Career - grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="label text-xs">Date of birth</label>
            <input
              type="date"
              className="input text-sm py-1.5"
              value={profile.date_of_birth || ''}
              onChange={e => setProfile({ ...profile, date_of_birth: e.target.value || null })}
            />
          </div>
          <div>
            <label className="label text-xs">Work & Career</label>
            <select
              className="input text-sm py-1.5"
              value={profile.work_career_status || ''}
              onChange={e => setProfile({ ...profile, work_career_status: e.target.value || null })}
            >
              <option value="">Not specified</option>
              <option value="employed">Employed</option>
              <option value="entrepreneur">Entrepreneur</option>
              <option value="student">Student</option>
              <option value="looking_for_opportunities">Looking for Opportunities</option>
              <option value="unemployed">Unemployed</option>
            </select>
          </div>
        </div>

        {/* Website */}
        <div>
          <label className="label text-xs">Projects / Startups / Portfolio</label>
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
                className={isLight ? "text-primary-blue" : "text-primary-blue-light"}
              />
              <span className={`text-sm ${isLight ? "text-primary-text" : "text-primary-text"}`}>Show</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="online_status"
                checked={profile.show_online_status === false}
                onChange={() => setProfile({ ...profile, show_online_status: false })}
                className={isLight ? "text-primary-blue" : "text-primary-blue-light"}
              />
              <span className={`text-sm ${isLight ? "text-primary-text" : "text-primary-text"}`}>Hide</span>
            </label>
          </div>
        </div>

            {/* Password Change Section */}
            <div className="pt-4 border-t border-white/10">
              {!showPasswordForm ? (
                <Button
                  onClick={() => setShowPasswordForm(true)}
                  variant="secondary"
                  size="sm"
                  className="w-full"
                >
                  Change Password
                </Button>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between mb-3">
                    <label className="label text-xs">Change Password</label>
                    <button
                      onClick={() => {
                        setShowPasswordForm(false);
                        setCurrentPassword('');
                        setNewPassword('');
                        setConfirmPassword('');
                        setPasswordNote(undefined);
                      }}
                      className={`text-xs ${isLight ? "text-primary-text-secondary hover:text-primary-text" : "text-white/60 hover:text-white/80"}`}
                    >
                      Cancel
                    </button>
                  </div>
                  <div>
                    <label className={`text-xs font-medium mb-1.5 block ${
                      isLight ? "text-primary-text-secondary" : "text-white/70"
                    }`}>
                      Current Password
                    </label>
                    <input
                      type="password"
                      className="input text-sm py-2"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter current password"
                    />
                  </div>
                  <div>
                    <label className={`text-xs font-medium mb-1.5 block ${
                      isLight ? "text-primary-text-secondary" : "text-white/70"
                    }`}>
                      New Password
                    </label>
                    <input
                      type="password"
                      className="input text-sm py-2"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password (min 6 characters)"
                    />
                  </div>
                  <div>
                    <label className={`text-xs font-medium mb-1.5 block ${
                      isLight ? "text-primary-text-secondary" : "text-white/70"
                    }`}>
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      className="input text-sm py-2"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm new password"
                    />
                  </div>
                  {passwordNote && (
                    <div className={`text-xs ${
                      passwordNote.includes('successfully')
                        ? isLight ? "text-green-600" : "text-green-400"
                        : isLight ? "text-red-500" : "text-red-400"
                    }`}>
                      {passwordNote}
                    </div>
                  )}
                  <Button
                    onClick={changePassword}
                    variant="secondary"
                    size="sm"
                    disabled={changingPassword}
                    className="w-full"
                  >
                    {changingPassword ? 'Changing...' : 'Change Password'}
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Settings Tab Content */}
        {activeTab === 'settings' && (
          <div className="space-y-3">
            {/* Goals Section */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <label className="label text-xs mb-1">Goals</label>
                  <p className={`text-xs ${isLight ? "text-primary-text-secondary" : "text-white/60"}`}>
                    Set your personal goals with optional target dates (4-7 goals recommended)
                  </p>
                </div>
                {goals.length < 7 && (
                  <button
                    onClick={() => {
                      const newGoal = { id: Date.now().toString(), text: '', target_date: null };
                      setGoals([...goals, newGoal]);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      isLight
                        ? "bg-primary-blue text-white hover:bg-primary-blue-dark"
                        : "bg-primary-blue text-white hover:bg-primary-blue-dark"
                    }`}
                  >
                    + Add Goal
                  </button>
                )}
              </div>
              
              <div className="space-y-3">
                {goals.length === 0 ? (
                  <div className={`text-center py-8 rounded-xl border border-dashed ${
                    isLight ? "border-gray-300 bg-gray-50/50" : "border-white/20 bg-white/5"
                  }`}>
                    <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                    <p className={`text-sm ${isLight ? "text-primary-text-secondary" : "text-white/60"}`}>
                      No goals set yet. Click "Add Goal" to get started.
                    </p>
                  </div>
                ) : (
                  goals.map((goal, index) => (
                    <div
                      key={goal.id}
                      className={`p-4 rounded-xl border ${
                        isLight
                          ? "border-gray-200 bg-gray-50/50 hover:border-gray-300"
                          : "border-white/10 bg-white/5 hover:border-white/20"
                      } transition-all`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-1 space-y-3">
                          <div>
                            <label className={`text-xs font-medium mb-1.5 block ${
                              isLight ? "text-primary-text-secondary" : "text-white/70"
                            }`}>
                              Goal {index + 1}
                            </label>
                            <textarea
                              className={`input text-sm py-2 min-h-[80px] resize-none ${
                                isLight ? "" : ""
                              }`}
                              placeholder="Describe your goal..."
                              value={goal.text}
                              onChange={(e) => {
                                const updatedGoals = [...goals];
                                updatedGoals[index].text = e.target.value;
                                setGoals(updatedGoals);
                              }}
                              rows={3}
                            />
                          </div>
                          <div>
                            <label className={`text-xs font-medium mb-1.5 block ${
                              isLight ? "text-primary-text-secondary" : "text-white/70"
                            }`}>
                              Target Date (optional)
                            </label>
                            <input
                              type="date"
                              className="input text-sm py-2"
                              value={goal.target_date || ''}
                              onChange={(e) => {
                                const updatedGoals = [...goals];
                                updatedGoals[index].target_date = e.target.value || null;
                                setGoals(updatedGoals);
                              }}
                            />
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            const updatedGoals = goals.filter((_, i) => i !== index);
                            setGoals(updatedGoals);
                          }}
                          className={`p-2 rounded-lg transition-colors flex-shrink-0 ${
                            isLight
                              ? "text-red-500 hover:bg-red-50"
                              : "text-red-400 hover:bg-red-500/10"
                          }`}
                          aria-label="Remove goal"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
              
              {goals.length > 0 && goals.length < 4 && (
                <p className={`text-xs mt-3 ${isLight ? "text-amber-600" : "text-amber-400"}`}>
                  💡 Tip: Setting 4-7 goals helps maintain focus and balance.
                </p>
              )}
              {goals.length >= 7 && (
                <p className={`text-xs mt-3 ${isLight ? "text-primary-text-secondary" : "text-white/60"}`}>
                  Maximum of 7 goals reached.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Save button and messages - shown for both tabs */}
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
        {activeTab === 'main' && (
          <Button onClick={saveProfile} variant="primary" className="w-full">
            Save
          </Button>
        )}
        {activeTab === 'settings' && (
          <Button onClick={saveProfile} variant="primary" className="w-full">
            Save Goals
          </Button>
        )}
      </div>
    </main>
  );
}

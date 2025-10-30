"use client";

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Button from '@/components/Button';

type Profile = {
  user_id: string;
  username?: string | null;
  directions_selected?: string[] | null;
};

export default function GrowthDirectionsPage() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [note, setNote] = useState<string | undefined>();

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
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      setProfile(
        (data as Profile) || { user_id: user.id, username: '', directions_selected: [] }
      );
      setLoading(false);
    })();
  }, []);

  async function save() {
    if (!profile) return;
    const { error } = await supabase
      .from('profiles')
      .upsert({ user_id: profile.user_id, directions_selected: profile.directions_selected || [] }, { onConflict: 'user_id' });
    setNote(error ? error.message : 'Saved');
  }

  const selectedCount = profile?.directions_selected?.length || 0;

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-5">
      <h1 className="text-2xl font-semibold text-white">12 Areas of Growth</h1>
      <p className="text-white/70 text-sm">
        Pick up to three priorities. This will tailor your personal feed and plan.
      </p>

      {loading ? (
        <div className="text-white/70">Loading…</div>
      ) : (
        <div className="card p-5 space-y-4">
          <div className="flex items-baseline justify-between">
            <div className="text-white/80">Selected: {selectedCount} of 3</div>
            {note && <div className="text-white/60 text-sm">{note}</div>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {GROWTH_AREAS.map((area) => {
              const isSelected = (profile?.directions_selected || []).includes(area.id);
              return (
                <button
                  key={area.id}
                  type="button"
                  onClick={() => {
                    setNote(undefined);
                    setProfile((prev) => {
                      if (!prev) return prev;
                      const current = prev.directions_selected || [];
                      const already = current.includes(area.id);
                      if (already) {
                        return { ...prev, directions_selected: current.filter((x) => x !== area.id) };
                      }
                      if (current.length >= 3) {
                        return prev; // do not exceed 3
                      }
                      return { ...prev, directions_selected: [...current, area.id] };
                    });
                  }}
                  className={`text-left rounded-2xl border px-4 py-3 transition ${
                    isSelected
                      ? 'border-white/40 bg-white/10'
                      : 'border-white/10 hover:border-white/20 hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="text-xl leading-none" aria-hidden>
                      {area.emoji}
                    </div>
                    <div>
                      <div className="text-white font-medium flex items-center gap-2">
                        {area.title}
                        {isSelected && (
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

          <Button onClick={save} variant="primary" className="w-full">
            Save
          </Button>
        </div>
      )}
    </div>
  );
}

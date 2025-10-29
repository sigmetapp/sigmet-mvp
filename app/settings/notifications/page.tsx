"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type UserSettings = {
  global_mute: boolean;
  dnd_start: string | null; // "HH:MM"
  dnd_end: string | null;   // "HH:MM"
  timezone: string | null;
  push_enabled: boolean;
  email_enabled: boolean;
  sound_enabled: boolean;
};

const defaultTimezone = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
})();

function parseTimeToMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const [h, m] = value.split(":").map((v) => Number(v));
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function getCurrentMinutesInTz(timezone: string | null): number | null {
  try {
    const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const dtf = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: tz,
    });
    const parts = dtf.formatToParts(new Date());
    const hh = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    const mm = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    return hh * 60 + mm;
  } catch {
    return null;
  }
}

function isDndActive(dndStart: string | null, dndEnd: string | null, timezone: string | null): boolean {
  const cur = getCurrentMinutesInTz(timezone);
  const start = parseTimeToMinutes(dndStart);
  const end = parseTimeToMinutes(dndEnd);
  if (cur == null || start == null || end == null) return false;
  if (start === end) return false;
  if (start < end) {
    return cur >= start && cur < end;
  }
  // window wraps past midnight
  return cur >= start || cur < end;
}

async function saveSettings(payload: Partial<UserSettings>) {
  const res = await fetch("/api/dms/settings.update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) throw new Error(data?.error || "Failed to save settings");
}

export default function NotificationsSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [settings, setSettings] = useState<UserSettings>({
    global_mute: false,
    dnd_start: null,
    dnd_end: null,
    timezone: defaultTimezone,
    push_enabled: true,
    email_enabled: false,
    sound_enabled: true,
  });

  // Load current user and settings
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const user = auth?.user;
        if (!user) {
          // If unauthenticated, nothing to show
          setLoading(false);
          return;
        }
        const { data, error } = await supabase
          .from("user_settings")
          .select("global_mute,dnd_start,dnd_end,timezone,push_enabled,email_enabled,sound_enabled")
          .eq("user_id", user.id)
          .maybeSingle();
        if (!mounted) return;
        if (!error && data) {
          setSettings((prev) => ({
            ...prev,
            global_mute: !!data.global_mute,
            dnd_start: data.dnd_start ?? null,
            dnd_end: data.dnd_end ?? null,
            timezone: data.timezone ?? prev.timezone,
            push_enabled: !!data.push_enabled,
            email_enabled: !!data.email_enabled,
            sound_enabled: data.sound_enabled ?? true,
          }));
        }
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message || "Failed to load settings");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Debounced save on settings change
  useEffect(() => {
    if (loading) return;
    setError(null);
    setSaving(true);
    const id = setTimeout(async () => {
      try {
        await saveSettings({
          global_mute: settings.global_mute,
          dnd_start: settings.dnd_start,
          dnd_end: settings.dnd_end,
          timezone: settings.timezone,
          push_enabled: settings.push_enabled,
          email_enabled: settings.email_enabled,
          sound_enabled: settings.sound_enabled,
        });
      } catch (e: any) {
        setError(e?.message || "Failed to save settings");
      } finally {
        setSaving(false);
      }
    }, 400);
    return () => clearTimeout(id);
  }, [settings, loading]);

  const timezones = useMemo<string[]>(() => {
    try {
      // @ts-expect-error supportedValuesOf may not be typed in TS lib
      const vals: string[] = Intl.supportedValuesOf?.("timeZone") || [];
      return vals.length ? vals : (defaultTimezone ? [defaultTimezone] : []);
    } catch {
      return defaultTimezone ? [defaultTimezone] : [];
    }
  }, []);

  const dndActive = isDndActive(settings.dnd_start, settings.dnd_end, settings.timezone);

  if (loading) return null;

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Notifications</h1>
        <div className="flex gap-2">
          {settings.global_mute && (
            <span className="inline-flex items-center rounded-full bg-red-100 text-red-700 px-2 py-1 text-xs font-medium">Muted</span>
          )}
          {dndActive && (
            <span className="inline-flex items-center rounded-full bg-yellow-100 text-yellow-800 px-2 py-1 text-xs font-medium">DND Active</span>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>
      )}

      <div className="space-y-6">
        <section className="flex items-center justify-between">
          <div>
            <div className="font-medium">Global mute</div>
            <div className="text-sm text-gray-500">Mute all notifications</div>
          </div>
          <label className="inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={settings.global_mute}
              onChange={(e) => setSettings((s) => ({ ...s, global_mute: e.target.checked }))}
            />
          </label>
        </section>

        <section>
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="font-medium">Do Not Disturb</div>
              <div className="text-sm text-gray-500">Silence notifications during this time window</div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-sm text-gray-600 mb-1">From</label>
              <input
                type="time"
                value={settings.dnd_start ?? ""}
                onChange={(e) => setSettings((s) => ({ ...s, dnd_start: e.target.value || null }))}
                className="w-full rounded border border-gray-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">To</label>
              <input
                type="time"
                value={settings.dnd_end ?? ""}
                onChange={(e) => setSettings((s) => ({ ...s, dnd_end: e.target.value || null }))}
                className="w-full rounded border border-gray-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Timezone</label>
              <select
                className="w-full rounded border border-gray-300 px-3 py-2"
                value={settings.timezone ?? ""}
                onChange={(e) => setSettings((s) => ({ ...s, timezone: e.target.value || null }))}
              >
                {settings.timezone == null && <option value="">System default</option>}
                {timezones.map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <section className="flex items-center justify-between">
          <div>
            <div className="font-medium">Allow push</div>
            <div className="text-sm text-gray-500">Enable push notifications</div>
          </div>
          <label className="inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={settings.push_enabled}
              onChange={(e) => setSettings((s) => ({ ...s, push_enabled: e.target.checked }))}
            />
          </label>
        </section>

        <section className="flex items-center justify-between">
          <div>
            <div className="font-medium">Allow email</div>
            <div className="text-sm text-gray-500">Receive email notifications</div>
          </div>
          <label className="inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={settings.email_enabled}
              onChange={(e) => setSettings((s) => ({ ...s, email_enabled: e.target.checked }))}
            />
          </label>
        </section>

        <section className="flex items-center justify-between">
          <div>
            <div className="font-medium">Enable sound</div>
            <div className="text-sm text-gray-500">Play sound for incoming messages</div>
          </div>
          <label className="inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={settings.sound_enabled}
              onChange={(e) => setSettings((s) => ({ ...s, sound_enabled: e.target.checked }))}
            />
          </label>
        </section>

        <div className="text-xs text-gray-500">{saving ? "Saving…" : ""}</div>
      </div>
    </div>
  );
}

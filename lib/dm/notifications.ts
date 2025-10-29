// Notification logic for DMs
// These utilities are intentionally tolerant to missing fields in settings/participant.
// All time comparisons are done using the Date values passed in by the caller.

export type DMSettings = {
  // Core toggles
  push_enabled?: boolean | null;

  // Optional global mute flags (front-end or future server fields)
  dm_global_muted?: boolean | null;
  dm_global_muted_until?: string | Date | null;

  // Optional DND window (local-time based)
  dnd_enabled?: boolean | null;
  dnd_start?: string | null; // "HH:mm" in local time
  dnd_end?: string | null;   // "HH:mm" in local time
};

export type ThreadParticipantState = {
  notifications_muted?: boolean | null;
  muted_until?: string | Date | null;
};

// Parses an "HH:mm" string into minutes since midnight.
function parseTimeToMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours * 60 + minutes;
}

// Returns minutes since midnight for the provided local Date
function getLocalMinutesSinceMidnight(nowLocal: Date): number {
  return nowLocal.getHours() * 60 + nowLocal.getMinutes();
}

export function isGlobalMuted(settings: DMSettings | null | undefined, nowLocal: Date): boolean {
  if (!settings) return false;

  // Explicit global mute flag
  if (settings.dm_global_muted === true) return true;

  // Time-bound global mute
  const until = settings.dm_global_muted_until;
  if (until) {
    const untilDate = typeof until === 'string' ? new Date(until) : until;
    if (!Number.isNaN(untilDate.getTime()) && nowLocal.getTime() < untilDate.getTime()) return true;
  }

  return false;
}

export function isThreadMuted(participant: ThreadParticipantState | null | undefined, nowUTC: Date): boolean {
  if (!participant) return false;
  if (participant.notifications_muted) return true;

  const until = participant.muted_until;
  if (until) {
    const untilDate = typeof until === 'string' ? new Date(until) : until;
    if (!Number.isNaN(untilDate.getTime()) && nowUTC.getTime() < untilDate.getTime()) return true;
  }

  return false;
}

export function isDND(settings: DMSettings | null | undefined, nowLocal: Date): boolean {
  if (!settings || !settings.dnd_enabled) return false;

  const startMin = parseTimeToMinutes(settings.dnd_start);
  const endMin = parseTimeToMinutes(settings.dnd_end);
  if (startMin === null || endMin === null) return false;

  const nowMin = getLocalMinutesSinceMidnight(nowLocal);

  // Handles both same-day (start < end) and overnight (start > end) windows
  if (startMin === endMin) {
    // 24h DND if start == end
    return true;
  } else if (startMin < endMin) {
    return nowMin >= startMin && nowMin < endMin;
  } else {
    // Overnight window, e.g., 22:00-07:00
    return nowMin >= startMin || nowMin < endMin;
  }
}

export function shouldNotify(args: {
  settings: DMSettings | null | undefined;
  participant: ThreadParticipantState | null | undefined;
  nowLocal: Date;
}): boolean {
  const { settings, participant, nowLocal } = args;

  // If push notifications are globally disabled by the user, do not notify
  if (settings && settings.push_enabled === false) return false;

  if (isGlobalMuted(settings, nowLocal)) return false;
  if (isDND(settings, nowLocal)) return false;

  // Use a UTC reference for precise comparison if a thread-specific muted_until exists
  const nowUTC = new Date(Date.now());
  if (isThreadMuted(participant, nowUTC)) return false;

  return true;
}

import { describe, it, expect } from 'vitest';
import { isGlobalMuted, isThreadMuted, isDND, shouldNotify, type DMSettings, type ThreadParticipantState } from '@/lib/dm/notifications';

function atLocal(hh: number, mm: number) {
  const d = new Date();
  d.setHours(hh, mm, 0, 0);
  return d;
}

describe('notifications: isGlobalMuted', () => {
  it('false when no settings', () => {
    expect(isGlobalMuted(undefined, new Date())).toBe(false);
    expect(isGlobalMuted(null as any, new Date())).toBe(false);
  });

  it('true when dm_global_muted flag is true', () => {
    const s: DMSettings = { dm_global_muted: true };
    expect(isGlobalMuted(s, new Date())).toBe(true);
  });

  it('true when muted_until in the future, false when in the past', () => {
    const future = new Date(Date.now() + 60_000);
    const past = new Date(Date.now() - 60_000);
    expect(isGlobalMuted({ dm_global_muted_until: future }, new Date())).toBe(true);
    expect(isGlobalMuted({ dm_global_muted_until: past }, new Date())).toBe(false);
  });
});

describe('notifications: isThreadMuted', () => {
  it('false when no participant', () => {
    expect(isThreadMuted(undefined, new Date())).toBe(false);
  });

  it('true when notifications_muted is true', () => {
    const p: ThreadParticipantState = { notifications_muted: true };
    expect(isThreadMuted(p, new Date())).toBe(true);
  });

  it('true when muted_until in the future, false when in the past', () => {
    const future = new Date(Date.now() + 60_000);
    const past = new Date(Date.now() - 60_000);
    expect(isThreadMuted({ muted_until: future }, new Date())).toBe(true);
    expect(isThreadMuted({ muted_until: past }, new Date())).toBe(false);
  });
});

describe('notifications: isDND', () => {
  it('inactive when disabled or invalid times', () => {
    expect(isDND({ dnd_enabled: false }, atLocal(12, 0))).toBe(false);
    expect(isDND({ dnd_enabled: true, dnd_start: null, dnd_end: '09:00' }, atLocal(8, 0))).toBe(false);
    expect(isDND({ dnd_enabled: true, dnd_start: 'bad', dnd_end: '09:00' }, atLocal(8, 0))).toBe(false);
  });

  it('active within same-day window, inactive outside', () => {
    const s: DMSettings = { dnd_enabled: true, dnd_start: '08:00', dnd_end: '10:00' };
    expect(isDND(s, atLocal(8, 0))).toBe(true);
    expect(isDND(s, atLocal(9, 59))).toBe(true);
    expect(isDND(s, atLocal(10, 0))).toBe(false);
    expect(isDND(s, atLocal(7, 59))).toBe(false);
  });

  it('active across overnight window', () => {
    const s: DMSettings = { dnd_enabled: true, dnd_start: '22:00', dnd_end: '07:00' };
    expect(isDND(s, atLocal(23, 0))).toBe(true);
    expect(isDND(s, atLocal(6, 59))).toBe(true);
    expect(isDND(s, atLocal(7, 0))).toBe(false);
    expect(isDND(s, atLocal(21, 59))).toBe(false);
  });

  it('24h DND when start == end', () => {
    const s: DMSettings = { dnd_enabled: true, dnd_start: '00:00', dnd_end: '00:00' };
    expect(isDND(s, atLocal(12, 0))).toBe(true);
  });
});

describe('notifications: shouldNotify combinations', () => {
  const base: DMSettings = { push_enabled: true };

  it('false when push disabled', () => {
    expect(shouldNotify({ settings: { push_enabled: false }, participant: null, nowLocal: new Date() })).toBe(false);
  });

  it('false when globally muted, regardless of thread', () => {
    const now = new Date();
    expect(shouldNotify({ settings: { ...base, dm_global_muted: true }, participant: null, nowLocal: now })).toBe(false);
  });

  it('false during DND', () => {
    const now = atLocal(8, 30);
    expect(shouldNotify({ settings: { ...base, dnd_enabled: true, dnd_start: '08:00', dnd_end: '10:00' }, participant: null, nowLocal: now })).toBe(false);
  });

  it('false when thread muted (by flag or until)', () => {
    const now = new Date();
    expect(shouldNotify({ settings: base, participant: { notifications_muted: true }, nowLocal: now })).toBe(false);
    expect(shouldNotify({ settings: base, participant: { muted_until: new Date(Date.now() + 60_000) }, nowLocal: now })).toBe(false);
  });

  it('true when none of the mutes apply', () => {
    const now = atLocal(11, 0);
    expect(shouldNotify({ settings: base, participant: {}, nowLocal: now })).toBe(true);
  });

  it('priority: push off > global mute > DND > thread mute', () => {
    const now = atLocal(8, 30);
    // push off dominates
    expect(shouldNotify({ settings: { push_enabled: false, dm_global_muted: false, dnd_enabled: true, dnd_start: '08:00', dnd_end: '10:00' }, participant: { notifications_muted: false }, nowLocal: now })).toBe(false);
    // global mute dominates DND and thread
    expect(shouldNotify({ settings: { ...base, dm_global_muted: true, dnd_enabled: true, dnd_start: '07:00', dnd_end: '09:00' }, participant: { notifications_muted: false }, nowLocal: now })).toBe(false);
    // DND dominates thread mute
    expect(shouldNotify({ settings: { ...base, dnd_enabled: true, dnd_start: '07:00', dnd_end: '09:00' }, participant: { notifications_muted: false }, nowLocal: now })).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import {
  normalizeConnectionStats,
  type RawConnectionStats,
} from '@/lib/sw/connectionStats';

describe('normalizeConnectionStats', () => {
  it('returns zeros when input is undefined', () => {
    expect(normalizeConnectionStats(undefined)).toEqual({
      total: 0,
      first: 0,
      repeat: 0,
      theyMention: 0,
      iMention: 0,
    });
  });

  it('handles explicit first and repeat counts', () => {
    const raw: RawConnectionStats = {
      total_count: 10,
      first_connection_count: 3,
      repeat_connection_count: 7,
      they_mention_count: 6,
      i_mention_count: 4,
    };

    expect(normalizeConnectionStats(raw)).toEqual({
      total: 10,
      first: 3,
      repeat: 7,
      theyMention: 6,
      iMention: 4,
    });
  });

  it('falls back to unique count when explicit first connections missing', () => {
    const raw: RawConnectionStats = {
      total_count: 5,
      unique_connections: 2,
    };

    expect(normalizeConnectionStats(raw)).toEqual({
      total: 5,
      first: 2,
      repeat: 3,
      theyMention: 0,
      iMention: 0,
    });
  });

  it('clamps repeat count to zero when total smaller than first', () => {
    const raw: RawConnectionStats = {
      total_count: 2,
      unique_connections: 5,
    };

    expect(normalizeConnectionStats(raw)).toEqual({
      total: 2,
      first: 2,
      repeat: 0,
      theyMention: 0,
      iMention: 0,
    });
  });

  it('ignores invalid numeric values', () => {
    const raw: RawConnectionStats = {
      total_count: Number.NaN,
      unique_connections: null,
      they_mention_count: undefined,
      i_mention_count: Number.NaN,
    };

    expect(normalizeConnectionStats(raw)).toEqual({
      total: 0,
      first: 0,
      repeat: 0,
      theyMention: 0,
      iMention: 0,
    });
  });
});

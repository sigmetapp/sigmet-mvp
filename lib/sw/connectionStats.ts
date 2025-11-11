export type RawConnectionStats = {
  total_count?: number | null;
  unique_connections?: number | null;
  first_connection_count?: number | null;
  repeat_connection_count?: number | null;
  they_mention_count?: number | null;
  i_mention_count?: number | null;
};

export type NormalizedConnectionStats = {
  total: number;
  first: number;
  repeat: number;
  theyMention: number;
  iMention: number;
};

const toNumber = (value: number | null | undefined): number =>
  typeof value === 'number' && !Number.isNaN(value) ? value : 0;

export function normalizeConnectionStats(
  raw: RawConnectionStats | null | undefined
): NormalizedConnectionStats {
  if (!raw) {
    return {
      total: 0,
      first: 0,
      repeat: 0,
      theyMention: 0,
      iMention: 0,
    };
  }

  const total = Math.max(0, toNumber(raw.total_count));
  const firstFromExplicit = raw.first_connection_count;
  const repeatFromExplicit = raw.repeat_connection_count;
  const first =
    firstFromExplicit !== undefined && firstFromExplicit !== null
      ? Math.min(total, Math.max(0, firstFromExplicit))
      : Math.min(total, Math.max(0, toNumber(raw.unique_connections)));

  const repeat =
    repeatFromExplicit !== undefined && repeatFromExplicit !== null
      ? Math.max(0, repeatFromExplicit)
      : Math.max(0, total - first);

  return {
    total,
    first,
    repeat,
    theyMention: Math.max(0, toNumber(raw.they_mention_count)),
    iMention: Math.max(0, toNumber(raw.i_mention_count)),
  };
}

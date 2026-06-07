export interface RankingResult {
  rank: number;
  percentile: number;
}

/**
 * Standard competition ranking against the whole user base.
 * `higherCount` = number of users strictly above the subject's score.
 * Percentile is "top X%" = rank / totalUsers × 100 (2 decimals).
 */
export function computeRanking(
  higherCount: number,
  totalUsers: number,
): RankingResult {
  const rank = higherCount + 1;
  const percentile =
    totalUsers > 0 ? Math.round((rank / totalUsers) * 100 * 100) / 100 : 0;
  return { rank, percentile };
}

export function startOfUtcDay(reference: Date | string): Date {
  const date = typeof reference === 'string' ? new Date(reference) : reference;
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

/** Inclusive last-7-days window as a half-open [gte, lt) UTC range. */
export function weeklyRange(reference: Date | string): { gte: Date; lt: Date } {
  const today = startOfUtcDay(reference);
  const lt = new Date(today);
  lt.setUTCDate(lt.getUTCDate() + 1);
  const gte = new Date(today);
  gte.setUTCDate(gte.getUTCDate() - 6);
  return { gte, lt };
}

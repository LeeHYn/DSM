import { TaskDifficulty, Tier } from '@prisma/client';

/** Difficulty → base score (FR-03: 하10 / 중20 / 상30). */
export const DIFFICULTY_SCORE: Record<TaskDifficulty, number> = {
  [TaskDifficulty.LOW]: 10,
  [TaskDifficulty.MEDIUM]: 20,
  [TaskDifficulty.HIGH]: 30,
};

/** Anti-abuse: maximum score obtainable in a single day. */
export const DAILY_SCORE_CAP = 900;

/** Achievement-rate multiplier (rate is a 0..1 ratio). */
export function achievementMultiplier(rate: number): number {
  if (rate >= 1) return 1.5;
  if (rate >= 0.8) return 1.3;
  if (rate >= 0.6) return 1.0;
  return 0.7;
}

export interface ScoreInput {
  registeredTaskCount: number;
  completedDifficulties: TaskDifficulty[];
}

export interface ScoreResult {
  registeredTaskCount: number;
  completedTaskCount: number;
  rawScore: number;
  adjustedScore: number;
  cappedScore: number;
  /** Achievement rate as a percentage with 2 decimals (e.g. 80 for 80%). */
  achievementRate: number;
}

export function computeDailyScore(input: ScoreInput): ScoreResult {
  const { registeredTaskCount, completedDifficulties } = input;
  const completedTaskCount = completedDifficulties.length;
  const rawScore = completedDifficulties.reduce(
    (sum, difficulty) => sum + DIFFICULTY_SCORE[difficulty],
    0,
  );

  const rate =
    registeredTaskCount > 0 ? completedTaskCount / registeredTaskCount : 0;
  const adjustedScore = Math.round(rawScore * achievementMultiplier(rate));
  const cappedScore = Math.min(adjustedScore, DAILY_SCORE_CAP);
  const achievementRate = Math.round(rate * 100 * 100) / 100;

  return {
    registeredTaskCount,
    completedTaskCount,
    rawScore,
    adjustedScore,
    cappedScore,
    achievementRate,
  };
}

/** Cumulative-score tier thresholds (descending). */
const TIER_THRESHOLDS: ReadonlyArray<{ min: number; tier: Tier }> = [
  { min: 30000, tier: Tier.MASTER },
  { min: 15000, tier: Tier.DIAMOND },
  { min: 7000, tier: Tier.PLATINUM },
  { min: 3000, tier: Tier.GOLD },
  { min: 1000, tier: Tier.SILVER },
  { min: 0, tier: Tier.BRONZE },
];

export function tierForScore(totalScore: number): Tier {
  for (const { min, tier } of TIER_THRESHOLDS) {
    if (totalScore >= min) {
      return tier;
    }
  }
  return Tier.BRONZE;
}

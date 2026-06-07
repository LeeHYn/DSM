import { TaskDifficulty, Tier } from '@prisma/client';
import {
  achievementMultiplier,
  computeDailyScore,
  tierForScore,
  DAILY_SCORE_CAP,
} from './scores.policy';

describe('achievementMultiplier', () => {
  it('applies the FR-03 thresholds', () => {
    expect(achievementMultiplier(1)).toBe(1.5);
    expect(achievementMultiplier(0.8)).toBe(1.3);
    expect(achievementMultiplier(0.6)).toBe(1.0);
    expect(achievementMultiplier(0.59)).toBe(0.7);
    expect(achievementMultiplier(0)).toBe(0.7);
  });
});

describe('computeDailyScore', () => {
  const { MEDIUM, HIGH, LOW } = TaskDifficulty;

  it('scores a perfect day (5/5, 중×3 상×2 → 180)', () => {
    const result = computeDailyScore({
      registeredTaskCount: 5,
      completedDifficulties: [MEDIUM, MEDIUM, MEDIUM, HIGH, HIGH],
    });
    expect(result.rawScore).toBe(120);
    expect(result.adjustedScore).toBe(180);
    expect(result.cappedScore).toBe(180);
    expect(result.achievementRate).toBe(100);
  });

  it('scores a good day (4/5, 중×3 상×1 → 117 @ 80%)', () => {
    const result = computeDailyScore({
      registeredTaskCount: 5,
      completedDifficulties: [MEDIUM, MEDIUM, MEDIUM, HIGH],
    });
    expect(result.rawScore).toBe(90);
    expect(result.adjustedScore).toBe(117);
    expect(result.achievementRate).toBe(80);
  });

  it('scores an underachieving day (2/5, 중×2 → 28 @ 40%)', () => {
    const result = computeDailyScore({
      registeredTaskCount: 5,
      completedDifficulties: [MEDIUM, MEDIUM],
    });
    expect(result.adjustedScore).toBe(28);
    expect(result.achievementRate).toBe(40);
  });

  it('returns zeros when nothing is registered', () => {
    const result = computeDailyScore({
      registeredTaskCount: 0,
      completedDifficulties: [],
    });
    expect(result).toEqual({
      registeredTaskCount: 0,
      completedTaskCount: 0,
      rawScore: 0,
      adjustedScore: 0,
      cappedScore: 0,
      achievementRate: 0,
    });
  });

  it('caps the daily score at the anti-abuse limit', () => {
    const result = computeDailyScore({
      registeredTaskCount: 40,
      completedDifficulties: Array<TaskDifficulty>(40).fill(HIGH),
    });
    expect(result.rawScore).toBe(1200);
    expect(result.adjustedScore).toBe(1800);
    expect(result.cappedScore).toBe(DAILY_SCORE_CAP);
  });

  it('counts low-difficulty tasks', () => {
    const result = computeDailyScore({
      registeredTaskCount: 1,
      completedDifficulties: [LOW],
    });
    expect(result.rawScore).toBe(10);
    expect(result.adjustedScore).toBe(15);
  });
});

describe('tierForScore', () => {
  it('maps cumulative scores to the 6 tiers', () => {
    expect(tierForScore(0)).toBe(Tier.BRONZE);
    expect(tierForScore(999)).toBe(Tier.BRONZE);
    expect(tierForScore(1000)).toBe(Tier.SILVER);
    expect(tierForScore(2999)).toBe(Tier.SILVER);
    expect(tierForScore(3000)).toBe(Tier.GOLD);
    expect(tierForScore(6999)).toBe(Tier.GOLD);
    expect(tierForScore(7000)).toBe(Tier.PLATINUM);
    expect(tierForScore(14999)).toBe(Tier.PLATINUM);
    expect(tierForScore(15000)).toBe(Tier.DIAMOND);
    expect(tierForScore(29999)).toBe(Tier.DIAMOND);
    expect(tierForScore(30000)).toBe(Tier.MASTER);
  });
});

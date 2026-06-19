import { RankingPeriod } from '@prisma/client';

export const REALTIME_EVENTS = {
  SCORE_RECOMPUTED: 'score.recomputed',
  SCORE_UPDATED: 'score.updated',
  RANKING_UPDATED: 'ranking.updated',
  LEADERBOARD_UPDATED: 'leaderboard.updated',
  NOTIFICATION_DUE: 'notification.due',
} as const;

export type RealtimeEventName =
  (typeof REALTIME_EVENTS)[keyof typeof REALTIME_EVENTS];

export const RANKING_PERIODS: readonly RankingPeriod[] = [
  RankingPeriod.DAILY,
  RankingPeriod.WEEKLY,
  RankingPeriod.TOTAL,
] as const;

export function userRoom(userId: string): string {
  return `user:${userId}`;
}

export function rankingRoom(period: RankingPeriod): string {
  return `ranking:${period}`;
}

export function isRankingPeriod(value: unknown): value is RankingPeriod {
  return RANKING_PERIODS.includes(value as RankingPeriod);
}

const DEFAULT_WS_CORS_ORIGINS = [
  'http://localhost:19006',
  'http://localhost:8081',
];

export function websocketCorsOrigin(): string[] {
  const configured = process.env.WS_CORS_ORIGINS;
  if (!configured) {
    return DEFAULT_WS_CORS_ORIGINS;
  }

  return configured
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

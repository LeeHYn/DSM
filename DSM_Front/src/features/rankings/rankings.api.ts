import { apiRequest } from '@/lib/api/http-client';
import type { Tier } from '@/features/users/users.api';

export type RankingPeriod = 'DAILY' | 'WEEKLY' | 'TOTAL';

export type MyRanking = {
  period: RankingPeriod;
  score: number;
  rank: number;
  percentile: number;
  totalUsers: number;
};

export type LeaderboardEntry = {
  userId: string;
  nickname: string | null;
  tier: Tier;
  profileImageUrl: string | null;
  score: number;
  rank: number;
};

export type RankingSnapshot = {
  id: string;
  userId: string;
  period: RankingPeriod;
  score: number;
  rank: number;
  percentile: number;
  totalUsers: number;
  createdAt: string;
};

export function getMyRanking(period: RankingPeriod): Promise<MyRanking> {
  return apiRequest<MyRanking>(
    `/rankings?period=${encodeURIComponent(period)}`,
  );
}

export function getLeaderboard(
  period: RankingPeriod,
  limit = 100,
): Promise<LeaderboardEntry[]> {
  const query = new URLSearchParams({
    period,
    limit: String(limit),
  });
  return apiRequest<LeaderboardEntry[]>(`/rankings/leaderboard?${query}`);
}

export function createRankingSnapshot(
  period: RankingPeriod,
): Promise<RankingSnapshot> {
  return apiRequest<RankingSnapshot>('/rankings/snapshot', {
    method: 'POST',
    body: { period },
  });
}

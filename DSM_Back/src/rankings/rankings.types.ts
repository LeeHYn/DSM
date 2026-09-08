import type { RankingPeriod, Tier } from '@prisma/client';

export interface MyRanking {
  period: RankingPeriod;
  score: number;
  rank: number;
  percentile: number;
  totalUsers: number;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  nickname: string;
  tier: Tier;
  profileImageUrl: string | null;
  score: number;
}

export interface RankingProjectionEntry extends LeaderboardEntry {
  period: RankingPeriod;
  percentile: number;
  totalUsers: number;
}

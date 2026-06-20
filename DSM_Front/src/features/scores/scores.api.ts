import { apiRequest } from '@/lib/api/http-client';
import type { Tier } from '@/features/users/users.api';

export type DailyScore = {
  id: string;
  userId: string;
  scoreDate: string;
  registeredTaskCount: number;
  completedTaskCount: number;
  rawScore: number;
  adjustedScore: number;
  cappedScore: number;
  achievementRate: number | string;
  createdAt: string;
  updatedAt: string;
};

export type ScoreSummary = {
  totalScore: number;
  tier: Tier;
};

export function getDailyScore(date?: string): Promise<DailyScore | null> {
  const query = date ? `?date=${encodeURIComponent(date)}` : '';
  return apiRequest<DailyScore | null>(`/scores${query}`);
}

export function getScoreSummary(): Promise<ScoreSummary> {
  return apiRequest<ScoreSummary>('/scores/summary');
}

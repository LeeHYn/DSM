import { Injectable } from '@nestjs/common';
import { type RankingSnapshot, RankingPeriod, Tier } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { computeRanking, startOfUtcDay, weeklyRange } from './rankings.policy';

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

@Injectable()
export class RankingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyRanking(
    userId: string,
    period: RankingPeriod,
  ): Promise<MyRanking> {
    const score = await this.scoreForUser(userId, period);
    const higherCount = await this.countHigher(period, score);
    const totalUsers = await this.prisma.user.count();
    const { rank, percentile } = computeRanking(higherCount, totalUsers);
    return { period, score, rank, percentile, totalUsers };
  }

  getLeaderboard(
    period: RankingPeriod,
    limit: number,
  ): Promise<LeaderboardEntry[]> {
    switch (period) {
      case RankingPeriod.TOTAL:
        return this.totalLeaderboard(limit);
      case RankingPeriod.DAILY:
        return this.dailyLeaderboard(limit);
      case RankingPeriod.WEEKLY:
        return this.weeklyLeaderboard(limit);
    }
  }

  async createSnapshot(
    userId: string,
    period: RankingPeriod,
  ): Promise<RankingSnapshot> {
    const ranking = await this.getMyRanking(userId, period);
    return this.prisma.rankingSnapshot.create({
      data: {
        userId,
        period,
        rank: ranking.rank,
        percentile: ranking.percentile,
        score: ranking.score,
        snapshotAt: new Date(),
      },
    });
  }

  private async scoreForUser(
    userId: string,
    period: RankingPeriod,
  ): Promise<number> {
    if (period === RankingPeriod.TOTAL) {
      const user = await this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { totalScore: true },
      });
      return user.totalScore;
    }

    if (period === RankingPeriod.DAILY) {
      const row = await this.prisma.dailyScore.findUnique({
        where: {
          userId_scoreDate: { userId, scoreDate: startOfUtcDay(new Date()) },
        },
        select: { cappedScore: true },
      });
      return row?.cappedScore ?? 0;
    }

    const { gte, lt } = weeklyRange(new Date());
    const aggregate = await this.prisma.dailyScore.aggregate({
      where: { userId, scoreDate: { gte, lt } },
      _sum: { cappedScore: true },
    });
    return aggregate._sum.cappedScore ?? 0;
  }

  private async countHigher(
    period: RankingPeriod,
    score: number,
  ): Promise<number> {
    if (period === RankingPeriod.TOTAL) {
      return this.prisma.user.count({ where: { totalScore: { gt: score } } });
    }

    if (period === RankingPeriod.DAILY) {
      return this.prisma.dailyScore.count({
        where: {
          scoreDate: startOfUtcDay(new Date()),
          cappedScore: { gt: score },
        },
      });
    }

    const { gte, lt } = weeklyRange(new Date());
    const groups = await this.prisma.dailyScore.groupBy({
      by: ['userId'],
      where: { scoreDate: { gte, lt } },
      _sum: { cappedScore: true },
      having: { cappedScore: { _sum: { gt: score } } },
    });
    return groups.length;
  }

  private async totalLeaderboard(limit: number): Promise<LeaderboardEntry[]> {
    const users = await this.prisma.user.findMany({
      orderBy: { totalScore: 'desc' },
      take: limit,
      select: {
        id: true,
        nickname: true,
        tier: true,
        profileImageUrl: true,
        totalScore: true,
      },
    });
    return users.map((user, index) => ({
      rank: index + 1,
      userId: user.id,
      nickname: user.nickname,
      tier: user.tier,
      profileImageUrl: user.profileImageUrl,
      score: user.totalScore,
    }));
  }

  private async dailyLeaderboard(limit: number): Promise<LeaderboardEntry[]> {
    const rows = await this.prisma.dailyScore.findMany({
      where: { scoreDate: startOfUtcDay(new Date()) },
      orderBy: { cappedScore: 'desc' },
      take: limit,
      select: {
        cappedScore: true,
        user: {
          select: {
            id: true,
            nickname: true,
            tier: true,
            profileImageUrl: true,
          },
        },
      },
    });
    return rows.map((row, index) => ({
      rank: index + 1,
      userId: row.user.id,
      nickname: row.user.nickname,
      tier: row.user.tier,
      profileImageUrl: row.user.profileImageUrl,
      score: row.cappedScore,
    }));
  }

  private async weeklyLeaderboard(limit: number): Promise<LeaderboardEntry[]> {
    const { gte, lt } = weeklyRange(new Date());
    const groups = await this.prisma.dailyScore.groupBy({
      by: ['userId'],
      where: { scoreDate: { gte, lt } },
      _sum: { cappedScore: true },
      orderBy: { _sum: { cappedScore: 'desc' } },
      take: limit,
    });
    const users = await this.prisma.user.findMany({
      where: { id: { in: groups.map((group) => group.userId) } },
      select: { id: true, nickname: true, tier: true, profileImageUrl: true },
    });
    const userMap = new Map(users.map((user) => [user.id, user]));

    return groups.map((group, index) => {
      const user = userMap.get(group.userId);
      return {
        rank: index + 1,
        userId: group.userId,
        nickname: user?.nickname ?? '',
        tier: user?.tier ?? Tier.BRONZE,
        profileImageUrl: user?.profileImageUrl ?? null,
        score: group._sum.cappedScore ?? 0,
      };
    });
  }
}

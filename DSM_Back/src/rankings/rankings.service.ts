import { Injectable } from '@nestjs/common';
import { type RankingSnapshot, RankingPeriod } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RankingCacheService } from './ranking-cache.service';
import { RankingProjectionService } from './ranking-projection.service';
import { computeRanking, startOfUtcDay, weeklyRange } from './rankings.policy';
import type { LeaderboardEntry, MyRanking } from './rankings.types';

export type { LeaderboardEntry, MyRanking } from './rankings.types';

@Injectable()
export class RankingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RankingCacheService,
    private readonly projection: RankingProjectionService,
  ) {}

  async getMyRanking(
    userId: string,
    period: RankingPeriod,
  ): Promise<MyRanking> {
    return this.getMyRankingAt(userId, period, new Date());
  }

  private async getMyRankingAt(
    userId: string,
    period: RankingPeriod,
    reference: Date,
  ): Promise<MyRanking> {
    if (this.cache.isConfigured()) {
      const cached = await this.cache.readMyRanking(userId, period, reference);
      if (cached) {
        return cached;
      }

      await this.projection.refreshPeriod(period, reference);
      const refreshed = await this.cache.readMyRanking(
        userId,
        period,
        reference,
      );
      if (refreshed) {
        return refreshed;
      }
    }

    return this.getMyRankingFromDatabase(userId, period, reference);
  }

  async getLeaderboard(
    period: RankingPeriod,
    limit: number,
  ): Promise<LeaderboardEntry[]> {
    const reference = new Date();
    if (this.cache.isConfigured()) {
      const cached = await this.cache.readLeaderboard(period, limit, reference);
      if (cached) {
        return cached;
      }

      await this.projection.refreshPeriod(period, reference);
      const refreshed = await this.cache.readLeaderboard(
        period,
        limit,
        reference,
      );
      if (refreshed) {
        return refreshed;
      }
    }

    return this.getLeaderboardFromDatabase(period, limit, reference);
  }

  async createSnapshot(
    userId: string,
    period: RankingPeriod,
  ): Promise<RankingSnapshot> {
    const reference = new Date();
    const snapshotDate = startOfUtcDay(reference);
    const where = { userId, period, snapshotDate };
    const existing = await this.prisma.rankingSnapshot.findFirst({ where });
    if (existing) {
      return existing;
    }

    const ranking = await this.getMyRankingAt(userId, period, reference);
    await this.prisma.rankingSnapshot.createMany({
      data: [
        {
          userId,
          period,
          rank: ranking.rank,
          percentile: ranking.percentile,
          score: ranking.score,
          snapshotDate,
          snapshotAt: reference,
        },
      ],
      skipDuplicates: true,
    });

    return this.prisma.rankingSnapshot.findFirstOrThrow({
      where,
    });
  }

  private async getMyRankingFromDatabase(
    userId: string,
    period: RankingPeriod,
    reference: Date,
  ): Promise<MyRanking> {
    const score = await this.scoreForUser(userId, period, reference);
    const higherCount = await this.countHigher(period, score, reference);
    const totalUsers = await this.prisma.user.count();
    const { rank, percentile } = computeRanking(higherCount, totalUsers);
    return { period, score, rank, percentile, totalUsers };
  }

  private getLeaderboardFromDatabase(
    period: RankingPeriod,
    limit: number,
    reference: Date,
  ): Promise<LeaderboardEntry[]> {
    return this.projection.readLeaderboardFromDatabase(
      period,
      limit,
      reference,
    );
  }

  private async scoreForUser(
    userId: string,
    period: RankingPeriod,
    reference: Date,
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
          userId_scoreDate: { userId, scoreDate: startOfUtcDay(reference) },
        },
        select: { cappedScore: true },
      });
      return row?.cappedScore ?? 0;
    }

    const { gte, lt } = weeklyRange(reference);
    const aggregate = await this.prisma.dailyScore.aggregate({
      where: { userId, scoreDate: { gte, lt } },
      _sum: { cappedScore: true },
    });
    return aggregate._sum.cappedScore ?? 0;
  }

  private async countHigher(
    period: RankingPeriod,
    score: number,
    reference: Date,
  ): Promise<number> {
    if (period === RankingPeriod.TOTAL) {
      return this.prisma.user.count({ where: { totalScore: { gt: score } } });
    }

    if (period === RankingPeriod.DAILY) {
      return this.prisma.dailyScore.count({
        where: {
          scoreDate: startOfUtcDay(reference),
          cappedScore: { gt: score },
        },
      });
    }

    const { gte, lt } = weeklyRange(reference);
    const groups = await this.prisma.dailyScore.groupBy({
      by: ['userId'],
      where: { scoreDate: { gte, lt } },
      _sum: { cappedScore: true },
      having: { cappedScore: { _sum: { gt: score } } },
    });
    return groups.length;
  }
}

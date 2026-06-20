import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { type DailyScore, type Tier, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RankingsCacheService } from '../rankings/rankings-cache.service';
import { REALTIME_EVENTS } from '../realtime/realtime-events';
import { computeDailyScore, tierForScore } from './scores.policy';

@Injectable()
export class ScoresService {
  private readonly logger = new Logger(ScoresService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly rankingsCache: RankingsCacheService,
  ) {}

  /**
   * Recomputes the user's DailyScore for the UTC day of `reference`, then
   * refreshes the user's cumulative totalScore and tier. Idempotent.
   */
  async recompute(
    userId: string,
    reference: Date | string,
  ): Promise<DailyScore> {
    const dayStart = this.startOfUtcDay(reference);
    const nextDay = new Date(dayStart);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);

    const tasks = await this.prisma.task.findMany({
      where: {
        userId,
        deletedAt: null,
        startAt: { gte: dayStart, lt: nextDay },
      },
    });

    const result = computeDailyScore({
      registeredTaskCount: tasks.length,
      completedDifficulties: tasks
        .filter((task) => task.status === TaskStatus.COMPLETED)
        .map((task) => task.difficulty),
    });

    const dailyScore = await this.prisma.dailyScore.upsert({
      where: { userId_scoreDate: { userId, scoreDate: dayStart } },
      create: { userId, scoreDate: dayStart, ...result },
      update: { ...result },
    });

    await this.recomputeUserTotal(userId);
    await this.invalidateLeaderboards();
    this.events.emit(REALTIME_EVENTS.SCORE_RECOMPUTED, {
      userId,
      dailyScore,
      scoreDate: dayStart,
    });
    return dailyScore;
  }

  getDaily(
    userId: string,
    reference: Date | string,
  ): Promise<DailyScore | null> {
    const dayStart = this.startOfUtcDay(reference);
    return this.prisma.dailyScore.findUnique({
      where: { userId_scoreDate: { userId, scoreDate: dayStart } },
    });
  }

  getSummary(userId: string): Promise<{ totalScore: number; tier: Tier }> {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { totalScore: true, tier: true },
    });
  }

  private async recomputeUserTotal(userId: string): Promise<void> {
    const aggregate = await this.prisma.dailyScore.aggregate({
      where: { userId },
      _sum: { cappedScore: true },
    });
    const totalScore = aggregate._sum.cappedScore ?? 0;

    await this.prisma.user.update({
      where: { id: userId },
      data: { totalScore, tier: tierForScore(totalScore) },
    });
  }

  private async invalidateLeaderboards(): Promise<void> {
    try {
      await this.rankingsCache.invalidateAllLeaderboards();
    } catch (error) {
      this.logger.warn(
        `Leaderboard cache invalidation failed after score recompute: ${this.errorMessage(error)}`,
      );
    }
  }

  private startOfUtcDay(reference: Date | string): Date {
    const date =
      typeof reference === 'string' ? new Date(reference) : reference;
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown error';
  }
}

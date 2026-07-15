import { Injectable } from '@nestjs/common';
import {
  type DailyScore,
  type Prisma,
  type Tier,
  TaskStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { computeDailyScore, tierForScore } from './scores.policy';

@Injectable()
export class ScoresService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Recomputes the user's DailyScore for the UTC day of `reference`, then
   * refreshes the user's cumulative totalScore and tier. Idempotent.
   */
  async recompute(
    userId: string,
    reference: Date | string,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<DailyScore> {
    const dayStart = this.startOfUtcDay(reference);
    const nextDay = new Date(dayStart);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);

    const tasks = await client.task.findMany({
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

    const dailyScore = await client.dailyScore.upsert({
      where: { userId_scoreDate: { userId, scoreDate: dayStart } },
      create: { userId, scoreDate: dayStart, ...result },
      update: { ...result },
    });

    await this.recomputeUserTotal(userId, client);
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

  private async recomputeUserTotal(
    userId: string,
    client: Prisma.TransactionClient,
  ): Promise<void> {
    const aggregate = await client.dailyScore.aggregate({
      where: { userId },
      _sum: { cappedScore: true },
    });
    const totalScore = aggregate._sum.cappedScore ?? 0;

    await client.user.update({
      where: { id: userId },
      data: { totalScore, tier: tierForScore(totalScore) },
    });
  }

  private startOfUtcDay(reference: Date | string): Date {
    const date =
      typeof reference === 'string' ? new Date(reference) : reference;
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
  }
}

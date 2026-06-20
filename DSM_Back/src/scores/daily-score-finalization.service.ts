import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { RankingsService } from '../rankings/rankings.service';
import { ScoresService } from './scores.service';

export type DailyScoreFinalizationResult = {
  scoreDate: Date;
  usersRecomputed: number;
  snapshotsCreated: number;
};

@Injectable()
export class DailyScoreFinalizationService {
  private readonly logger = new Logger(DailyScoreFinalizationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scoresService: ScoresService,
    private readonly rankingsService: RankingsService,
  ) {}

  @Cron('5 0 * * *', { timeZone: 'UTC' })
  async finalizePreviousUtcDayCron(): Promise<void> {
    const result = await this.finalizePreviousUtcDay(new Date());
    this.logger.log(
      `Finalized UTC day ${result.scoreDate.toISOString()}: users=${result.usersRecomputed}, snapshots=${result.snapshotsCreated}`,
    );
  }

  finalizePreviousUtcDay(now: Date): Promise<DailyScoreFinalizationResult> {
    const today = startOfUtcDay(now);
    const previousDay = new Date(today);
    previousDay.setUTCDate(previousDay.getUTCDate() - 1);
    return this.finalizeUtcDay(previousDay);
  }

  async finalizeUtcDay(reference: Date): Promise<DailyScoreFinalizationResult> {
    const scoreDate = startOfUtcDay(reference);
    const nextDay = new Date(scoreDate);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);

    const users = await this.prisma.task.findMany({
      where: {
        startAt: { gte: scoreDate, lt: nextDay },
        deletedAt: null,
      },
      distinct: ['userId'],
      select: { userId: true },
    });

    for (const { userId } of users) {
      await this.scoresService.recompute(userId, scoreDate);
    }

    const snapshotsCreated =
      await this.rankingsService.createDailySnapshotsForDate(scoreDate);

    return {
      scoreDate,
      usersRecomputed: users.length,
      snapshotsCreated,
    };
  }
}

function startOfUtcDay(reference: Date): Date {
  return new Date(
    Date.UTC(
      reference.getUTCFullYear(),
      reference.getUTCMonth(),
      reference.getUTCDate(),
    ),
  );
}

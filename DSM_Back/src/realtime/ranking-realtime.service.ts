import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { RankingPeriod } from '@prisma/client';
import { NOTIFICATION_EVENTS } from '../notifications/notification-events';
import { RankingsCacheService } from '../rankings/rankings-cache.service';
import { RankingsService } from '../rankings/rankings.service';
import { RankingGateway } from './ranking.gateway';
import { RANKING_PERIODS, REALTIME_EVENTS } from './realtime-events';

export type ScoreRecomputedEvent = {
  userId: string;
  dailyScore?: unknown;
  scoreDate?: Date | string;
};

export type NotificationDueEvent = {
  userId: string;
  taskId: string;
  scheduleId: string;
  scheduledAt: string;
  task: unknown;
};

@Injectable()
export class RankingRealtimeService {
  private readonly logger = new Logger(RankingRealtimeService.name);

  constructor(
    private readonly rankingGateway: RankingGateway,
    private readonly rankingsService: RankingsService,
    private readonly rankingsCache: RankingsCacheService,
  ) {}

  @OnEvent(REALTIME_EVENTS.SCORE_RECOMPUTED)
  async handleScoreRecomputed(event: ScoreRecomputedEvent): Promise<void> {
    try {
      await this.invalidateLeaderboards();
      this.emitScoreUpdated(event);
      await this.emitRankingUpdated(event.userId);
      await this.emitLeaderboardsUpdated();
    } catch (error) {
      this.logger.warn(
        `Realtime ranking update failed for user ${event.userId}: ${this.errorMessage(error)}`,
      );
    }
  }

  @OnEvent(NOTIFICATION_EVENTS.DUE)
  handleNotificationDue(event: NotificationDueEvent): void {
    this.rankingGateway.emitToUser(
      event.userId,
      REALTIME_EVENTS.NOTIFICATION_DUE,
      event,
    );
  }

  private emitScoreUpdated(event: ScoreRecomputedEvent): void {
    this.rankingGateway.emitToUser(
      event.userId,
      REALTIME_EVENTS.SCORE_UPDATED,
      {
        userId: event.userId,
        dailyScore: event.dailyScore,
        scoreDate: this.serializeDate(event.scoreDate),
      },
    );
  }

  private async invalidateLeaderboards(): Promise<void> {
    try {
      await this.rankingsCache.invalidateAllLeaderboards();
    } catch (error) {
      this.logger.warn(
        `Realtime leaderboard cache invalidation failed: ${this.errorMessage(error)}`,
      );
    }
  }

  private async emitRankingUpdated(userId: string): Promise<void> {
    const rankings = await Promise.all(
      RANKING_PERIODS.map((period) =>
        this.rankingsService.getMyRanking(userId, period),
      ),
    );

    this.rankingGateway.emitToUser(userId, REALTIME_EVENTS.RANKING_UPDATED, {
      userId,
      rankings,
    });
  }

  private async emitLeaderboardsUpdated(): Promise<void> {
    await Promise.all(
      RANKING_PERIODS.map(async (period: RankingPeriod) => {
        const leaderboard = await this.rankingsService.getFreshLeaderboard(
          period,
          100,
        );
        this.rankingGateway.emitToRankingPeriod(
          period,
          REALTIME_EVENTS.LEADERBOARD_UPDATED,
          { period, leaderboard },
        );
      }),
    );
  }

  private serializeDate(value: Date | string | undefined): string | undefined {
    if (!value) {
      return undefined;
    }

    return value instanceof Date ? value.toISOString() : value;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown error';
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RankingPeriod } from '@prisma/client';
import { RedisService } from '../redis/redis.service';
import type { LeaderboardEntry } from './rankings.service';

const LEADERBOARD_CACHE_PREFIX = 'rankings:leaderboard:';
const DEFAULT_RANKING_CACHE_TTL_SECONDS = 30;

@Injectable()
export class RankingsCacheService {
  private readonly logger = new Logger(RankingsCacheService.name);
  private readonly ttlSeconds: number;

  constructor(
    private readonly redisService: RedisService,
    configService: ConfigService,
  ) {
    this.ttlSeconds = this.resolveTtlSeconds(
      configService.get<number | string>('RANKING_CACHE_TTL_SECONDS'),
    );
  }

  leaderboardKey(period: RankingPeriod, limit: number): string {
    return `${LEADERBOARD_CACHE_PREFIX}${period}:${limit}`;
  }

  async getLeaderboard(
    period: RankingPeriod,
    limit: number,
  ): Promise<LeaderboardEntry[] | null> {
    const key = this.leaderboardKey(period, limit);

    try {
      return await this.redisService.getJson<LeaderboardEntry[]>(key);
    } catch (error) {
      this.logger.warn(
        `Leaderboard cache read failed for ${key}: ${this.errorMessage(error)}`,
      );
      return null;
    }
  }

  async setLeaderboard(
    period: RankingPeriod,
    limit: number,
    entries: LeaderboardEntry[],
  ): Promise<void> {
    const key = this.leaderboardKey(period, limit);

    try {
      await this.redisService.setJson(key, entries, this.ttlSeconds);
    } catch (error) {
      this.logger.warn(
        `Leaderboard cache write failed for ${key}: ${this.errorMessage(error)}`,
      );
    }
  }

  async invalidateAllLeaderboards(): Promise<void> {
    try {
      await this.redisService.delByPrefix(LEADERBOARD_CACHE_PREFIX);
    } catch (error) {
      this.logger.warn(
        `Leaderboard cache invalidation failed: ${this.errorMessage(error)}`,
      );
    }
  }

  private resolveTtlSeconds(value: number | string | undefined): number {
    const ttl =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Number(value)
          : DEFAULT_RANKING_CACHE_TTL_SECONDS;

    return Number.isInteger(ttl) && ttl > 0
      ? ttl
      : DEFAULT_RANKING_CACHE_TTL_SECONDS;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown error';
  }
}

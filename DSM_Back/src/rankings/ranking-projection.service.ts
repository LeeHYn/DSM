import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma, RankingPeriod, Tier } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RankingCacheService } from './ranking-cache.service';
import { startOfUtcDay, weeklyRange } from './rankings.policy';
import type { RankingProjectionEntry } from './rankings.types';

const RANKING_PROJECTION_CRON_NAME = 'ranking-projection';
const REFRESH_LOCK_TTL_MS = 2 * 60 * 1_000;
const MIN_REFRESH_INTERVAL_MS = 45 * 1_000;
const RANKING_PERIODS = [
  RankingPeriod.DAILY,
  RankingPeriod.WEEKLY,
  RankingPeriod.TOTAL,
] as const;

interface ProjectionRow {
  userId: string;
  nickname: string;
  tier: string;
  profileImageUrl: string | null;
  score: number | bigint;
  rank: number | bigint;
  totalUsers: number | bigint;
}

@Injectable()
export class RankingProjectionService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RankingProjectionService.name);
  private readonly inFlight = new Map<string, Promise<boolean>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RankingCacheService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.cache.isConfigured()) {
      await this.refreshAll(new Date());
    }
  }

  @Cron(CronExpression.EVERY_MINUTE, {
    name: RANKING_PROJECTION_CRON_NAME,
    waitForCompletion: true,
  })
  async refreshScheduledProjection(): Promise<void> {
    await this.refreshAll(new Date());
  }

  async refreshAll(reference: Date): Promise<void> {
    for (const period of RANKING_PERIODS) {
      await this.refreshPeriod(period, reference);
    }
  }

  async refreshPeriod(
    period: RankingPeriod,
    reference: Date,
  ): Promise<boolean> {
    if (!this.cache.isConfigured()) {
      return false;
    }

    const identity = this.cache.projectionIdentity(period, reference);
    const current = this.inFlight.get(identity);
    if (current) {
      return current;
    }

    const pending = this.projectUnderLock(period, reference);
    this.inFlight.set(identity, pending);
    try {
      return await pending;
    } finally {
      if (this.inFlight.get(identity) === pending) {
        this.inFlight.delete(identity);
      }
    }
  }

  private async projectUnderLock(
    period: RankingPeriod,
    reference: Date,
  ): Promise<boolean> {
    const owner = randomUUID();
    const lock = await this.cache.acquireRefreshLock(
      period,
      reference,
      owner,
      REFRESH_LOCK_TTL_MS,
    );
    if (lock !== 'acquired') {
      return false;
    }

    try {
      if (
        await this.cache.isProjectionFresh(
          period,
          reference,
          MIN_REFRESH_INTERVAL_MS,
        )
      ) {
        return true;
      }

      const rows = await this.queryProjection(period, reference);
      const entries = this.normalizeProjection(rows, period);
      return await this.cache.publishProjection(
        period,
        entries,
        reference,
        owner,
      );
    } catch {
      this.logger.error(`Failed to refresh ${period} ranking projection`);
      return false;
    } finally {
      await this.cache.releaseRefreshLock(period, reference, owner);
    }
  }

  private queryProjection(
    period: RankingPeriod,
    reference: Date,
  ): Promise<ProjectionRow[]> {
    const scoreRows = this.scoreRowsQuery(period, reference);
    return this.prisma.$queryRaw<ProjectionRow[]>(Prisma.sql`
      WITH "scoreRows" AS (
        ${scoreRows}
      ),
      "rankedRows" AS (
        SELECT
          "userId",
          "nickname",
          "tier",
          "profileImageUrl",
          "score",
          RANK() OVER (ORDER BY "score" DESC) AS "rank",
          COUNT(*) OVER () AS "totalUsers"
        FROM "scoreRows"
      )
      SELECT
        "userId",
        "nickname",
        "tier",
        "profileImageUrl",
        "score",
        "rank",
        "totalUsers"
      FROM "rankedRows"
      ORDER BY "score" DESC, "userId" ASC
    `);
  }

  private scoreRowsQuery(period: RankingPeriod, reference: Date): Prisma.Sql {
    switch (period) {
      case RankingPeriod.TOTAL:
        return Prisma.sql`
          SELECT
            u."id" AS "userId",
            u."nickname",
            u."tier"::text AS "tier",
            u."profileImageUrl",
            u."totalScore" AS "score"
          FROM "User" u
        `;
      case RankingPeriod.DAILY: {
        const day = this.dateKey(startOfUtcDay(reference));
        return Prisma.sql`
          SELECT
            u."id" AS "userId",
            u."nickname",
            u."tier"::text AS "tier",
            u."profileImageUrl",
            COALESCE(d."cappedScore", 0) AS "score"
          FROM "User" u
          LEFT JOIN "DailyScore" d
            ON d."userId" = u."id"
           AND d."scoreDate" = CAST(${day} AS date)
        `;
      }
      case RankingPeriod.WEEKLY: {
        const { gte, lt } = weeklyRange(reference);
        const from = this.dateKey(gte);
        const until = this.dateKey(lt);
        return Prisma.sql`
          SELECT
            u."id" AS "userId",
            u."nickname",
            u."tier"::text AS "tier",
            u."profileImageUrl",
            COALESCE(w."score", 0::bigint) AS "score"
          FROM "User" u
          LEFT JOIN (
            SELECT "userId", SUM("cappedScore") AS "score"
            FROM "DailyScore"
            WHERE "scoreDate" >= CAST(${from} AS date)
              AND "scoreDate" < CAST(${until} AS date)
            GROUP BY "userId"
          ) w ON w."userId" = u."id"
        `;
      }
    }
  }

  private normalizeProjection(
    rows: ProjectionRow[],
    period: RankingPeriod,
  ): RankingProjectionEntry[] {
    const expectedTotal = rows.length;
    const userIds = new Set<string>();

    return rows.map((row) => {
      const score = this.safeInteger(row.score);
      const rank = this.safeInteger(row.rank);
      const totalUsers = this.safeInteger(row.totalUsers);
      if (
        typeof row.userId !== 'string' ||
        row.userId.length === 0 ||
        userIds.has(row.userId) ||
        typeof row.nickname !== 'string' ||
        !Object.values(Tier).includes(row.tier as Tier) ||
        (row.profileImageUrl !== null &&
          typeof row.profileImageUrl !== 'string') ||
        totalUsers !== expectedTotal ||
        rank < 1 ||
        rank > totalUsers
      ) {
        throw new Error('Invalid ranking projection row');
      }
      userIds.add(row.userId);

      return {
        period,
        userId: row.userId,
        nickname: row.nickname,
        tier: row.tier as Tier,
        profileImageUrl: row.profileImageUrl,
        score,
        rank,
        percentile:
          totalUsers === 0
            ? 0
            : Math.round((rank / totalUsers) * 100 * 100) / 100,
        totalUsers,
      };
    });
  }

  private safeInteger(value: number | bigint): number {
    const normalized = typeof value === 'bigint' ? Number(value) : value;
    if (!Number.isSafeInteger(normalized)) {
      throw new Error('Ranking projection integer is outside the safe range');
    }
    return normalized;
  }

  private dateKey(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}

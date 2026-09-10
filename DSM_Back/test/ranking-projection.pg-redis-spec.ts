import { ConfigService } from '@nestjs/config';
import { RankingPeriod } from '@prisma/client';
import { createClient } from '@redis/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { RankingCacheService } from '../src/rankings/ranking-cache.service';
import { RankingProjectionService } from '../src/rankings/ranking-projection.service';
import { RankingsService } from '../src/rankings/rankings.service';

interface DisposableRankingConfig {
  databaseUrl: string;
  redisUrl: string;
}

function requireDisposableRankingConfig(): DisposableRankingConfig {
  if (process.env.F069_DISPOSABLE_RANKING_TEST !== '1') {
    throw new Error('F069 disposable ranking marker is required');
  }

  const databaseUrl = process.env.F069_DATABASE_URL;
  const redisUrl = process.env.F069_REDIS_URL;
  if (!databaseUrl || !redisUrl) {
    throw new Error('F069 disposable ranking configuration is incomplete');
  }

  const database = new URL(databaseUrl);
  if (
    !['postgres:', 'postgresql:'].includes(database.protocol) ||
    database.hostname !== '127.0.0.1' ||
    !database.port ||
    !database.pathname.slice(1).startsWith('f069_ranking_projection_')
  ) {
    throw new Error(
      'F069 database must be an explicit task-owned loopback URL',
    );
  }

  const redis = new URL(redisUrl);
  if (
    redis.protocol !== 'redis:' ||
    redis.hostname !== '127.0.0.1' ||
    !redis.port ||
    (redis.pathname !== '' && redis.pathname !== '/0')
  ) {
    throw new Error('F069 Redis must be an explicit disposable loopback URL');
  }

  return { databaseUrl, redisUrl };
}

const config = requireDisposableRankingConfig();
process.env.DATABASE_URL = config.databaseUrl;

const USER_IDS = {
  first: '10000000-0000-4000-8000-000000000001',
  second: '20000000-0000-4000-8000-000000000002',
  third: '30000000-0000-4000-8000-000000000003',
};

describe.each(['2026-09-08T12:00:00.000Z', '2026-09-15T00:00:00.000Z'])(
  'F-069 PostgreSQL/Redis at %s',
  (referenceIso) => {
    const REFERENCE = new Date(referenceIso);
    const scoreDate = (daysAgo: number) =>
      new Date(
        Date.UTC(
          REFERENCE.getUTCFullYear(),
          REFERENCE.getUTCMonth(),
          REFERENCE.getUTCDate() - daysAgo,
        ),
      );
    const prisma = new PrismaService();
    const redisAdmin = createClient({ url: config.redisUrl });
    const configService = {
      get: jest.fn((key: string) =>
        key === 'REDIS_URL' ? config.redisUrl : undefined,
      ),
    } as unknown as ConfigService;
    const cache = new RankingCacheService(configService);
    const projection = new RankingProjectionService(prisma, cache);
    const rankings = new RankingsService(prisma, cache, projection);
    const disabledCache = new RankingCacheService({
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService);
    const fallbackProjection = new RankingProjectionService(
      prisma,
      disabledCache,
    );

    beforeAll(async () => {
      // Freeze Date only: Redis/socket timers and monotonic clocks remain real.
      jest.useFakeTimers({
        now: REFERENCE,
        doNotFake: [
          'hrtime',
          'nextTick',
          'performance',
          'queueMicrotask',
          'setImmediate',
          'clearImmediate',
          'setInterval',
          'clearInterval',
          'setTimeout',
          'clearTimeout',
        ],
      });
      await prisma.$connect();
      redisAdmin.on('error', () => undefined);
      await redisAdmin.connect();
      await redisAdmin.flushDb();

      await prisma.user.createMany({
        data: [
          {
            id: USER_IDS.first,
            nickname: 'rank-a',
            totalScore: 900,
            tier: 'GOLD',
          },
          {
            id: USER_IDS.second,
            nickname: 'rank-b',
            totalScore: 500,
            tier: 'SILVER',
          },
          {
            id: USER_IDS.third,
            nickname: 'rank-c',
            totalScore: 500,
            tier: 'BRONZE',
          },
        ],
      });
      await prisma.dailyScore.createMany({
        data: [
          {
            userId: USER_IDS.first,
            scoreDate: scoreDate(0),
            cappedScore: 100,
          },
          {
            userId: USER_IDS.second,
            scoreDate: scoreDate(0),
            cappedScore: 80,
          },
          {
            userId: USER_IDS.second,
            scoreDate: scoreDate(1),
            cappedScore: 30,
          },
          {
            userId: USER_IDS.third,
            scoreDate: scoreDate(2),
            cappedScore: 110,
          },
        ],
      });
      await cache.onModuleInit();
    });

    afterAll(async () => {
      jest.useRealTimers();
      cache.onModuleDestroy();
      if (redisAdmin.isReady) {
        await redisAdmin.flushDb();
      }
      if (redisAdmin.isOpen) {
        redisAdmin.destroy();
      }
      await prisma.user.deleteMany({
        where: { id: { in: Object.values(USER_IDS) } },
      });
      await prisma.$disconnect();
    });

    it('publishes all periods and serves cached requests without database reads', async () => {
      await expect(
        fallbackProjection.readLeaderboardFromDatabase(
          RankingPeriod.TOTAL,
          3,
          REFERENCE,
        ),
      ).resolves.toMatchObject([
        { userId: USER_IDS.first, rank: 1, score: 900 },
        { userId: USER_IDS.second, rank: 2, score: 500 },
        { userId: USER_IDS.third, rank: 2, score: 500 },
      ]);
      await expect(
        fallbackProjection.readLeaderboardFromDatabase(
          RankingPeriod.DAILY,
          3,
          REFERENCE,
        ),
      ).resolves.toMatchObject([
        { userId: USER_IDS.first, rank: 1, score: 100 },
        { userId: USER_IDS.second, rank: 2, score: 80 },
        { userId: USER_IDS.third, rank: 3, score: 0 },
      ]);
      await expect(
        fallbackProjection.readLeaderboardFromDatabase(
          RankingPeriod.WEEKLY,
          3,
          REFERENCE,
        ),
      ).resolves.toMatchObject([
        { userId: USER_IDS.second, rank: 1, score: 110 },
        { userId: USER_IDS.third, rank: 1, score: 110 },
        { userId: USER_IDS.first, rank: 3, score: 100 },
      ]);

      await projection.refreshAll(REFERENCE);
      const generationKeys = await redisAdmin.keys(
        'dsm:rankings:v1:*:generation:*',
      );
      const generationTtls = await Promise.all(
        generationKeys.map((key) => redisAdmin.pTTL(key)),
      );
      expect(generationKeys).toHaveLength(9);
      expect(generationTtls.every((ttl) => ttl > 0)).toBe(true);

      const activeKeys = await redisAdmin.keys('dsm:rankings:v1:*:active');
      expect(activeKeys).toHaveLength(3);
      await Promise.all(
        activeKeys.map((key) => redisAdmin.pExpire(key, 120_000)),
      );
      await projection.refreshAll(REFERENCE);
      const activeGenerations = new Set(
        (
          await Promise.all(activeKeys.map((key) => redisAdmin.get(key)))
        ).filter((generation): generation is string => generation !== null),
      );
      const rolledGenerationKeys = await redisAdmin.keys(
        'dsm:rankings:v1:*:generation:*',
      );
      const retiredGenerationKeys = rolledGenerationKeys.filter(
        (key) =>
          ![...activeGenerations].some((generation) =>
            key.includes(`:generation:${generation}:`),
          ),
      );
      const retiredGenerationTtls = await Promise.all(
        retiredGenerationKeys.map((key) => redisAdmin.pTTL(key)),
      );
      expect(activeGenerations.size).toBe(3);
      expect(rolledGenerationKeys).toHaveLength(18);
      expect(retiredGenerationKeys).toHaveLength(9);
      expect(
        retiredGenerationTtls.every((ttl) => ttl > 0 && ttl <= 30_000),
      ).toBe(true);
      await expect(
        cache.isProjectionFresh(RankingPeriod.TOTAL, REFERENCE, 45_000),
      ).resolves.toBe(true);
      await prisma.$disconnect();

      // Prisma can reconnect after $disconnect; observe every fallback read too.
      const databaseReads = [
        jest.spyOn(prisma, '$queryRaw'),
        jest.spyOn(prisma.user, 'findUniqueOrThrow'),
        jest.spyOn(prisma.user, 'count'),
        jest.spyOn(prisma.dailyScore, 'findUnique'),
        jest.spyOn(prisma.dailyScore, 'count'),
        jest.spyOn(prisma.dailyScore, 'aggregate'),
        jest.spyOn(prisma.dailyScore, 'groupBy'),
      ];
      try {
        await expect(
          rankings.getMyRanking(USER_IDS.third, RankingPeriod.TOTAL),
        ).resolves.toEqual({
          period: RankingPeriod.TOTAL,
          score: 500,
          rank: 2,
          percentile: 66.67,
          totalUsers: 3,
        });
        await expect(
          rankings.getMyRanking(USER_IDS.third, RankingPeriod.DAILY),
        ).resolves.toEqual({
          period: RankingPeriod.DAILY,
          score: 0,
          rank: 3,
          percentile: 100,
          totalUsers: 3,
        });
        await expect(
          rankings.getMyRanking(USER_IDS.first, RankingPeriod.WEEKLY),
        ).resolves.toEqual({
          period: RankingPeriod.WEEKLY,
          score: 100,
          rank: 3,
          percentile: 100,
          totalUsers: 3,
        });
        await expect(
          rankings.getLeaderboard(RankingPeriod.TOTAL, 3),
        ).resolves.toMatchObject([
          { userId: USER_IDS.first, rank: 1, score: 900 },
          { userId: USER_IDS.second, rank: 2, score: 500 },
          { userId: USER_IDS.third, rank: 2, score: 500 },
        ]);
        await expect(
          rankings.getLeaderboard(RankingPeriod.DAILY, 3),
        ).resolves.toHaveLength(3);
        await expect(
          rankings.getLeaderboard(RankingPeriod.WEEKLY, 3),
        ).resolves.toHaveLength(3);
        for (const read of databaseReads) {
          expect(read).not.toHaveBeenCalled();
        }
      } finally {
        for (const read of databaseReads) {
          read.mockRestore();
        }
      }
    });

    it('only releases a distributed refresh lock for its owner', async () => {
      const firstOwner = 'first-owner';
      const secondOwner = 'second-owner';

      await expect(
        cache.acquireRefreshLock(
          RankingPeriod.TOTAL,
          REFERENCE,
          firstOwner,
          10_000,
        ),
      ).resolves.toBe('acquired');
      await expect(
        cache.acquireRefreshLock(
          RankingPeriod.TOTAL,
          REFERENCE,
          secondOwner,
          10_000,
        ),
      ).resolves.toBe('held');

      await cache.releaseRefreshLock(
        RankingPeriod.TOTAL,
        REFERENCE,
        secondOwner,
      );
      await expect(
        cache.acquireRefreshLock(
          RankingPeriod.TOTAL,
          REFERENCE,
          secondOwner,
          10_000,
        ),
      ).resolves.toBe('held');

      await cache.releaseRefreshLock(
        RankingPeriod.TOTAL,
        REFERENCE,
        firstOwner,
      );
      await expect(
        cache.acquireRefreshLock(
          RankingPeriod.TOTAL,
          REFERENCE,
          secondOwner,
          10_000,
        ),
      ).resolves.toBe('acquired');
      await expect(
        cache.publishProjection(
          RankingPeriod.TOTAL,
          [
            {
              period: RankingPeriod.TOTAL,
              userId: USER_IDS.first,
              nickname: 'stale-writer',
              tier: 'GOLD',
              profileImageUrl: null,
              score: 1,
              rank: 1,
              percentile: 100,
              totalUsers: 1,
            },
          ],
          REFERENCE,
          firstOwner,
        ),
      ).resolves.toBe(false);
      await expect(
        cache.readMyRanking(USER_IDS.first, RankingPeriod.TOTAL, REFERENCE),
      ).resolves.toMatchObject({
        score: 900,
        rank: 1,
      });
      await cache.releaseRefreshLock(
        RankingPeriod.TOTAL,
        REFERENCE,
        secondOwner,
      );
    });

    it.each(['missing', 'truncated', 'invalid-marker'])(
      'falls back to the database for an incomplete generation: %s',
      async (failure) => {
        await redisAdmin.flushDb();
        await projection.refreshPeriod(RankingPeriod.TOTAL, REFERENCE);
        const generation = await redisAdmin.get(
          'dsm:rankings:v1:{TOTAL}:active',
        );
        expect(generation).not.toBeNull();
        const base = `dsm:rankings:v1:{TOTAL}:generation:${generation}`;
        if (failure === 'missing') {
          await redisAdmin.del(`${base}:leaderboard`);
        } else if (failure === 'truncated') {
          await redisAdmin.lTrim(`${base}:leaderboard`, 0, 1);
        } else {
          await redisAdmin.set(`${base}:complete`, '{"entryCount":-1}');
        }
        await expect(
          cache.readLeaderboard(RankingPeriod.TOTAL, 3, REFERENCE),
        ).resolves.toBeNull();

        const fallback = jest.spyOn(projection, 'readLeaderboardFromDatabase');
        try {
          await expect(
            rankings.getLeaderboard(RankingPeriod.TOTAL, 3),
          ).resolves.toMatchObject([
            { userId: USER_IDS.first, rank: 1, score: 900 },
            { userId: USER_IDS.second, rank: 2, score: 500 },
            { userId: USER_IDS.third, rank: 2, score: 500 },
          ]);
          expect(fallback).toHaveBeenCalledTimes(1);
        } finally {
          fallback.mockRestore();
        }
      },
    );

    it('preserves a legitimately empty published projection', async () => {
      await redisAdmin.flushDb();
      const owner = 'empty-projection-owner';
      await expect(
        cache.acquireRefreshLock(RankingPeriod.TOTAL, REFERENCE, owner, 10_000),
      ).resolves.toBe('acquired');
      try {
        await expect(
          cache.publishProjection(RankingPeriod.TOTAL, [], REFERENCE, owner),
        ).resolves.toBe(true);
        await expect(
          cache.readLeaderboard(RankingPeriod.TOTAL, 3, REFERENCE),
        ).resolves.toEqual([]);
      } finally {
        await cache.releaseRefreshLock(RankingPeriod.TOTAL, REFERENCE, owner);
      }
    });
  },
);

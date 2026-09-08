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

const REFERENCE = new Date('2026-09-08T12:00:00.000Z');
const USER_IDS = {
  first: '10000000-0000-4000-8000-000000000001',
  second: '20000000-0000-4000-8000-000000000002',
  third: '30000000-0000-4000-8000-000000000003',
};

describe('F-069 PostgreSQL window projection and Redis cache', () => {
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
          scoreDate: new Date('2026-09-08T00:00:00.000Z'),
          cappedScore: 100,
        },
        {
          userId: USER_IDS.second,
          scoreDate: new Date('2026-09-08T00:00:00.000Z'),
          cappedScore: 80,
        },
        {
          userId: USER_IDS.second,
          scoreDate: new Date('2026-09-07T00:00:00.000Z'),
          cappedScore: 30,
        },
        {
          userId: USER_IDS.third,
          scoreDate: new Date('2026-09-06T00:00:00.000Z'),
          cappedScore: 110,
        },
      ],
    });
    await cache.onModuleInit();
  });

  afterAll(async () => {
    cache.onModuleDestroy();
    if (redisAdmin.isReady) {
      await redisAdmin.flushDb();
    }
    if (redisAdmin.isOpen) {
      redisAdmin.destroy();
    }
    await prisma.$disconnect();
  });

  it('publishes all periods and serves requests after PostgreSQL disconnects', async () => {
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
      (await Promise.all(activeKeys.map((key) => redisAdmin.get(key)))).filter(
        (generation): generation is string => generation !== null,
      ),
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
    expect(retiredGenerationTtls.every((ttl) => ttl > 0 && ttl <= 30_000)).toBe(
      true,
    );
    await expect(
      cache.isProjectionFresh(RankingPeriod.TOTAL, REFERENCE, 45_000),
    ).resolves.toBe(true);
    await prisma.$disconnect();

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

    await cache.releaseRefreshLock(RankingPeriod.TOTAL, REFERENCE, secondOwner);
    await expect(
      cache.acquireRefreshLock(
        RankingPeriod.TOTAL,
        REFERENCE,
        secondOwner,
        10_000,
      ),
    ).resolves.toBe('held');

    await cache.releaseRefreshLock(RankingPeriod.TOTAL, REFERENCE, firstOwner);
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
    await cache.releaseRefreshLock(RankingPeriod.TOTAL, REFERENCE, secondOwner);
  });
});

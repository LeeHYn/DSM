import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { Prisma, RankingPeriod } from '@prisma/client';
import { createClient } from '@redis/client';
import { cpus, platform, release } from 'node:os';
import { performance } from 'node:perf_hooks';
import { writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { PrismaService } from '../src/prisma/prisma.service';
import { RankingCacheService } from '../src/rankings/ranking-cache.service';
import { RankingProjectionService } from '../src/rankings/ranking-projection.service';

interface BenchmarkConfig {
  databaseUrl: string;
  redisUrl: string;
  outputPath: string;
  userCount: number;
  projectionSamples: number;
  readSamples: number;
  readConcurrency: number;
}

interface ExplainPlan extends Record<string, unknown> {
  'Node Type': string;
  Plans?: ExplainPlan[];
}

interface ExplainDocument extends Record<string, unknown> {
  Plan: ExplainPlan;
  'Planning Time': number;
  'Execution Time': number;
}

interface ExplainRow {
  'QUERY PLAN': ExplainDocument[];
}

interface Distribution {
  samples: number;
  minMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  meanMs: number;
}

interface FlushableRedisClient {
  flushDb(): Promise<unknown>;
}

const PERIODS = [
  RankingPeriod.DAILY,
  RankingPeriod.WEEKLY,
  RankingPeriod.TOTAL,
] as const;

function boundedInteger(
  name: string,
  raw: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
}

function benchmarkConfig(): BenchmarkConfig {
  if (process.env.F069_RANKING_BENCHMARK !== '1') {
    throw new Error('F069 benchmark marker is required');
  }

  const databaseUrl = process.env.F069_DATABASE_URL;
  const redisUrl = process.env.F069_REDIS_URL;
  const outputPath = process.env.F069_BENCH_OUTPUT;
  if (!databaseUrl || !redisUrl || !outputPath) {
    throw new Error('F069 benchmark configuration is incomplete');
  }

  const database = new URL(databaseUrl);
  const databaseName = decodeURIComponent(database.pathname.slice(1));
  if (
    !['postgres:', 'postgresql:'].includes(database.protocol) ||
    database.hostname !== '127.0.0.1' ||
    !database.port ||
    !databaseName.startsWith('f069_ranking_benchmark_')
  ) {
    throw new Error('F069 benchmark database must be task-owned and loopback');
  }

  const redis = new URL(redisUrl);
  if (
    redis.protocol !== 'redis:' ||
    redis.hostname !== '127.0.0.1' ||
    !redis.port ||
    redis.pathname !== '/15'
  ) {
    throw new Error('F069 benchmark Redis must use loopback database 15');
  }

  return {
    databaseUrl,
    redisUrl,
    outputPath,
    userCount: boundedInteger(
      'F069_BENCH_USERS',
      process.env.F069_BENCH_USERS,
      50_000,
      1_000,
      100_000,
    ),
    projectionSamples: boundedInteger(
      'F069_BENCH_PROJECTION_SAMPLES',
      process.env.F069_BENCH_PROJECTION_SAMPLES,
      10,
      5,
      30,
    ),
    readSamples: boundedInteger(
      'F069_BENCH_READ_SAMPLES',
      process.env.F069_BENCH_READ_SAMPLES,
      1_000,
      100,
      10_000,
    ),
    readConcurrency: boundedInteger(
      'F069_BENCH_READ_CONCURRENCY',
      process.env.F069_BENCH_READ_CONCURRENCY,
      25,
      1,
      100,
    ),
  };
}

function round(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function distribution(samples: number[]): Distribution {
  if (samples.length === 0) {
    throw new Error('Cannot summarize an empty benchmark sample');
  }
  const sorted = [...samples].sort((left, right) => left - right);
  const percentile = (fraction: number): number =>
    sorted[
      Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)
    ];
  return {
    samples: sorted.length,
    minMs: round(sorted[0]),
    p50Ms: round(percentile(0.5)),
    p95Ms: round(percentile(0.95)),
    p99Ms: round(percentile(0.99)),
    maxMs: round(sorted[sorted.length - 1]),
    meanMs: round(
      sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    ),
  };
}

function parseInfoNumber(info: string, key: string): number {
  const line = info
    .split(/\r?\n/)
    .find((candidate) => candidate.startsWith(`${key}:`));
  const value =
    line === undefined ? Number.NaN : Number(line.slice(key.length + 1));
  if (!Number.isFinite(value)) {
    throw new Error(`Redis INFO did not contain numeric ${key}`);
  }
  return value;
}

async function seedDatabase(
  prisma: PrismaService,
  userCount: number,
  reference: Date,
): Promise<number> {
  if ((await prisma.user.count()) !== 0) {
    throw new Error('F069 benchmark database must start empty');
  }

  const startedAt = performance.now();
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "User" (
      "id",
      "nickname",
      "totalScore",
      "tier",
      "notificationEnabled",
      "createdAt",
      "updatedAt"
    )
    SELECT
      gen_random_uuid()::text,
      'bench-' || series::text,
      ((series * 37) % 100000)::integer,
      'BRONZE'::"Tier",
      true,
      NOW(),
      NOW()
    FROM generate_series(1, CAST(${userCount} AS integer)) AS series
  `);

  const dateKey = reference.toISOString().slice(0, 10);
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "DailyScore" (
      "id",
      "userId",
      "scoreDate",
      "cappedScore",
      "updatedAt"
    )
    SELECT
      gen_random_uuid()::text,
      users."id",
      CAST(${dateKey} AS date) - offsets.day,
      CAST(
        ABS(MOD(hashtextextended(users."id" || ':' || offsets.day::text, 0), 451))
        AS integer
      ),
      NOW()
    FROM "User" users
    CROSS JOIN generate_series(0, 6) AS offsets(day)
  `);
  await prisma.$executeRaw(Prisma.sql`ANALYZE "User"`);
  await prisma.$executeRaw(Prisma.sql`ANALYZE "DailyScore"`);
  return round(performance.now() - startedAt);
}

async function captureProjectionQuery(
  period: RankingPeriod,
  reference: Date,
): Promise<Prisma.Sql> {
  let captured: Prisma.Sql | undefined;
  const prismaCapture = {
    $queryRaw: (query: Prisma.Sql) => {
      captured = query;
      return Promise.resolve([]);
    },
  } as unknown as PrismaService;
  const cacheCapture = {
    isConfigured: () => true,
    projectionIdentity: (value: RankingPeriod) => value,
    acquireRefreshLock: () => Promise.resolve('acquired'),
    isProjectionFresh: () => Promise.resolve(false),
    publishProjection: () => Promise.resolve(true),
    releaseRefreshLock: () => Promise.resolve(),
  } as unknown as RankingCacheService;
  const projection = new RankingProjectionService(prismaCapture, cacheCapture);
  if (!(await projection.refreshPeriod(period, reference)) || !captured) {
    throw new Error(`Could not capture ${period} projection query`);
  }
  return captured;
}

async function explainProjection(
  prisma: PrismaService,
  period: RankingPeriod,
  reference: Date,
): Promise<ExplainDocument> {
  const query = await captureProjectionQuery(period, reference);
  const rows = await prisma.$queryRaw<ExplainRow[]>(Prisma.sql`
    EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    ${query}
  `);
  const document = rows[0]?.['QUERY PLAN']?.[0];
  if (!document?.Plan || typeof document['Execution Time'] !== 'number') {
    throw new Error(`Invalid ${period} EXPLAIN output`);
  }
  return document;
}

async function benchmarkProjection(
  projection: RankingProjectionService,
  redis: FlushableRedisClient,
  period: RankingPeriod,
  reference: Date,
  sampleCount: number,
): Promise<Distribution> {
  await redis.flushDb();
  if (!(await projection.refreshPeriod(period, reference))) {
    throw new Error(`${period} projection warm-up failed`);
  }

  const samples: number[] = [];
  for (let index = 0; index < sampleCount; index += 1) {
    await redis.flushDb();
    const startedAt = performance.now();
    const published = await projection.refreshPeriod(period, reference);
    samples.push(performance.now() - startedAt);
    if (!published) {
      throw new Error(`${period} projection sample ${index + 1} failed`);
    }
  }
  return distribution(samples);
}

async function benchmarkConcurrentReads(
  sampleCount: number,
  concurrency: number,
  operation: (sample: number) => Promise<void>,
): Promise<Distribution & { wallMs: number; throughputPerSecond: number }> {
  const samples: number[] = [];
  const wallStartedAt = performance.now();
  for (let offset = 0; offset < sampleCount; offset += concurrency) {
    const batchSize = Math.min(concurrency, sampleCount - offset);
    await Promise.all(
      Array.from({ length: batchSize }, async (_, index) => {
        const startedAt = performance.now();
        await operation(offset + index);
        samples.push(performance.now() - startedAt);
      }),
    );
  }
  const wallMs = performance.now() - wallStartedAt;
  return {
    ...distribution(samples),
    wallMs: round(wallMs),
    throughputPerSecond: round((sampleCount / wallMs) * 1_000),
  };
}

async function run(): Promise<void> {
  const config = benchmarkConfig();
  process.env.DATABASE_URL = config.databaseUrl;
  const reference = new Date();
  const prisma = new PrismaService();
  const redis = createClient({ url: config.redisUrl });
  redis.on('error', () => undefined);
  const cache = new RankingCacheService(
    new ConfigService({ REDIS_URL: config.redisUrl }),
  );
  const projection = new RankingProjectionService(prisma, cache);

  try {
    await prisma.$connect();
    await redis.connect();
    await redis.flushDb();
    await cache.onModuleInit();

    const seedMs = await seedDatabase(prisma, config.userCount, reference);
    const postgresVersion = await prisma.$queryRaw<Array<{ version: string }>>(
      Prisma.sql`SELECT version()`,
    );
    const redisServerInfo = await redis.info('server');

    const queryPlans: Record<string, ExplainDocument> = {};
    for (const period of PERIODS) {
      queryPlans[period] = await explainProjection(prisma, period, reference);
    }

    const projectionLatency: Record<string, Distribution> = {};
    for (const period of PERIODS) {
      projectionLatency[period] = await benchmarkProjection(
        projection,
        redis,
        period,
        reference,
        config.projectionSamples,
      );
    }

    await redis.flushDb();
    const refreshAllStartedAt = performance.now();
    await projection.refreshAll(reference);
    const refreshAllMs = round(performance.now() - refreshAllStartedAt);
    const sampleUsers = await prisma.user.findMany({
      take: 100,
      select: { id: true },
    });
    if (sampleUsers.length !== 100) {
      throw new Error('Benchmark could not select 100 sample users');
    }

    const leaderboardReads = await benchmarkConcurrentReads(
      config.readSamples,
      config.readConcurrency,
      async () => {
        const entries = await cache.readLeaderboard(
          RankingPeriod.TOTAL,
          100,
          reference,
        );
        if (entries?.length !== 100) {
          throw new Error('Cached leaderboard read was incomplete');
        }
      },
    );
    const personalReads = await benchmarkConcurrentReads(
      config.readSamples,
      config.readConcurrency,
      async (sample) => {
        const user = sampleUsers[sample % sampleUsers.length];
        const ranking = await cache.readMyRanking(
          user.id,
          RankingPeriod.TOTAL,
          reference,
        );
        if (!ranking) {
          throw new Error('Cached personal ranking read was missing');
        }
      },
    );

    const redisMemoryInfo = await redis.info('memory');
    const firstGenerationSnapshot = {
      keys: await redis.dbSize(),
      generationKeys: (await redis.keys('dsm:rankings:v1:*:generation:*'))
        .length,
      usedMemoryBytes: parseInfoNumber(redisMemoryInfo, 'used_memory'),
    };
    const activeKeys = await redis.keys('dsm:rankings:v1:*:active');
    await Promise.all(activeKeys.map((key) => redis.pExpire(key, 120_000)));
    const rolloverStartedAt = performance.now();
    await projection.refreshAll(reference);
    const rolloverMs = round(performance.now() - rolloverStartedAt);
    const activeGenerations = new Set(
      (await Promise.all(activeKeys.map((key) => redis.get(key)))).filter(
        (generation): generation is string => generation !== null,
      ),
    );
    const rolledGenerationKeys = await redis.keys(
      'dsm:rankings:v1:*:generation:*',
    );
    const retiredGenerationKeys = rolledGenerationKeys.filter(
      (key) =>
        ![...activeGenerations].some((generation) =>
          key.includes(`:generation:${generation}:`),
        ),
    );
    const retiredGenerationTtls = await Promise.all(
      retiredGenerationKeys.map((key) => redis.pTTL(key)),
    );
    if (
      activeGenerations.size !== 3 ||
      rolledGenerationKeys.length !== 18 ||
      retiredGenerationKeys.length !== 9 ||
      retiredGenerationTtls.some((ttl) => ttl <= 0 || ttl > 30_000)
    ) {
      throw new Error('Generation rollover did not bound retired cache keys');
    }
    const rolloverMemoryInfo = await redis.info('memory');
    const rolloverImmediateSnapshot = {
      keys: await redis.dbSize(),
      generationKeys: rolledGenerationKeys.length,
      retiredGenerationKeys: retiredGenerationKeys.length,
      retiredTtlMinMs: Math.min(...retiredGenerationTtls),
      retiredTtlMaxMs: Math.max(...retiredGenerationTtls),
      usedMemoryBytes: parseInfoNumber(rolloverMemoryInfo, 'used_memory'),
    };
    await delay(31_000);
    const afterGraceMemoryInfo = await redis.info('memory');
    const afterGraceSnapshot = {
      waitedMs: 31_000,
      keys: await redis.dbSize(),
      generationKeys: (await redis.keys('dsm:rankings:v1:*:generation:*'))
        .length,
      usedMemoryBytes: parseInfoNumber(afterGraceMemoryInfo, 'used_memory'),
    };
    if (
      afterGraceSnapshot.keys !== 12 ||
      afterGraceSnapshot.generationKeys !== 9
    ) {
      throw new Error('Retired generation keys survived their grace period');
    }

    const result = {
      schemaVersion: '1.0.0',
      benchmark: 'F-069 synthetic PostgreSQL and Redis ranking benchmark',
      measuredAt: new Date().toISOString(),
      interpretation:
        'Synthetic single-host evidence only; the requirements define no numeric latency SLO, and these results do not represent production or managed Redis failover.',
      dataset: {
        users: config.userCount,
        dailyScores: config.userCount * 7,
        utcDays: 7,
        seedMs,
      },
      environment: {
        node: process.version,
        platform: platform(),
        osRelease: release(),
        cpu: cpus()[0]?.model ?? 'unknown',
        logicalCpuCount: cpus().length,
        postgres: postgresVersion[0]?.version ?? 'unknown',
        redis: redisServerInfo.match(/^redis_version:(.+)$/m)?.[1] ?? 'unknown',
      },
      parameters: {
        projectionSamplesPerPeriod: config.projectionSamples,
        readSamplesPerOperation: config.readSamples,
        readConcurrency: config.readConcurrency,
      },
      queryPlans,
      projectionLatencyMs: projectionLatency,
      allPeriodsColdRefreshMs: refreshAllMs,
      cacheReadLatencyMs: {
        totalTop100: leaderboardReads,
        totalPersonal: personalReads,
      },
      redisGenerationLifecycle: {
        firstGeneration: firstGenerationSnapshot,
        rollover: {
          refreshMs: rolloverMs,
          immediate: rolloverImmediateSnapshot,
          afterGrace: afterGraceSnapshot,
        },
      },
    };
    await writeFile(config.outputPath, `${JSON.stringify(result, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
    process.stdout.write(
      `${JSON.stringify({ outputPath: config.outputPath, dataset: result.dataset })}\n`,
    );
  } finally {
    cache.onModuleDestroy();
    if (redis.isOpen) {
      redis.destroy();
    }
    await prisma.$disconnect();
  }
}

void run().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});

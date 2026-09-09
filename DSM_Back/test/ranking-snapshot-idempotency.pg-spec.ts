import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { RankingPeriod } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { RankingCacheService } from '../src/rankings/ranking-cache.service';
import { RankingProjectionService } from '../src/rankings/ranking-projection.service';
import { RankingsService } from '../src/rankings/rankings.service';
import { startOfUtcDay } from '../src/rankings/rankings.policy';

const CONSTRAINT_NAME = 'RankingSnapshot_snapshotDate_required';
const INDEX_NAME = 'RankingSnapshot_userId_period_snapshotDate_key';

function requireDisposableDatabaseUrl(): string {
  if (process.env.F012_DISPOSABLE_DB_TEST !== '1') {
    throw new Error('F-012 disposable database marker is required');
  }
  const raw = process.env.F012_DATABASE_URL;
  if (!raw) {
    throw new Error('F-012 disposable database URL is required');
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('F-012 disposable database URL is invalid');
  }
  const databaseName = url.pathname.slice(1);
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    url.hostname !== '127.0.0.1' ||
    !url.port ||
    !databaseName.startsWith('f012_ranking_snapshot_') ||
    databaseName === 'dsm_test'
  ) {
    throw new Error('F-012 database must be a loopback task-owned database');
  }
  return raw;
}

const enabled = process.env.F012_DISPOSABLE_DB_TEST === '1';
const databaseUrl = enabled ? requireDisposableDatabaseUrl() : undefined;
const describePostgres = enabled ? describe : describe.skip;

type ConstraintRow = {
  validated: boolean;
  definition: string;
};

type IndexRow = {
  definition: string;
};

describePostgres('ranking snapshot idempotency PostgreSQL integration', () => {
  const userId = `ranking-snapshot-${randomUUID()}`;
  let prisma: PrismaService;
  let rankings: RankingsService;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl!;
    prisma = new PrismaService();
    const cache = new RankingCacheService({
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService);
    rankings = new RankingsService(
      prisma,
      cache,
      new RankingProjectionService(prisma, cache),
    );
    await prisma.$connect();
    await prisma.user.create({
      data: {
        id: userId,
        nickname: userId,
        totalScore: 500,
        onboardingCompletedAt: new Date(),
      },
    });
  });

  beforeEach(async () => {
    await prisma.rankingSnapshot.deleteMany({ where: { userId } });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.user.deleteMany({ where: { id: userId } });
      await prisma.$disconnect();
    }
  });

  it('installs the staged date requirement and partial unique index', async () => {
    const constraints = await prisma.$queryRaw<ConstraintRow[]>`
      SELECT
        constraint_record.convalidated AS validated,
        pg_get_constraintdef(constraint_record.oid, true) AS definition
      FROM pg_constraint AS constraint_record
      JOIN pg_class AS relation
        ON relation.oid = constraint_record.conrelid
      JOIN pg_namespace AS namespace
        ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname = 'RankingSnapshot'
        AND constraint_record.conname = ${CONSTRAINT_NAME}
    `;
    const indexes = await prisma.$queryRaw<IndexRow[]>`
      SELECT indexdef AS definition
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'RankingSnapshot'
        AND indexname = ${INDEX_NAME}
    `;

    expect(constraints).toHaveLength(1);
    expect(constraints[0]).toMatchObject({ validated: false });
    expect(constraints[0].definition).toContain('"snapshotDate" IS NOT NULL');
    expect(indexes).toHaveLength(1);
    expect(indexes[0].definition).toContain('CREATE UNIQUE INDEX');
    expect(indexes[0].definition).toContain(
      'WHERE ("snapshotDate" IS NOT NULL)',
    );
  });

  it('rejects missing or duplicate buckets while separating period and date', async () => {
    const snapshotAt = new Date('2026-09-09T08:30:00.000Z');
    const snapshotDate = new Date('2026-09-09T00:00:00.000Z');
    const data = {
      userId,
      period: RankingPeriod.TOTAL,
      rank: 1,
      percentile: 100,
      score: 500,
      snapshotAt,
    };

    await expect(prisma.rankingSnapshot.create({ data })).rejects.toThrow();
    await prisma.rankingSnapshot.create({
      data: { ...data, snapshotDate },
    });
    await expect(
      prisma.rankingSnapshot.create({
        data: { ...data, snapshotDate },
      }),
    ).rejects.toThrow();
    await prisma.rankingSnapshot.create({
      data: {
        ...data,
        period: RankingPeriod.WEEKLY,
        snapshotDate,
      },
    });
    await prisma.rankingSnapshot.create({
      data: {
        ...data,
        snapshotDate: new Date('2026-09-10T00:00:00.000Z'),
      },
    });

    await expect(
      prisma.rankingSnapshot.count({ where: { userId } }),
    ).resolves.toBe(3);
  });

  it('coalesces concurrent first calls and reuses the immutable daily row', async () => {
    const expectedDate = startOfUtcDay(new Date());
    const snapshots = await Promise.all(
      Array.from({ length: 20 }, () =>
        rankings.createSnapshot(userId, RankingPeriod.TOTAL),
      ),
    );
    const repeated = await rankings.createSnapshot(userId, RankingPeriod.TOTAL);
    const weekly = await rankings.createSnapshot(userId, RankingPeriod.WEEKLY);

    expect(new Set(snapshots.map((snapshot) => snapshot.id)).size).toBe(1);
    expect(repeated.id).toBe(snapshots[0].id);
    expect(repeated.snapshotAt).toEqual(snapshots[0].snapshotAt);
    expect(repeated.snapshotDate).toEqual(expectedDate);
    expect(weekly.id).not.toBe(repeated.id);
    await expect(
      prisma.rankingSnapshot.count({
        where: { userId, snapshotDate: expectedDate },
      }),
    ).resolves.toBe(2);
  });
});

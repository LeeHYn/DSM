import { RankingPeriod } from '@prisma/client';
import { RankingProjectionService } from './ranking-projection.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { RankingCacheService } from './ranking-cache.service';

const REFERENCE = new Date('2026-09-08T12:34:56.000Z');

const makePrismaMock = () => ({
  $queryRaw: jest.fn(),
});

const makeCacheMock = () => ({
  isConfigured: jest.fn().mockReturnValue(true),
  projectionIdentity: jest.fn(
    (period: RankingPeriod) => `${period}:projection`,
  ),
  acquireRefreshLock: jest.fn().mockResolvedValue('acquired'),
  isProjectionFresh: jest.fn().mockResolvedValue(false),
  publishProjection: jest.fn().mockResolvedValue(true),
  releaseRefreshLock: jest.fn().mockResolvedValue(undefined),
});

const firstRawQuery = (prismaMock: ReturnType<typeof makePrismaMock>) => {
  const calls = prismaMock.$queryRaw.mock.calls as unknown[][];
  return calls[0]?.[0] as { strings: string[]; values: unknown[] };
};

const projectionRows = [
  {
    userId: 'u1',
    nickname: 'A',
    tier: 'GOLD',
    profileImageUrl: null,
    score: 900,
    rank: 1n,
    totalUsers: 3n,
  },
  {
    userId: 'u2',
    nickname: 'B',
    tier: 'SILVER',
    profileImageUrl: 'b.png',
    score: 500,
    rank: 2n,
    totalUsers: 3n,
  },
  {
    userId: 'u3',
    nickname: 'C',
    tier: 'BRONZE',
    profileImageUrl: null,
    score: 500,
    rank: 2n,
    totalUsers: 3n,
  },
];

describe('RankingProjectionService', () => {
  let prismaMock: ReturnType<typeof makePrismaMock>;
  let cacheMock: ReturnType<typeof makeCacheMock>;
  let service: RankingProjectionService;

  beforeEach(() => {
    prismaMock = makePrismaMock();
    cacheMock = makeCacheMock();
    service = new RankingProjectionService(
      prismaMock as unknown as PrismaService,
      cacheMock as unknown as RankingCacheService,
    );
  });

  it('registers a stable non-overlapping one-minute Cron job', () => {
    const cronTarget = Object.getOwnPropertyDescriptor(
      RankingProjectionService.prototype,
      'refreshScheduledProjection',
    )?.value as object;
    const metadata = Reflect.getMetadata(
      'SCHEDULE_CRON_OPTIONS',
      cronTarget,
    ) as Record<string, unknown>;

    expect(metadata.name).toBe('ranking-projection');
    expect(metadata.waitForCompletion).toBe(true);
  });

  it('projects tie-aware ranks and percentiles with window functions', async () => {
    prismaMock.$queryRaw.mockResolvedValue(projectionRows);

    await expect(
      service.refreshPeriod(RankingPeriod.DAILY, REFERENCE),
    ).resolves.toBe(true);

    const query = firstRawQuery(prismaMock);
    expect(query.strings.join('')).toContain(
      'RANK() OVER (ORDER BY "score" DESC)',
    );
    expect(query.strings.join('')).toContain('COUNT(*) OVER ()');
    expect(query.values).toContain('2026-09-08');
    expect(cacheMock.publishProjection).toHaveBeenCalledWith(
      RankingPeriod.DAILY,
      [
        expect.objectContaining({
          userId: 'u1',
          rank: 1,
          percentile: 33.33,
          totalUsers: 3,
        }),
        expect.objectContaining({
          userId: 'u2',
          rank: 2,
          percentile: 66.67,
        }),
        expect.objectContaining({
          userId: 'u3',
          rank: 2,
          percentile: 66.67,
        }),
      ],
      REFERENCE,
      expect.any(String),
    );
    expect(cacheMock.releaseRefreshLock).toHaveBeenCalledTimes(1);
  });

  it('uses the inclusive rolling seven-day UTC range for weekly scores', async () => {
    prismaMock.$queryRaw.mockResolvedValue([]);

    await service.refreshPeriod(RankingPeriod.WEEKLY, REFERENCE);

    const query = firstRawQuery(prismaMock);
    expect(query.values).toEqual(
      expect.arrayContaining(['2026-09-02', '2026-09-09']),
    );
  });

  it('does not query PostgreSQL when another instance holds the lock', async () => {
    cacheMock.acquireRefreshLock.mockResolvedValue('held');

    await expect(
      service.refreshPeriod(RankingPeriod.TOTAL, REFERENCE),
    ).resolves.toBe(false);
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
    expect(cacheMock.publishProjection).not.toHaveBeenCalled();
    expect(cacheMock.releaseRefreshLock).not.toHaveBeenCalled();
  });

  it('skips duplicate DB work after locking a recently published window', async () => {
    cacheMock.isProjectionFresh.mockResolvedValue(true);

    await expect(
      service.refreshPeriod(RankingPeriod.TOTAL, REFERENCE),
    ).resolves.toBe(true);
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
    expect(cacheMock.publishProjection).not.toHaveBeenCalled();
    expect(cacheMock.releaseRefreshLock).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent refreshes for the same period and window', async () => {
    let resolveQuery: ((rows: typeof projectionRows) => void) | undefined;
    prismaMock.$queryRaw.mockReturnValue(
      new Promise<typeof projectionRows>((resolve) => {
        resolveQuery = resolve;
      }),
    );

    const first = service.refreshPeriod(RankingPeriod.TOTAL, REFERENCE);
    const second = service.refreshPeriod(RankingPeriod.TOTAL, REFERENCE);
    resolveQuery?.(projectionRows);

    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(cacheMock.acquireRefreshLock).toHaveBeenCalledTimes(1);
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
    expect(cacheMock.publishProjection).toHaveBeenCalledTimes(1);
  });

  it('releases the distributed lock when publication fails', async () => {
    prismaMock.$queryRaw.mockResolvedValue(projectionRows);
    cacheMock.publishProjection.mockResolvedValue(false);

    await expect(
      service.refreshPeriod(RankingPeriod.TOTAL, REFERENCE),
    ).resolves.toBe(false);
    expect(cacheMock.releaseRefreshLock).toHaveBeenCalledTimes(1);
  });

  it('does no startup DB work when Redis is not configured', async () => {
    cacheMock.isConfigured.mockReturnValue(false);

    await service.onApplicationBootstrap();

    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
  });
});

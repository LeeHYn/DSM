import { Test, TestingModule } from '@nestjs/testing';
import { RankingPeriod } from '@prisma/client';
import { RankingsService } from './rankings.service';
import { PrismaService } from '../prisma/prisma.service';
import { RankingCacheService } from './ranking-cache.service';
import { RankingProjectionService } from './ranking-projection.service';

const makePrismaMock = () => ({
  user: {
    count: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    findMany: jest.fn(),
  },
  dailyScore: {
    findUnique: jest.fn(),
    aggregate: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
    findMany: jest.fn(),
  },
  rankingSnapshot: {
    findFirst: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    findFirstOrThrow: jest.fn(),
  },
});

const makeCacheMock = () => ({
  isConfigured: jest.fn().mockReturnValue(false),
  readMyRanking: jest.fn(),
  readLeaderboard: jest.fn(),
});

const makeProjectionMock = () => ({
  refreshPeriod: jest.fn().mockResolvedValue(false),
  readLeaderboardFromDatabase: jest.fn(),
});

describe('RankingsService', () => {
  let service: RankingsService;
  let prismaMock: ReturnType<typeof makePrismaMock>;
  let cacheMock: ReturnType<typeof makeCacheMock>;
  let projectionMock: ReturnType<typeof makeProjectionMock>;

  beforeEach(async () => {
    prismaMock = makePrismaMock();
    cacheMock = makeCacheMock();
    projectionMock = makeProjectionMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RankingsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: RankingCacheService, useValue: cacheMock },
        { provide: RankingProjectionService, useValue: projectionMock },
      ],
    }).compile();

    service = module.get<RankingsService>(RankingsService);
  });

  describe('getMyRanking', () => {
    it('returns a Redis projection without querying PostgreSQL', async () => {
      const cached = {
        period: RankingPeriod.TOTAL,
        score: 500,
        rank: 10,
        percentile: 20,
        totalUsers: 50,
      };
      cacheMock.isConfigured.mockReturnValue(true);
      cacheMock.readMyRanking.mockResolvedValue(cached);

      await expect(
        service.getMyRanking('user-1', RankingPeriod.TOTAL),
      ).resolves.toEqual(cached);
      expect(projectionMock.refreshPeriod).not.toHaveBeenCalled();
      expect(prismaMock.user.findUniqueOrThrow).not.toHaveBeenCalled();
      expect(prismaMock.user.count).not.toHaveBeenCalled();
    });

    it('publishes one cache-miss projection before using DB fallback', async () => {
      const refreshed = {
        period: RankingPeriod.DAILY,
        score: 117,
        rank: 5,
        percentile: 2.5,
        totalUsers: 200,
      };
      cacheMock.isConfigured.mockReturnValue(true);
      cacheMock.readMyRanking
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(refreshed);
      projectionMock.refreshPeriod.mockResolvedValue(true);

      await expect(
        service.getMyRanking('user-1', RankingPeriod.DAILY),
      ).resolves.toEqual(refreshed);
      expect(projectionMock.refreshPeriod).toHaveBeenCalledTimes(1);
      expect(prismaMock.dailyScore.findUnique).not.toHaveBeenCalled();
      expect(prismaMock.user.count).not.toHaveBeenCalled();
    });

    it('uses the bounded DB path when Redis stays unavailable', async () => {
      cacheMock.isConfigured.mockReturnValue(true);
      cacheMock.readMyRanking.mockResolvedValue(null);
      prismaMock.user.findUniqueOrThrow.mockResolvedValue({ totalScore: 500 });
      prismaMock.user.count.mockResolvedValueOnce(9).mockResolvedValueOnce(50);

      await expect(
        service.getMyRanking('user-1', RankingPeriod.TOTAL),
      ).resolves.toEqual({
        period: RankingPeriod.TOTAL,
        score: 500,
        rank: 10,
        percentile: 20,
        totalUsers: 50,
      });
      expect(projectionMock.refreshPeriod).toHaveBeenCalledTimes(1);
      expect(cacheMock.readMyRanking).toHaveBeenCalledTimes(2);
    });

    it('ranks by cumulative total score', async () => {
      prismaMock.user.findUniqueOrThrow.mockResolvedValue({ totalScore: 500 });
      prismaMock.user.count
        .mockResolvedValueOnce(9) // users with a higher total
        .mockResolvedValueOnce(50); // total users
      prismaMock.user.findMany.mockResolvedValue([]);

      const result = await service.getMyRanking('user-1', RankingPeriod.TOTAL);

      expect(result).toEqual({
        period: RankingPeriod.TOTAL,
        score: 500,
        rank: 10,
        percentile: 20,
        totalUsers: 50,
      });
    });

    it("ranks by today's daily score", async () => {
      prismaMock.dailyScore.findUnique.mockResolvedValue({ cappedScore: 117 });
      prismaMock.dailyScore.count.mockResolvedValue(4);
      prismaMock.user.count.mockResolvedValue(200);

      const result = await service.getMyRanking('user-1', RankingPeriod.DAILY);

      expect(result).toMatchObject({
        score: 117,
        rank: 5,
        percentile: 2.5,
        totalUsers: 200,
      });
    });

    it('keeps one UTC reference across an awaited midnight DB fallback', async () => {
      jest.useFakeTimers();
      try {
        jest.setSystemTime(new Date('2026-09-08T23:59:59.999Z'));
        prismaMock.dailyScore.findUnique.mockImplementation(() => {
          jest.setSystemTime(new Date('2026-09-09T00:00:00.001Z'));
          return Promise.resolve({ cappedScore: 100 });
        });
        prismaMock.dailyScore.count.mockResolvedValue(1);
        prismaMock.user.count.mockResolvedValue(3);

        await service.getMyRanking('user-1', RankingPeriod.DAILY);

        const expectedDay = new Date('2026-09-08T00:00:00.000Z');
        const [scoreInput] = prismaMock.dailyScore.findUnique.mock
          .calls[0] as unknown as [
          { where: { userId_scoreDate: { userId: string; scoreDate: Date } } },
        ];
        const [countInput] = prismaMock.dailyScore.count.mock
          .calls[0] as unknown as [{ where: { scoreDate: Date } }];
        expect(scoreInput.where.userId_scoreDate).toEqual({
          userId: 'user-1',
          scoreDate: expectedDay,
        });
        expect(countInput.where.scoreDate).toEqual(expectedDay);
      } finally {
        jest.useRealTimers();
      }
    });

    it('ranks by the 7-day weekly sum', async () => {
      prismaMock.dailyScore.aggregate.mockResolvedValue({
        _sum: { cappedScore: 420 },
      });
      prismaMock.dailyScore.groupBy.mockResolvedValue([
        { userId: 'a' },
        { userId: 'b' },
      ]);
      prismaMock.user.count.mockResolvedValue(40);

      const result = await service.getMyRanking('user-1', RankingPeriod.WEEKLY);

      expect(result).toMatchObject({ score: 420, rank: 3, totalUsers: 40 });
    });
  });

  describe('getLeaderboard', () => {
    it('returns a Redis leaderboard without querying PostgreSQL', async () => {
      const cached = [
        {
          rank: 1,
          userId: 'u1',
          nickname: 'A',
          tier: 'GOLD',
          profileImageUrl: null,
          score: 900,
        },
      ];
      cacheMock.isConfigured.mockReturnValue(true);
      cacheMock.readLeaderboard.mockResolvedValue(cached);

      await expect(
        service.getLeaderboard(RankingPeriod.TOTAL, 100),
      ).resolves.toEqual(cached);
      expect(projectionMock.refreshPeriod).not.toHaveBeenCalled();
      expect(projectionMock.readLeaderboardFromDatabase).not.toHaveBeenCalled();
      expect(prismaMock.user.findMany).not.toHaveBeenCalled();
    });

    it('uses the shared window projection when Redis is unavailable', async () => {
      const projected = [
        {
          rank: 1,
          userId: 'u1',
          nickname: 'A',
          tier: 'GOLD',
          profileImageUrl: null,
          score: 900,
        },
        {
          rank: 2,
          userId: 'u2',
          nickname: 'B',
          tier: 'SILVER',
          profileImageUrl: null,
          score: 500,
        },
        {
          rank: 2,
          userId: 'u3',
          nickname: 'C',
          tier: 'BRONZE',
          profileImageUrl: null,
          score: 500,
        },
      ];
      projectionMock.readLeaderboardFromDatabase.mockResolvedValue(projected);

      await expect(
        service.getLeaderboard(RankingPeriod.TOTAL, 3),
      ).resolves.toEqual(projected);

      expect(projectionMock.readLeaderboardFromDatabase).toHaveBeenCalledWith(
        RankingPeriod.TOTAL,
        3,
        expect.any(Date),
      );
    });

    it('uses the request reference after a final Redis miss', async () => {
      jest.useFakeTimers();
      try {
        jest.setSystemTime(new Date('2026-09-08T23:59:59.999Z'));
        cacheMock.isConfigured.mockReturnValue(true);
        cacheMock.readLeaderboard.mockResolvedValue(null);
        projectionMock.refreshPeriod.mockImplementation(() => {
          jest.setSystemTime(new Date('2026-09-09T00:00:00.001Z'));
          return Promise.resolve(false);
        });
        projectionMock.readLeaderboardFromDatabase.mockResolvedValue([]);

        await service.getLeaderboard(RankingPeriod.WEEKLY, 100);

        const readCalls = cacheMock.readLeaderboard.mock
          .calls as unknown as Array<[RankingPeriod, number, Date]>;
        const refreshCalls = projectionMock.refreshPeriod.mock
          .calls as unknown as Array<[RankingPeriod, Date]>;
        const fallbackCalls = projectionMock.readLeaderboardFromDatabase.mock
          .calls as unknown as Array<[RankingPeriod, number, Date]>;
        const reference = readCalls[0]?.[2];
        expect(reference).toEqual(new Date('2026-09-08T23:59:59.999Z'));
        expect(readCalls[1]?.[2]).toBe(reference);
        expect(refreshCalls[0]?.[1]).toBe(reference);
        expect(fallbackCalls[0]?.[2]).toBe(reference);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('createSnapshot', () => {
    const existingSnapshot = {
      id: 'rs-1',
      userId: 'user-1',
      period: RankingPeriod.TOTAL,
      rank: 10,
      percentile: 20,
      score: 500,
      snapshotDate: new Date('2026-09-09T00:00:00.000Z'),
      snapshotAt: new Date('2026-09-09T08:30:00.000Z'),
      createdAt: new Date('2026-09-09T08:30:00.000Z'),
    };

    it('returns the existing UTC-day snapshot without ranking work or a write', async () => {
      jest.useFakeTimers();
      try {
        jest.setSystemTime(new Date('2026-09-09T23:59:59.999Z'));
        prismaMock.rankingSnapshot.findFirst.mockResolvedValue(
          existingSnapshot,
        );

        await expect(
          service.createSnapshot('user-1', RankingPeriod.TOTAL),
        ).resolves.toBe(existingSnapshot);

        expect(prismaMock.rankingSnapshot.findFirst).toHaveBeenCalledWith({
          where: {
            userId: 'user-1',
            period: RankingPeriod.TOTAL,
            snapshotDate: new Date('2026-09-09T00:00:00.000Z'),
          },
        });
        expect(prismaMock.user.findUniqueOrThrow).not.toHaveBeenCalled();
        expect(prismaMock.rankingSnapshot.create).not.toHaveBeenCalled();
        expect(prismaMock.rankingSnapshot.createMany).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });

    it("persists the user's first UTC-day snapshot", async () => {
      jest.useFakeTimers();
      try {
        jest.setSystemTime(new Date('2026-09-09T08:30:00.000Z'));
        prismaMock.rankingSnapshot.findFirst.mockResolvedValue(null);
        prismaMock.user.findUniqueOrThrow.mockResolvedValue({
          totalScore: 500,
        });
        prismaMock.user.count
          .mockResolvedValueOnce(9)
          .mockResolvedValueOnce(50);
        prismaMock.rankingSnapshot.createMany.mockResolvedValue({ count: 1 });
        prismaMock.rankingSnapshot.findFirstOrThrow.mockResolvedValue(
          existingSnapshot,
        );

        await expect(
          service.createSnapshot('user-1', RankingPeriod.TOTAL),
        ).resolves.toBe(existingSnapshot);

        expect(prismaMock.rankingSnapshot.createMany).toHaveBeenCalledWith({
          data: [
            {
              userId: 'user-1',
              period: RankingPeriod.TOTAL,
              rank: 10,
              percentile: 20,
              score: 500,
              snapshotDate: new Date('2026-09-09T00:00:00.000Z'),
              snapshotAt: new Date('2026-09-09T08:30:00.000Z'),
            },
          ],
          skipDuplicates: true,
        });
        expect(
          prismaMock.rankingSnapshot.findFirstOrThrow,
        ).toHaveBeenCalledWith({
          where: {
            userId: 'user-1',
            period: RankingPeriod.TOTAL,
            snapshotDate: new Date('2026-09-09T00:00:00.000Z'),
          },
        });
        expect(prismaMock.rankingSnapshot.create).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });

    it('returns the winning row when another request creates the bucket first', async () => {
      prismaMock.rankingSnapshot.findFirst.mockResolvedValue(null);
      prismaMock.user.findUniqueOrThrow.mockResolvedValue({ totalScore: 500 });
      prismaMock.user.count.mockResolvedValueOnce(9).mockResolvedValueOnce(50);
      prismaMock.rankingSnapshot.createMany.mockResolvedValue({ count: 0 });
      prismaMock.rankingSnapshot.findFirstOrThrow.mockResolvedValue(
        existingSnapshot,
      );

      await expect(
        service.createSnapshot('user-1', RankingPeriod.TOTAL),
      ).resolves.toBe(existingSnapshot);
      expect(prismaMock.rankingSnapshot.createMany).toHaveBeenCalledTimes(1);
      expect(prismaMock.rankingSnapshot.findFirstOrThrow).toHaveBeenCalledTimes(
        1,
      );
    });

    it('uses one UTC reference when ranking refresh crosses midnight', async () => {
      jest.useFakeTimers();
      try {
        const beforeMidnight = new Date('2026-09-09T23:59:59.999Z');
        jest.setSystemTime(beforeMidnight);
        prismaMock.rankingSnapshot.findFirst.mockResolvedValue(null);
        cacheMock.isConfigured.mockReturnValue(true);
        cacheMock.readMyRanking
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({
            period: RankingPeriod.WEEKLY,
            score: 500,
            rank: 10,
            percentile: 20,
            totalUsers: 50,
          });
        projectionMock.refreshPeriod.mockImplementation(() => {
          jest.setSystemTime(new Date('2026-09-10T00:00:00.001Z'));
          return Promise.resolve(true);
        });
        prismaMock.rankingSnapshot.createMany.mockResolvedValue({ count: 1 });
        prismaMock.rankingSnapshot.findFirstOrThrow.mockResolvedValue({
          ...existingSnapshot,
          period: RankingPeriod.WEEKLY,
        });

        await service.createSnapshot('user-1', RankingPeriod.WEEKLY);

        const readCalls = cacheMock.readMyRanking.mock
          .calls as unknown as Array<[string, RankingPeriod, Date]>;
        const reference = readCalls[0]?.[2];
        expect(reference).toEqual(beforeMidnight);
        expect(readCalls[1]?.[2]).toBe(reference);
        expect(prismaMock.rankingSnapshot.createMany).toHaveBeenCalledWith(
          expect.objectContaining({
            data: [
              expect.objectContaining({
                snapshotDate: new Date('2026-09-09T00:00:00.000Z'),
                snapshotAt: reference,
              }),
            ],
          }),
        );
      } finally {
        jest.useRealTimers();
      }
    });
  });
});

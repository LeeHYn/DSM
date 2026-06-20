import { Test, TestingModule } from '@nestjs/testing';
import { RankingPeriod } from '@prisma/client';
import { RankingsService } from './rankings.service';
import { PrismaService } from '../prisma/prisma.service';
import { RankingsCacheService } from './rankings-cache.service';

const makePrismaMock = () => ({
  $transaction: jest.fn(
    async <T extends unknown[]>(operations: readonly [...T]): Promise<T> =>
      Promise.all(operations) as Promise<T>,
  ),
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
    create: jest.fn(),
    createMany: jest.fn(),
    deleteMany: jest.fn(),
  },
});

const makeRankingsCacheMock = () => ({
  getLeaderboard: jest.fn(),
  setLeaderboard: jest.fn(),
});

describe('RankingsService', () => {
  let service: RankingsService;
  let prismaMock: ReturnType<typeof makePrismaMock>;
  let rankingsCacheMock: ReturnType<typeof makeRankingsCacheMock>;

  beforeEach(async () => {
    prismaMock = makePrismaMock();
    rankingsCacheMock = makeRankingsCacheMock();
    rankingsCacheMock.getLeaderboard.mockResolvedValue(null);
    rankingsCacheMock.setLeaderboard.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RankingsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: RankingsCacheService, useValue: rankingsCacheMock },
      ],
    }).compile();

    service = module.get<RankingsService>(RankingsService);
  });

  describe('getMyRanking', () => {
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
      expect(rankingsCacheMock.getLeaderboard).not.toHaveBeenCalled();
      expect(rankingsCacheMock.setLeaderboard).not.toHaveBeenCalled();
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
    it('returns a cached leaderboard without querying the database', async () => {
      const cachedLeaderboard = [
        {
          rank: 1,
          userId: 'cached-user',
          nickname: 'Cached',
          tier: 'GOLD',
          profileImageUrl: null,
          score: 777,
        },
      ];
      rankingsCacheMock.getLeaderboard.mockResolvedValueOnce(cachedLeaderboard);

      const result = await service.getLeaderboard(RankingPeriod.TOTAL, 100);

      expect(result).toBe(cachedLeaderboard);
      expect(rankingsCacheMock.getLeaderboard).toHaveBeenCalledWith(
        RankingPeriod.TOTAL,
        100,
      );
      expect(prismaMock.user.findMany).not.toHaveBeenCalled();
      expect(prismaMock.dailyScore.findMany).not.toHaveBeenCalled();
      expect(prismaMock.dailyScore.groupBy).not.toHaveBeenCalled();
      expect(rankingsCacheMock.setLeaderboard).not.toHaveBeenCalled();
    });

    it('returns a ranked total leaderboard', async () => {
      prismaMock.user.findMany.mockResolvedValue([
        {
          id: 'u1',
          nickname: 'A',
          tier: 'GOLD',
          profileImageUrl: null,
          totalScore: 900,
        },
        {
          id: 'u2',
          nickname: 'B',
          tier: 'SILVER',
          profileImageUrl: null,
          totalScore: 500,
        },
      ]);

      const result = await service.getLeaderboard(RankingPeriod.TOTAL, 100);

      expect(result).toEqual([
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
      ]);
      expect(rankingsCacheMock.setLeaderboard).toHaveBeenCalledWith(
        RankingPeriod.TOTAL,
        100,
        result,
      );
    });

    it('joins weekly group sums with user info', async () => {
      prismaMock.dailyScore.groupBy.mockResolvedValue([
        { userId: 'u1', _sum: { cappedScore: 300 } },
        { userId: 'u2', _sum: { cappedScore: 200 } },
      ]);
      prismaMock.user.findMany.mockResolvedValue([
        { id: 'u1', nickname: 'A', tier: 'GOLD', profileImageUrl: null },
        { id: 'u2', nickname: 'B', tier: 'SILVER', profileImageUrl: 'p.png' },
      ]);

      const result = await service.getLeaderboard(RankingPeriod.WEEKLY, 100);

      expect(result).toEqual([
        {
          rank: 1,
          userId: 'u1',
          nickname: 'A',
          tier: 'GOLD',
          profileImageUrl: null,
          score: 300,
        },
        {
          rank: 2,
          userId: 'u2',
          nickname: 'B',
          tier: 'SILVER',
          profileImageUrl: 'p.png',
          score: 200,
        },
      ]);
    });

    it('stores the computed leaderboard when the cache misses', async () => {
      rankingsCacheMock.getLeaderboard.mockResolvedValueOnce(null);
      prismaMock.dailyScore.findMany.mockResolvedValue([
        {
          cappedScore: 117,
          user: {
            id: 'u1',
            nickname: 'A',
            tier: 'SILVER',
            profileImageUrl: null,
          },
        },
      ]);

      const result = await service.getLeaderboard(RankingPeriod.DAILY, 25);

      expect(result).toEqual([
        {
          rank: 1,
          userId: 'u1',
          nickname: 'A',
          tier: 'SILVER',
          profileImageUrl: null,
          score: 117,
        },
      ]);
      expect(rankingsCacheMock.setLeaderboard).toHaveBeenCalledWith(
        RankingPeriod.DAILY,
        25,
        result,
      );
    });
  });

  describe('getFreshLeaderboard', () => {
    it('bypasses stale cached entries, computes from the database, and refreshes the cache', async () => {
      rankingsCacheMock.getLeaderboard.mockResolvedValueOnce([
        {
          rank: 1,
          userId: 'cached-user',
          nickname: 'Cached',
          tier: 'GOLD',
          profileImageUrl: null,
          score: 777,
        },
      ]);
      prismaMock.user.findMany.mockResolvedValue([
        {
          id: 'fresh-user',
          nickname: 'Fresh',
          tier: 'SILVER',
          profileImageUrl: null,
          totalScore: 123,
        },
      ]);

      const result = await service.getFreshLeaderboard(RankingPeriod.TOTAL, 10);

      expect(result).toEqual([
        {
          rank: 1,
          userId: 'fresh-user',
          nickname: 'Fresh',
          tier: 'SILVER',
          profileImageUrl: null,
          score: 123,
        },
      ]);
      expect(rankingsCacheMock.getLeaderboard).not.toHaveBeenCalled();
      expect(prismaMock.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10 }),
      );
      expect(rankingsCacheMock.setLeaderboard).toHaveBeenCalledWith(
        RankingPeriod.TOTAL,
        10,
        result,
      );
    });
  });

  describe('createSnapshot', () => {
    it("persists the user's current standing", async () => {
      prismaMock.user.findUniqueOrThrow.mockResolvedValue({ totalScore: 500 });
      prismaMock.user.count.mockResolvedValueOnce(9).mockResolvedValueOnce(50);
      prismaMock.rankingSnapshot.create.mockResolvedValue({ id: 'rs-1' });

      await service.createSnapshot('user-1', RankingPeriod.TOTAL);

      expect(prismaMock.rankingSnapshot.create).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            userId: 'user-1',
            period: RankingPeriod.TOTAL,
            rank: 10,
            percentile: 20,
            score: 500,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            snapshotAt: expect.any(Date),
          }),
        }),
      );
    });
  });

  describe('createDailySnapshotsForDate', () => {
    it('recreates daily ranking snapshots for the requested score date', async () => {
      const scoreDate = new Date('2026-06-20T00:00:00.000Z');
      prismaMock.dailyScore.findMany.mockResolvedValue([
        { userId: 'u1', cappedScore: 300 },
        { userId: 'u2', cappedScore: 100 },
      ]);
      prismaMock.user.count.mockResolvedValue(4);
      prismaMock.rankingSnapshot.deleteMany.mockResolvedValue({ count: 1 });
      prismaMock.rankingSnapshot.createMany.mockResolvedValue({ count: 2 });

      const result = await service.createDailySnapshotsForDate(scoreDate);

      expect(result).toBe(2);
      expect(prismaMock.dailyScore.findMany).toHaveBeenCalledWith({
        where: { scoreDate },
        orderBy: { cappedScore: 'desc' },
        select: { userId: true, cappedScore: true },
      });
      expect(prismaMock.rankingSnapshot.deleteMany).toHaveBeenCalledWith({
        where: { period: RankingPeriod.DAILY, snapshotAt: scoreDate },
      });
      expect(prismaMock.rankingSnapshot.createMany).toHaveBeenCalledWith({
        data: [
          {
            userId: 'u1',
            period: RankingPeriod.DAILY,
            score: 300,
            rank: 1,
            percentile: 25,
            snapshotAt: scoreDate,
          },
          {
            userId: 'u2',
            period: RankingPeriod.DAILY,
            score: 100,
            rank: 2,
            percentile: 50,
            snapshotAt: scoreDate,
          },
        ],
        skipDuplicates: true,
      });
      expect(
        prismaMock.rankingSnapshot.deleteMany.mock.invocationCallOrder[0],
      ).toBeLessThan(
        prismaMock.rankingSnapshot.createMany.mock.invocationCallOrder[0],
      );
    });

    it('deletes existing daily snapshots and skips createMany when no daily scores exist', async () => {
      const scoreDate = new Date('2026-06-20T00:00:00.000Z');
      prismaMock.dailyScore.findMany.mockResolvedValue([]);
      prismaMock.user.count.mockResolvedValue(4);
      prismaMock.rankingSnapshot.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.createDailySnapshotsForDate(scoreDate);

      expect(result).toBe(0);
      expect(prismaMock.rankingSnapshot.deleteMany).toHaveBeenCalledWith({
        where: { period: RankingPeriod.DAILY, snapshotAt: scoreDate },
      });
      expect(prismaMock.rankingSnapshot.createMany).not.toHaveBeenCalled();
    });

    it('uses competition ranking for tied daily scores', async () => {
      const scoreDate = new Date('2026-06-20T00:00:00.000Z');
      prismaMock.dailyScore.findMany.mockResolvedValue([
        { userId: 'u1', cappedScore: 300 },
        { userId: 'u2', cappedScore: 300 },
        { userId: 'u3', cappedScore: 100 },
      ]);
      prismaMock.user.count.mockResolvedValue(4);
      prismaMock.rankingSnapshot.deleteMany.mockResolvedValue({ count: 0 });
      prismaMock.rankingSnapshot.createMany.mockResolvedValue({ count: 3 });

      await service.createDailySnapshotsForDate(scoreDate);

      expect(prismaMock.rankingSnapshot.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({
              userId: 'u1',
              rank: 1,
              percentile: 25,
            }) as unknown,
            expect.objectContaining({
              userId: 'u2',
              rank: 1,
              percentile: 25,
            }) as unknown,
            expect.objectContaining({
              userId: 'u3',
              rank: 3,
              percentile: 75,
            }) as unknown,
          ]) as unknown,
          skipDuplicates: true,
        }),
      );
    });

    it('uses skipDuplicates to avoid duplicate rows during concurrent snapshot recreation', async () => {
      const scoreDate = new Date('2026-06-20T00:00:00.000Z');
      prismaMock.dailyScore.findMany.mockResolvedValue([
        { userId: 'u1', cappedScore: 300 },
      ]);
      prismaMock.user.count.mockResolvedValue(1);
      prismaMock.rankingSnapshot.deleteMany.mockResolvedValue({ count: 0 });
      prismaMock.rankingSnapshot.createMany.mockResolvedValue({ count: 0 });

      await service.createDailySnapshotsForDate(scoreDate);

      expect(prismaMock.rankingSnapshot.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skipDuplicates: true,
        }),
      );
    });
  });
});

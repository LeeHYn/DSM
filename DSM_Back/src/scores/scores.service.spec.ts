import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ScoresService } from './scores.service';
import { PrismaService } from '../prisma/prisma.service';
import { REALTIME_EVENTS } from '../realtime/realtime-events';
import { RankingsCacheService } from '../rankings/rankings-cache.service';

const makePrismaMock = () => ({
  task: { findMany: jest.fn() },
  dailyScore: {
    upsert: jest.fn(),
    findUnique: jest.fn(),
    aggregate: jest.fn(),
  },
  user: { update: jest.fn(), findUniqueOrThrow: jest.fn() },
});

describe('ScoresService', () => {
  let service: ScoresService;
  let prismaMock: ReturnType<typeof makePrismaMock>;
  let eventsMock: { emit: jest.Mock };
  let rankingsCacheMock: { invalidateAllLeaderboards: jest.Mock };

  beforeEach(async () => {
    prismaMock = makePrismaMock();
    eventsMock = { emit: jest.fn() };
    rankingsCacheMock = {
      invalidateAllLeaderboards: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScoresService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: EventEmitter2, useValue: eventsMock },
        { provide: RankingsCacheService, useValue: rankingsCacheMock },
      ],
    }).compile();

    service = module.get<ScoresService>(ScoresService);
  });

  describe('recompute', () => {
    it('computes the daily score and refreshes total/tier', async () => {
      prismaMock.task.findMany.mockResolvedValue([
        { status: 'COMPLETED', difficulty: 'MEDIUM' },
        { status: 'COMPLETED', difficulty: 'MEDIUM' },
        { status: 'COMPLETED', difficulty: 'MEDIUM' },
        { status: 'COMPLETED', difficulty: 'HIGH' },
        { status: 'PENDING', difficulty: 'LOW' },
      ]);
      prismaMock.dailyScore.upsert.mockResolvedValue({ id: 'ds-1' });
      prismaMock.dailyScore.aggregate.mockResolvedValue({
        _sum: { cappedScore: 3500 },
      });
      prismaMock.user.update.mockResolvedValue({});

      await service.recompute('user-1', '2026-06-03');

      expect(prismaMock.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          where: expect.objectContaining({ userId: 'user-1', deletedAt: null }),
        }),
      );
      expect(prismaMock.dailyScore.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          create: expect.objectContaining({
            userId: 'user-1',
            registeredTaskCount: 5,
            completedTaskCount: 4,
            rawScore: 90,
            adjustedScore: 117,
            cappedScore: 117,
            achievementRate: 80,
          }),
        }),
      );
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { totalScore: 3500, tier: 'GOLD' },
      });
      expect(rankingsCacheMock.invalidateAllLeaderboards).toHaveBeenCalledTimes(
        1,
      );
      expect(eventsMock.emit).toHaveBeenCalledWith(
        REALTIME_EVENTS.SCORE_RECOMPUTED,
        {
          userId: 'user-1',
          dailyScore: { id: 'ds-1' },
          scoreDate: new Date('2026-06-03T00:00:00.000Z'),
        },
      );
    });

    it('awaits leaderboard cache invalidation before emitting score recomputed', async () => {
      let invalidationResolved = false;
      rankingsCacheMock.invalidateAllLeaderboards.mockImplementation(
        async () => {
          await Promise.resolve();
          invalidationResolved = true;
        },
      );
      eventsMock.emit.mockImplementation(() => {
        expect(invalidationResolved).toBe(true);
        return true;
      });
      prismaMock.task.findMany.mockResolvedValue([]);
      prismaMock.dailyScore.upsert.mockResolvedValue({ id: 'ds-1' });
      prismaMock.dailyScore.aggregate.mockResolvedValue({
        _sum: { cappedScore: 0 },
      });
      prismaMock.user.update.mockResolvedValue({});

      await service.recompute('user-1', '2026-06-03');

      expect(
        rankingsCacheMock.invalidateAllLeaderboards.mock.invocationCallOrder[0],
      ).toBeLessThan(eventsMock.emit.mock.invocationCallOrder[0]);
    });

    it('does not reject recompute when leaderboard cache invalidation fails', async () => {
      rankingsCacheMock.invalidateAllLeaderboards.mockRejectedValueOnce(
        new Error('redis unavailable'),
      );
      prismaMock.task.findMany.mockResolvedValue([]);
      prismaMock.dailyScore.upsert.mockResolvedValue({ id: 'ds-1' });
      prismaMock.dailyScore.aggregate.mockResolvedValue({
        _sum: { cappedScore: 0 },
      });
      prismaMock.user.update.mockResolvedValue({});

      await expect(service.recompute('user-1', '2026-06-03')).resolves.toEqual({
        id: 'ds-1',
      });
      expect(eventsMock.emit).toHaveBeenCalledWith(
        REALTIME_EVENTS.SCORE_RECOMPUTED,
        {
          userId: 'user-1',
          dailyScore: { id: 'ds-1' },
          scoreDate: new Date('2026-06-03T00:00:00.000Z'),
        },
      );
    });

    it('caps the stored score at the daily limit', async () => {
      prismaMock.task.findMany.mockResolvedValue(
        Array.from({ length: 40 }, () => ({
          status: 'COMPLETED',
          difficulty: 'HIGH',
        })),
      );
      prismaMock.dailyScore.upsert.mockResolvedValue({ id: 'ds-1' });
      prismaMock.dailyScore.aggregate.mockResolvedValue({
        _sum: { cappedScore: 900 },
      });
      prismaMock.user.update.mockResolvedValue({});

      await service.recompute('user-1', new Date('2026-06-03T10:00:00Z'));

      expect(prismaMock.dailyScore.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          create: expect.objectContaining({ rawScore: 1200, cappedScore: 900 }),
        }),
      );
    });

    it('treats an empty day as a zero score', async () => {
      prismaMock.task.findMany.mockResolvedValue([]);
      prismaMock.dailyScore.upsert.mockResolvedValue({ id: 'ds-1' });
      prismaMock.dailyScore.aggregate.mockResolvedValue({
        _sum: { cappedScore: null },
      });
      prismaMock.user.update.mockResolvedValue({});

      await service.recompute('user-1', '2026-06-03');

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { totalScore: 0, tier: 'BRONZE' },
      });
    });
  });

  describe('getDaily', () => {
    it('returns the stored score for the day', async () => {
      prismaMock.dailyScore.findUnique.mockResolvedValue({ id: 'ds-1' });

      const result = await service.getDaily('user-1', '2026-06-03');

      expect(result).toEqual({ id: 'ds-1' });
      expect(prismaMock.dailyScore.findUnique).toHaveBeenCalledTimes(1);
    });
  });

  describe('getSummary', () => {
    it('returns the user total and tier', async () => {
      prismaMock.user.findUniqueOrThrow.mockResolvedValue({
        totalScore: 3500,
        tier: 'GOLD',
      });

      const result = await service.getSummary('user-1');

      expect(result).toEqual({ totalScore: 3500, tier: 'GOLD' });
    });
  });
});

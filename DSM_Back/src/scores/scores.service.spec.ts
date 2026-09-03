import { Test, TestingModule } from '@nestjs/testing';
import { type Prisma } from '@prisma/client';
import { ScoresService } from './scores.service';
import { PrismaService } from '../prisma/prisma.service';

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

  beforeEach(async () => {
    prismaMock = makePrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScoresService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<ScoresService>(ScoresService);
  });

  describe('recompute', () => {
    it('computes the daily score and refreshes total/tier', async () => {
      prismaMock.task.findMany.mockResolvedValue([
        {
          status: 'COMPLETED',
          difficulty: 'MEDIUM',
          completedAt: new Date('2026-06-03T01:00:00.000Z'),
        },
        {
          status: 'COMPLETED',
          difficulty: 'MEDIUM',
          completedAt: new Date('2026-06-03T02:00:00.000Z'),
        },
        {
          status: 'COMPLETED',
          difficulty: 'MEDIUM',
          completedAt: new Date('2026-06-03T03:00:00.000Z'),
        },
        {
          status: 'COMPLETED',
          difficulty: 'HIGH',
          completedAt: new Date('2026-06-03T04:00:00.000Z'),
        },
        { status: 'PENDING', difficulty: 'LOW', completedAt: null },
      ]);
      prismaMock.dailyScore.upsert.mockResolvedValue({ id: 'ds-1' });
      prismaMock.dailyScore.aggregate.mockResolvedValue({
        _sum: { cappedScore: 3500 },
      });
      prismaMock.user.update.mockResolvedValue({});

      await service.recompute('user-1', '2026-06-03');

      expect(prismaMock.task.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          deletedAt: null,
          startAt: {
            gte: new Date('2026-06-03T00:00:00.000Z'),
            lt: new Date('2026-06-04T00:00:00.000Z'),
          },
        },
        select: {
          status: true,
          difficulty: true,
          completedAt: true,
        },
      });
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
    });

    it('caps the stored score at the daily limit', async () => {
      prismaMock.task.findMany.mockResolvedValue(
        Array.from({ length: 40 }, () => ({
          status: 'COMPLETED',
          difficulty: 'HIGH',
          completedAt: new Date('2026-06-03T12:00:00.000Z'),
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

    it.each([
      {
        label: 'completion at dayStart',
        completedAt: new Date('2026-06-03T00:00:00.000Z'),
        completedTaskCount: 1,
        rawScore: 10,
        adjustedScore: 15,
        achievementRate: 100,
      },
      {
        label: 'completion exactly at nextDay',
        completedAt: new Date('2026-06-04T00:00:00.000Z'),
        completedTaskCount: 0,
        rawScore: 0,
        adjustedScore: 0,
        achievementRate: 0,
      },
      {
        label: 'late completion after the scheduled day',
        completedAt: new Date('2026-06-04T12:00:00.000Z'),
        completedTaskCount: 0,
        rawScore: 0,
        adjustedScore: 0,
        achievementRate: 0,
      },
      {
        label: 'early completion before the scheduled day',
        completedAt: new Date('2026-06-02T23:59:59.999Z'),
        completedTaskCount: 0,
        rawScore: 0,
        adjustedScore: 0,
        achievementRate: 0,
      },
      {
        label: 'legacy completion without a timestamp',
        completedAt: null,
        completedTaskCount: 0,
        rawScore: 0,
        adjustedScore: 0,
        achievementRate: 0,
      },
    ])(
      'keeps the registered denominator for $label',
      async ({
        completedAt,
        completedTaskCount,
        rawScore,
        adjustedScore,
        achievementRate,
      }) => {
        prismaMock.task.findMany.mockResolvedValue([
          { status: 'COMPLETED', difficulty: 'LOW', completedAt },
        ]);
        prismaMock.dailyScore.upsert.mockResolvedValue({ id: 'ds-boundary' });
        prismaMock.dailyScore.aggregate.mockResolvedValue({
          _sum: { cappedScore: adjustedScore },
        });
        prismaMock.user.update.mockResolvedValue({});

        await service.recompute('user-1', '2026-06-03');

        expect(prismaMock.dailyScore.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            create: expect.objectContaining({
              registeredTaskCount: 1,
              completedTaskCount,
              rawScore,
              adjustedScore,
              achievementRate,
            }),
          }),
        );
      },
    );

    it('routes every recompute query through the supplied transaction client', async () => {
      const transactionMock = makePrismaMock();
      transactionMock.task.findMany.mockResolvedValue([
        {
          status: 'COMPLETED',
          difficulty: 'LOW',
          completedAt: new Date('2026-06-03T12:00:00.000Z'),
        },
      ]);
      transactionMock.dailyScore.upsert.mockResolvedValue({ id: 'ds-tx' });
      transactionMock.dailyScore.aggregate.mockResolvedValue({
        _sum: { cappedScore: 15 },
      });
      transactionMock.user.update.mockResolvedValue({});

      const result = await service.recompute(
        'user-1',
        '2026-06-03',
        transactionMock as unknown as Prisma.TransactionClient,
      );

      expect(result).toEqual({ id: 'ds-tx' });
      expect(transactionMock.task.findMany).toHaveBeenCalledTimes(1);
      expect(transactionMock.dailyScore.upsert).toHaveBeenCalledTimes(1);
      expect(transactionMock.dailyScore.aggregate).toHaveBeenCalledTimes(1);
      expect(transactionMock.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { totalScore: 15, tier: 'BRONZE' },
      });
      expect(prismaMock.task.findMany).not.toHaveBeenCalled();
      expect(prismaMock.dailyScore.upsert).not.toHaveBeenCalled();
      expect(prismaMock.dailyScore.aggregate).not.toHaveBeenCalled();
      expect(prismaMock.user.update).not.toHaveBeenCalled();
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

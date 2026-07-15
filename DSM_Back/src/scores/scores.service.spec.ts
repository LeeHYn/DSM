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

    it('routes every recompute query through the supplied transaction client', async () => {
      const transactionMock = makePrismaMock();
      transactionMock.task.findMany.mockResolvedValue([
        { status: 'COMPLETED', difficulty: 'LOW' },
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

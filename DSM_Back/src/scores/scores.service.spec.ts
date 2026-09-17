import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ScoresService } from './scores.service';
import { PrismaService } from '../prisma/prisma.service';

const makePrismaMock = () => ({
  task: { findMany: jest.fn() },
  dailyScore: {
    upsert: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    aggregate: jest.fn(),
  },
  user: { update: jest.fn(), findUniqueOrThrow: jest.fn() },
  $queryRaw: jest.fn().mockResolvedValue([]),
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

  describe.each([
    '0099-12-31T12:34:56.789Z',
    new Date('0099-12-31T12:34:56.789Z'),
  ])('year 0099 UTC normalization for %p', (reference) => {
    it('queries the original year without changing the input Date', async () => {
      const original = new Date(reference).getTime();
      await service.getDaily('user-1', reference);

      expect(prismaMock.dailyScore.findUnique).toHaveBeenCalledWith({
        where: {
          userId_scoreDate: {
            userId: 'user-1',
            scoreDate: new Date('0099-12-31T00:00:00.000Z'),
          },
        },
      });
      expect(new Date(reference).getTime()).toBe(original);
    });

    it('recomputes completion eligibility and the next day in the original year', async () => {
      const original = new Date(reference).getTime();
      prismaMock.task.findMany.mockResolvedValue([
        {
          status: 'COMPLETED',
          difficulty: 'LOW',
          completedAt: new Date('0099-12-31T23:59:59.999Z'),
        },
      ]);
      prismaMock.dailyScore.upsert.mockResolvedValue({ id: 'year-0099' });
      prismaMock.dailyScore.aggregate.mockResolvedValue({
        _sum: { cappedScore: 15 },
      });

      await service.recompute('user-1', reference);

      const [read] = prismaMock.task.findMany.mock.calls[0] as [
        {
          where: { startAt: { gte: Date; lt: Date } };
        },
      ];
      expect(read.where.startAt).toEqual({
        gte: new Date('0099-12-31T00:00:00.000Z'),
        lt: new Date('0100-01-01T00:00:00.000Z'),
      });
      const [write] = prismaMock.dailyScore.upsert.mock.calls[0] as [
        {
          create: {
            scoreDate: Date;
            completedTaskCount: number;
            cappedScore: number;
          };
        },
      ];
      expect(write.create.scoreDate.toISOString()).toBe(
        '0099-12-31T00:00:00.000Z',
      );
      expect(write.create.completedTaskCount).toBe(1);
      expect(write.create.cappedScore).toBe(15);
      expect(new Date(reference).getTime()).toBe(original);
    });
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

  describe.each(['getCalendar', 'getCategoryStatistics'] as const)(
    '%s range validation',
    (method) => {
      it.each([
        ['2026-02-29', '2026-03-01'],
        ['1900-02-29', '1900-03-01'],
        ['2026-04-31', '2026-05-01'],
        ['2026-00-01', '2026-01-01'],
        ['2026-13-01', '2026-12-01'],
        ['2026-01-00', '2026-01-01'],
        ['2026-1-01', '2026-01-01'],
        ['2026-01-01T00:00:00Z', '2026-01-01'],
        ['2026-01-01', '2026-02-12'],
        ['2026-01-02', '2026-01-01'],
        ['2026-01-01', 'invalid'],
        ['0000-01-01', '0000-01-01'],
      ])('rejects %s through %s before querying', async (from, to) => {
        await expect(
          service[method]('user-1', from, to),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(prismaMock.dailyScore.findMany).not.toHaveBeenCalled();
        expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
      });

      it.each([
        ['2026-01-01', '2026-02-11'],
        ['2000-02-29', '2000-02-29'],
        ['0099-12-31', '0100-01-01'],
      ])('accepts %s through %s', async (from, to) => {
        await expect(
          service[method]('user-1', from, to),
        ).resolves.toMatchObject({
          userId: 'user-1',
          from,
          to,
        });
      });
    },
  );

  describe('getCalendar', () => {
    it('fills the requested leap-day range and converts stored decimal rates', async () => {
      prismaMock.dailyScore.findMany.mockResolvedValue([
        {
          scoreDate: new Date('2028-02-29T00:00:00.000Z'),
          registeredTaskCount: 3,
          completedTaskCount: 2,
          achievementRate: new Prisma.Decimal('66.67'),
          cappedScore: 50,
        },
      ]);

      const result = await service.getCalendar(
        'user-1',
        '2028-02-28',
        '2028-03-01',
      );

      expect(result).toEqual({
        userId: 'user-1',
        from: '2028-02-28',
        to: '2028-03-01',
        days: [
          {
            date: '2028-02-28',
            registeredTaskCount: 0,
            completedTaskCount: 0,
            achievementRate: 0,
            cappedScore: 0,
          },
          {
            date: '2028-02-29',
            registeredTaskCount: 3,
            completedTaskCount: 2,
            achievementRate: 66.67,
            cappedScore: 50,
          },
          {
            date: '2028-03-01',
            registeredTaskCount: 0,
            completedTaskCount: 0,
            achievementRate: 0,
            cappedScore: 0,
          },
        ],
      });
      expect(prismaMock.dailyScore.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          scoreDate: {
            gte: new Date('2028-02-28T00:00:00.000Z'),
            lt: new Date('2028-03-02T00:00:00.000Z'),
          },
        },
        orderBy: { scoreDate: 'asc' },
        take: 42,
        select: {
          scoreDate: true,
          registeredTaskCount: true,
          completedTaskCount: true,
          achievementRate: true,
          cappedScore: true,
        },
      });
      expect(prismaMock.task.findMany).not.toHaveBeenCalled();
    });

    it('returns exactly 42 ordered days with no stored scores', async () => {
      const result = await service.getCalendar(
        'user-1',
        '2026-01-01',
        '2026-02-11',
      );
      expect(result.days).toHaveLength(42);
      expect(result.days[0].date).toBe('2026-01-01');
      expect(result.days[41].date).toBe('2026-02-11');
      expect(result.days.every((day) => day.registeredTaskCount === 0)).toBe(
        true,
      );
    });

    it('keeps year 99 in range bounds and returned dates', async () => {
      const result = await service.getCalendar(
        'user-1',
        '0099-12-31',
        '0100-01-01',
      );
      expect(result.days.map((day) => day.date)).toEqual([
        '0099-12-31',
        '0100-01-01',
      ]);
      expect(prismaMock.dailyScore.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 'user-1',
            scoreDate: {
              gte: new Date('0099-12-31T00:00:00.000Z'),
              lt: new Date('0100-01-02T00:00:00.000Z'),
            },
          },
        }),
      );
    });
  });

  describe('getCategoryStatistics', () => {
    it('returns category and unclassified buckets with uncapped raw scores', async () => {
      prismaMock.$queryRaw.mockResolvedValue([
        {
          categoryId: 'cat-1',
          name: 'Work',
          color: '#112233',
          registeredTaskCount: 60,
          completedTaskCount: 40,
          rawScore: 1200,
        },
        {
          categoryId: null,
          name: null,
          color: null,
          registeredTaskCount: 1,
          completedTaskCount: 0,
          rawScore: 0,
        },
      ]);

      const result = await service.getCategoryStatistics(
        'user-1',
        '2026-01-01',
        '2026-01-02',
      );
      expect(result).toEqual({
        userId: 'user-1',
        from: '2026-01-01',
        to: '2026-01-02',
        categories: [
          {
            categoryId: 'cat-1',
            name: 'Work',
            color: '#112233',
            registeredTaskCount: 60,
            completedTaskCount: 40,
            achievementRate: 66.67,
            rawScore: 1200,
          },
          {
            categoryId: null,
            name: '미분류',
            color: '#888888',
            registeredTaskCount: 1,
            completedTaskCount: 0,
            achievementRate: 0,
            rawScore: 0,
          },
        ],
      });
      expect(prismaMock.task.findMany).not.toHaveBeenCalled();
    });

    it('binds owner and UTC range and aggregates only qualifying completions in SQL', async () => {
      await service.getCategoryStatistics('user-1', '2026-01-01', '2026-01-02');
      const [parts, ...values] = prismaMock.$queryRaw.mock.calls[0] as [
        TemplateStringsArray,
        ...unknown[],
      ];
      const sql = parts.join('?').replace(/\s+/g, ' ').trim();
      expect(values).toEqual([
        10,
        20,
        30,
        'user-1',
        new Date('2026-01-01T00:00:00.000Z'),
        new Date('2026-01-03T00:00:00.000Z'),
      ]);
      expect(sql).toContain('t."userId" = ? AND t."deletedAt" IS NULL');
      expect(sql).toContain('t."startAt" >= ? AND t."startAt" < ?');
      expect(sql).toContain("t.status = 'COMPLETED'");
      expect(sql).toContain(
        '(t."completedAt" AT TIME ZONE \'UTC\')::date = (t."startAt" AT TIME ZONE \'UTC\')::date',
      );
      expect(sql).toContain('COUNT(*)');
      expect(sql).toContain('GROUP BY c.id, c.name, c.color');
      expect(sql).toContain('c."userId" = t."userId" OR c."isDefault" = true');
      expect(sql).toContain(
        "WHEN 'LOW' THEN ? WHEN 'MEDIUM' THEN ? WHEN 'HIGH' THEN ?",
      );
      expect(prismaMock.task.findMany).not.toHaveBeenCalled();
    });
  });
});

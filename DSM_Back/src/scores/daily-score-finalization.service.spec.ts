import { Test, TestingModule } from '@nestjs/testing';
import { DailyScoreFinalizationService } from './daily-score-finalization.service';
import { PrismaService } from '../prisma/prisma.service';
import { ScoresService } from './scores.service';
import { RankingsService } from '../rankings/rankings.service';

const makePrismaMock = () => ({
  task: {
    findMany: jest.fn(),
  },
});

const makeScoresMock = () => ({
  recompute: jest.fn(),
});

const makeRankingsMock = () => ({
  createDailySnapshotsForDate: jest.fn(),
});

describe('DailyScoreFinalizationService', () => {
  let service: DailyScoreFinalizationService;
  let prismaMock: ReturnType<typeof makePrismaMock>;
  let scoresMock: ReturnType<typeof makeScoresMock>;
  let rankingsMock: ReturnType<typeof makeRankingsMock>;

  beforeEach(async () => {
    prismaMock = makePrismaMock();
    scoresMock = makeScoresMock();
    rankingsMock = makeRankingsMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DailyScoreFinalizationService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ScoresService, useValue: scoresMock },
        { provide: RankingsService, useValue: rankingsMock },
      ],
    }).compile();

    service = module.get<DailyScoreFinalizationService>(
      DailyScoreFinalizationService,
    );
  });

  it('finalizes the previous UTC day by recomputing active task owners and recreating daily snapshots', async () => {
    const now = new Date('2026-06-21T12:30:00.000Z');
    const scoreDate = new Date('2026-06-20T00:00:00.000Z');
    const nextDay = new Date('2026-06-21T00:00:00.000Z');
    prismaMock.task.findMany.mockResolvedValue([
      { userId: 'user-1' },
      { userId: 'user-2' },
    ]);
    scoresMock.recompute.mockResolvedValue({ id: 'score-1' });
    rankingsMock.createDailySnapshotsForDate.mockResolvedValue(2);

    const result = await service.finalizePreviousUtcDay(now);

    expect(result).toEqual({
      scoreDate,
      usersRecomputed: 2,
      snapshotsCreated: 2,
    });
    expect(prismaMock.task.findMany).toHaveBeenCalledWith({
      where: {
        startAt: { gte: scoreDate, lt: nextDay },
        deletedAt: null,
      },
      distinct: ['userId'],
      select: { userId: true },
    });
    expect(scoresMock.recompute).toHaveBeenNthCalledWith(
      1,
      'user-1',
      scoreDate,
    );
    expect(scoresMock.recompute).toHaveBeenNthCalledWith(
      2,
      'user-2',
      scoreDate,
    );
    expect(rankingsMock.createDailySnapshotsForDate).toHaveBeenCalledWith(
      scoreDate,
    );
  });

  it('normalizes an arbitrary date to that UTC day before finalizing', async () => {
    const scoreDate = new Date('2026-06-20T00:00:00.000Z');
    prismaMock.task.findMany.mockResolvedValue([]);
    rankingsMock.createDailySnapshotsForDate.mockResolvedValue(0);

    const result = await service.finalizeUtcDay(
      new Date('2026-06-20T18:45:00.000Z'),
    );

    expect(result).toEqual({
      scoreDate,
      usersRecomputed: 0,
      snapshotsCreated: 0,
    });
    expect(scoresMock.recompute).not.toHaveBeenCalled();
    expect(rankingsMock.createDailySnapshotsForDate).toHaveBeenCalledWith(
      scoreDate,
    );
  });
});

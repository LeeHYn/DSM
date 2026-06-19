import { Test, TestingModule } from '@nestjs/testing';
import { RankingPeriod } from '@prisma/client';
import { NOTIFICATION_EVENTS } from '../notifications/notification-events';
import { RankingGateway } from './ranking.gateway';
import { RankingRealtimeService } from './ranking-realtime.service';
import { REALTIME_EVENTS } from './realtime-events';
import { RankingsService } from '../rankings/rankings.service';

const makeGatewayMock = () => ({
  emitToUser: jest.fn(),
  emitToRankingPeriod: jest.fn(),
});

const makeRankingsMock = () => ({
  getMyRanking: jest.fn(),
  getLeaderboard: jest.fn(),
});

describe('RankingRealtimeService', () => {
  let service: RankingRealtimeService;
  let gatewayMock: ReturnType<typeof makeGatewayMock>;
  let rankingsMock: ReturnType<typeof makeRankingsMock>;

  beforeEach(async () => {
    gatewayMock = makeGatewayMock();
    rankingsMock = makeRankingsMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RankingRealtimeService,
        { provide: RankingGateway, useValue: gatewayMock },
        { provide: RankingsService, useValue: rankingsMock },
      ],
    }).compile();

    service = module.get<RankingRealtimeService>(RankingRealtimeService);
  });

  it('emits score.updated to the recomputed user room', async () => {
    await service.handleScoreRecomputed({
      userId: 'user-1',
      dailyScore: { cappedScore: 180 },
      scoreDate: new Date('2026-06-20T00:00:00.000Z'),
    });

    expect(gatewayMock.emitToUser).toHaveBeenCalledWith(
      'user-1',
      REALTIME_EVENTS.SCORE_UPDATED,
      {
        userId: 'user-1',
        dailyScore: { cappedScore: 180 },
        scoreDate: '2026-06-20T00:00:00.000Z',
      },
    );
  });

  it('emits ranking.updated with current rankings for every period', async () => {
    rankingsMock.getMyRanking
      .mockResolvedValueOnce({ period: RankingPeriod.DAILY, rank: 3 })
      .mockResolvedValueOnce({ period: RankingPeriod.WEEKLY, rank: 7 })
      .mockResolvedValueOnce({ period: RankingPeriod.TOTAL, rank: 11 });

    await service.handleScoreRecomputed({ userId: 'user-1' });

    expect(rankingsMock.getMyRanking).toHaveBeenCalledTimes(3);
    expect(rankingsMock.getMyRanking).toHaveBeenNthCalledWith(
      1,
      'user-1',
      RankingPeriod.DAILY,
    );
    expect(gatewayMock.emitToUser).toHaveBeenCalledWith(
      'user-1',
      REALTIME_EVENTS.RANKING_UPDATED,
      {
        userId: 'user-1',
        rankings: [
          { period: RankingPeriod.DAILY, rank: 3 },
          { period: RankingPeriod.WEEKLY, rank: 7 },
          { period: RankingPeriod.TOTAL, rank: 11 },
        ],
      },
    );
  });

  it('emits leaderboard.updated to each subscribed period room', async () => {
    rankingsMock.getMyRanking.mockResolvedValue({ rank: 1 });
    rankingsMock.getLeaderboard
      .mockResolvedValueOnce([{ userId: 'daily-leader' }])
      .mockResolvedValueOnce([{ userId: 'weekly-leader' }])
      .mockResolvedValueOnce([{ userId: 'total-leader' }]);

    await service.handleScoreRecomputed({ userId: 'user-1' });

    expect(rankingsMock.getLeaderboard).toHaveBeenCalledTimes(3);
    expect(gatewayMock.emitToRankingPeriod).toHaveBeenCalledWith(
      RankingPeriod.DAILY,
      REALTIME_EVENTS.LEADERBOARD_UPDATED,
      {
        period: RankingPeriod.DAILY,
        leaderboard: [{ userId: 'daily-leader' }],
      },
    );
    expect(gatewayMock.emitToRankingPeriod).toHaveBeenCalledWith(
      RankingPeriod.WEEKLY,
      REALTIME_EVENTS.LEADERBOARD_UPDATED,
      {
        period: RankingPeriod.WEEKLY,
        leaderboard: [{ userId: 'weekly-leader' }],
      },
    );
    expect(gatewayMock.emitToRankingPeriod).toHaveBeenCalledWith(
      RankingPeriod.TOTAL,
      REALTIME_EVENTS.LEADERBOARD_UPDATED,
      {
        period: RankingPeriod.TOTAL,
        leaderboard: [{ userId: 'total-leader' }],
      },
    );
  });

  it('does not reject when ranking recomputation fails', async () => {
    rankingsMock.getMyRanking.mockRejectedValue(new Error('DB unavailable'));

    await expect(
      service.handleScoreRecomputed({ userId: 'user-1' }),
    ).resolves.toBeUndefined();
    expect(gatewayMock.emitToUser).toHaveBeenCalledWith(
      'user-1',
      REALTIME_EVENTS.SCORE_UPDATED,
      {
        userId: 'user-1',
        dailyScore: undefined,
        scoreDate: undefined,
      },
    );
  });

  it('forwards notification.due events to the user room', () => {
    service.handleNotificationDue({
      userId: 'user-1',
      taskId: 'task-1',
      scheduleId: 'schedule-1',
      scheduledAt: '2026-06-20T06:00:00.000Z',
      task: { id: 'task-1', title: 'Morning run' },
    });

    expect(gatewayMock.emitToUser).toHaveBeenCalledWith(
      'user-1',
      NOTIFICATION_EVENTS.DUE,
      {
        userId: 'user-1',
        taskId: 'task-1',
        scheduleId: 'schedule-1',
        scheduledAt: '2026-06-20T06:00:00.000Z',
        task: { id: 'task-1', title: 'Morning run' },
      },
    );
  });
});

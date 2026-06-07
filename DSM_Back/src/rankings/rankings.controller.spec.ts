import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RankingPeriod } from '@prisma/client';
import { RankingsController } from './rankings.controller';
import { RankingsService } from './rankings.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

const MY_RANKING = {
  period: RankingPeriod.TOTAL,
  score: 500,
  rank: 10,
  percentile: 20,
  totalUsers: 50,
};

const LEADERBOARD = [
  {
    rank: 1,
    userId: 'u1',
    nickname: 'A',
    tier: 'GOLD',
    profileImageUrl: null,
    score: 900,
  },
];

const makeServiceMock = () => ({
  getMyRanking: jest.fn().mockResolvedValue(MY_RANKING),
  getLeaderboard: jest.fn().mockResolvedValue(LEADERBOARD),
  createSnapshot: jest.fn().mockResolvedValue({ id: 'rs-1' }),
});

const makeAuthRequest = (userId = 'user-uuid-1') =>
  ({ user: { sub: userId, type: 'access' } }) as never;

describe('RankingsController', () => {
  let controller: RankingsController;
  let serviceMock: ReturnType<typeof makeServiceMock>;

  beforeEach(async () => {
    serviceMock = makeServiceMock();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RankingsController],
      providers: [
        { provide: RankingsService, useValue: serviceMock },
        {
          provide: JwtService,
          useValue: { verify: jest.fn(), sign: jest.fn() },
        },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        JwtAuthGuard,
      ],
    }).compile();

    controller = module.get<RankingsController>(RankingsController);
  });

  it('getMyRanking delegates with the period', async () => {
    const result = await controller.getMyRanking(makeAuthRequest(), {
      period: RankingPeriod.TOTAL,
    });

    expect(serviceMock.getMyRanking).toHaveBeenCalledWith(
      'user-uuid-1',
      RankingPeriod.TOTAL,
    );
    expect(result).toEqual(MY_RANKING);
  });

  it('getLeaderboard defaults the limit to 100', async () => {
    const result = await controller.getLeaderboard({
      period: RankingPeriod.DAILY,
    });

    expect(serviceMock.getLeaderboard).toHaveBeenCalledWith(
      RankingPeriod.DAILY,
      100,
    );
    expect(result).toEqual(LEADERBOARD);
  });

  it('getLeaderboard passes a provided limit through', async () => {
    await controller.getLeaderboard({ period: RankingPeriod.DAILY, limit: 10 });

    expect(serviceMock.getLeaderboard).toHaveBeenCalledWith(
      RankingPeriod.DAILY,
      10,
    );
  });

  it('createSnapshot delegates with the body period', async () => {
    await controller.createSnapshot(makeAuthRequest(), {
      period: RankingPeriod.WEEKLY,
    });

    expect(serviceMock.createSnapshot).toHaveBeenCalledWith(
      'user-uuid-1',
      RankingPeriod.WEEKLY,
    );
  });
});

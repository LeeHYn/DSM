import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ScoresController } from './scores.controller';
import { ScoresService } from './scores.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

const MOCK_SCORE = { id: 'ds-1', cappedScore: 117 };

const makeScoresServiceMock = () => ({
  getDaily: jest.fn().mockResolvedValue(MOCK_SCORE),
  getSummary: jest.fn().mockResolvedValue({ totalScore: 3500, tier: 'GOLD' }),
  recompute: jest.fn(),
});

const makeAuthRequest = (userId = 'user-uuid-1') =>
  ({ user: { sub: userId, type: 'access' } }) as never;

describe('ScoresController', () => {
  let controller: ScoresController;
  let scoresServiceMock: ReturnType<typeof makeScoresServiceMock>;

  beforeEach(async () => {
    scoresServiceMock = makeScoresServiceMock();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ScoresController],
      providers: [
        { provide: ScoresService, useValue: scoresServiceMock },
        {
          provide: JwtService,
          useValue: { verify: jest.fn(), sign: jest.fn() },
        },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        JwtAuthGuard,
      ],
    }).compile();

    controller = module.get<ScoresController>(ScoresController);
  });

  it('getDaily delegates with the provided date', async () => {
    const result = await controller.getDaily(makeAuthRequest(), {
      date: '2026-06-03',
    });

    expect(scoresServiceMock.getDaily).toHaveBeenCalledWith(
      'user-uuid-1',
      '2026-06-03',
    );
    expect(result).toEqual(MOCK_SCORE);
  });

  it('getDaily defaults to the current date when omitted', async () => {
    await controller.getDaily(makeAuthRequest(), {});

    expect(scoresServiceMock.getDaily).toHaveBeenCalledTimes(1);
  });

  it('getSummary delegates', async () => {
    const result = await controller.getSummary(makeAuthRequest());

    expect(scoresServiceMock.getSummary).toHaveBeenCalledWith('user-uuid-1');
    expect(result).toEqual({ totalScore: 3500, tier: 'GOLD' });
  });
});

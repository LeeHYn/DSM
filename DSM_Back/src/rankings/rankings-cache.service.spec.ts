import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RankingPeriod } from '@prisma/client';
import { RedisService } from '../redis/redis.service';
import { RankingsCacheService } from './rankings-cache.service';
import type { LeaderboardEntry } from './rankings.service';

const makeRedisMock = () => ({
  getJson: jest.fn(),
  setJson: jest.fn(),
  delByPrefix: jest.fn(),
});

const makeConfigMock = (ttl?: number | string) =>
  ({
    get: jest.fn((key: string) =>
      key === 'RANKING_CACHE_TTL_SECONDS' ? ttl : undefined,
    ),
  }) as unknown as ConfigService;

const leaderboardEntries: LeaderboardEntry[] = [
  {
    rank: 1,
    userId: 'user-1',
    nickname: 'A',
    tier: 'GOLD',
    profileImageUrl: null,
    score: 900,
  },
];

describe('RankingsCacheService', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('builds leaderboard keys from period and limit', () => {
    const service = new RankingsCacheService(
      makeRedisMock() as unknown as RedisService,
      makeConfigMock(),
    );

    expect(service.leaderboardKey(RankingPeriod.DAILY, 100)).toBe(
      'rankings:leaderboard:DAILY:100',
    );
  });

  it('returns cached leaderboard entries when Redis has them', async () => {
    const redisMock = makeRedisMock();
    redisMock.getJson.mockResolvedValue(leaderboardEntries);
    const service = new RankingsCacheService(
      redisMock as unknown as RedisService,
      makeConfigMock(),
    );

    await expect(
      service.getLeaderboard(RankingPeriod.WEEKLY, 50),
    ).resolves.toEqual(leaderboardEntries);

    expect(redisMock.getJson).toHaveBeenCalledWith(
      'rankings:leaderboard:WEEKLY:50',
    );
  });

  it('returns null when the leaderboard cache misses', async () => {
    const redisMock = makeRedisMock();
    redisMock.getJson.mockResolvedValue(null);
    const service = new RankingsCacheService(
      redisMock as unknown as RedisService,
      makeConfigMock(),
    );

    await expect(
      service.getLeaderboard(RankingPeriod.TOTAL, 25),
    ).resolves.toBeNull();
  });

  it('stores leaderboard entries with configured ttl', async () => {
    const redisMock = makeRedisMock();
    redisMock.setJson.mockResolvedValue(undefined);
    const service = new RankingsCacheService(
      redisMock as unknown as RedisService,
      makeConfigMock('45'),
    );

    await service.setLeaderboard(RankingPeriod.DAILY, 100, leaderboardEntries);

    expect(redisMock.setJson).toHaveBeenCalledWith(
      'rankings:leaderboard:DAILY:100',
      leaderboardEntries,
      45,
    );
  });

  it('uses a 30 second ttl when no ttl is configured', async () => {
    const redisMock = makeRedisMock();
    redisMock.setJson.mockResolvedValue(undefined);
    const service = new RankingsCacheService(
      redisMock as unknown as RedisService,
      makeConfigMock(),
    );

    await service.setLeaderboard(RankingPeriod.TOTAL, 100, leaderboardEntries);

    expect(redisMock.setJson).toHaveBeenCalledWith(
      'rankings:leaderboard:TOTAL:100',
      leaderboardEntries,
      30,
    );
  });

  it('invalidates every cached leaderboard by prefix', async () => {
    const redisMock = makeRedisMock();
    redisMock.delByPrefix.mockResolvedValue(undefined);
    const service = new RankingsCacheService(
      redisMock as unknown as RedisService,
      makeConfigMock(),
    );

    await service.invalidateAllLeaderboards();

    expect(redisMock.delByPrefix).toHaveBeenCalledWith('rankings:leaderboard:');
  });

  it('swallows cache get, set, and invalidate failures', async () => {
    const redisMock = makeRedisMock();
    redisMock.getJson.mockRejectedValue(new Error('read failed'));
    redisMock.setJson.mockRejectedValue(new Error('write failed'));
    redisMock.delByPrefix.mockRejectedValue(new Error('delete failed'));
    const service = new RankingsCacheService(
      redisMock as unknown as RedisService,
      makeConfigMock('60'),
    );

    await expect(
      service.getLeaderboard(RankingPeriod.DAILY, 100),
    ).resolves.toBeNull();
    await expect(
      service.setLeaderboard(RankingPeriod.DAILY, 100, leaderboardEntries),
    ).resolves.toBeUndefined();
    await expect(service.invalidateAllLeaderboards()).resolves.toBeUndefined();
  });
});

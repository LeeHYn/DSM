import { ConfigService } from '@nestjs/config';
import { RankingPeriod } from '@prisma/client';
import { createClient } from '@redis/client';
import { RankingCacheService } from './ranking-cache.service';
import { RealtimeBusService } from '../realtime/realtime-bus.service';

jest.mock('@redis/client', () => ({ createClient: jest.fn() }));

const reference = new Date('2026-09-10T12:00:00.000Z');
const entries = ['u1', 'u2', 'u3'].map((userId, index) => ({
  period: RankingPeriod.TOTAL,
  userId,
  nickname: userId,
  tier: 'BRONZE',
  profileImageUrl: null,
  score: 30 - index,
  rank: index + 1,
  percentile: ((index + 1) / 3) * 100,
  totalUsers: 3,
}));

describe('ranking activation signals', () => {
  it.each([1, 0])(
    'publishes only when the atomic activation succeeds (%s)',
    async (activation) => {
      const bus = {
        publishInvalidation: jest.fn().mockResolvedValue(undefined),
      };
      let activate!: (value: number) => void;
      const redis = {
        isReady: true,
        on: jest.fn(),
        set: jest.fn().mockResolvedValue('OK'),
        get: jest.fn().mockResolvedValue(null),
        del: jest.fn().mockResolvedValue(1),
        eval: jest.fn(
          () =>
            new Promise<number>((resolve) => {
              activate = resolve;
            }),
        ),
      };
      jest
        .mocked(createClient)
        .mockReturnValue(redis as unknown as ReturnType<typeof createClient>);
      const service = new RankingCacheService(
        { get: () => 'redis://127.0.0.1:56379/0' } as unknown as ConfigService,
        bus as unknown as RealtimeBusService,
      );
      const result = service.publishProjection(
        RankingPeriod.TOTAL,
        [],
        reference,
        'lock',
      );
      for (let index = 0; index < 20 && !activate; index++)
        await Promise.resolve();
      expect(activate).toBeDefined();
      expect(bus.publishInvalidation).not.toHaveBeenCalled();
      activate(activation);
      expect(await result).toBe(activation === 1);
      if (activation === 1)
        expect(bus.publishInvalidation).toHaveBeenCalledWith({ kind: 'all' }, [
          'rankings',
        ]);
      else expect(bus.publishInvalidation).not.toHaveBeenCalled();
    },
  );
  it('preserves an activated projection if broadcasting fails', async () => {
    const bus = {
      publishInvalidation: jest
        .fn()
        .mockRejectedValue(new Error('unavailable')),
    };
    const redis = {
      isReady: true,
      on: jest.fn(),
      set: jest.fn().mockResolvedValue('OK'),
      get: jest.fn().mockResolvedValue(null),
      del: jest.fn(),
      eval: jest.fn().mockResolvedValue(1),
    };
    jest
      .mocked(createClient)
      .mockReturnValue(redis as unknown as ReturnType<typeof createClient>);
    const service = new RankingCacheService(
      { get: () => 'redis://127.0.0.1:56379/0' } as unknown as ConfigService,
      bus as unknown as RealtimeBusService,
    );
    expect(
      await service.publishProjection(
        RankingPeriod.TOTAL,
        [],
        reference,
        'lock',
      ),
    ).toBe(true);
    expect(bus.publishInvalidation).toHaveBeenCalledTimes(1);
    expect(redis.del).not.toHaveBeenCalled();
  });
});

describe('RankingCacheService leaderboard completeness', () => {
  const redis = {
    isReady: true,
    on: jest.fn(),
    get: jest.fn(),
    exists: jest.fn(),
    lRange: jest.fn(),
    hmGet: jest.fn(),
  };
  let service: RankingCacheService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .mocked(createClient)
      .mockReturnValue(redis as unknown as ReturnType<typeof createClient>);
    redis.get.mockImplementation((key: string) =>
      Promise.resolve(
        key.endsWith(':active') ? 'generation-1' : '{"entryCount":3}',
      ),
    );
    redis.exists.mockResolvedValue(1);
    redis.lRange.mockResolvedValue(entries.map((entry) => entry.userId));
    redis.hmGet.mockResolvedValue(
      entries.map((entry) => JSON.stringify(entry)),
    );
    service = new RankingCacheService({
      get: () => 'redis://127.0.0.1:56379/0',
    } as unknown as ConfigService);
  });

  it('treats a missing nonempty generation list as a cache miss', async () => {
    redis.lRange.mockResolvedValue([]);
    await expect(
      service.readLeaderboard(RankingPeriod.TOTAL, 3, reference),
    ).resolves.toBeNull();
  });

  it('treats a truncated list as a cache miss', async () => {
    redis.lRange.mockResolvedValue(['u1', 'u2']);
    redis.hmGet.mockResolvedValue(
      entries.slice(0, 2).map((entry) => JSON.stringify(entry)),
    );
    await expect(
      service.readLeaderboard(RankingPeriod.TOTAL, 3, reference),
    ).resolves.toBeNull();
  });

  it.each([null, 'bad-json', '{}', '{"entryCount":-1}', '{"entryCount":1.5}'])(
    'rejects a missing or invalid completion marker: %s',
    async (marker) => {
      redis.get.mockImplementation((key: string) =>
        Promise.resolve(key.endsWith(':active') ? 'generation-1' : marker),
      );
      await expect(
        service.readLeaderboard(RankingPeriod.TOTAL, 3, reference),
      ).resolves.toBeNull();
    },
  );

  it('preserves a valid empty projection', async () => {
    redis.get.mockImplementation((key: string) =>
      Promise.resolve(
        key.endsWith(':active') ? 'generation-1' : '{"entryCount":0}',
      ),
    );
    redis.lRange.mockResolvedValue([]);
    await expect(
      service.readLeaderboard(RankingPeriod.TOTAL, 3, reference),
    ).resolves.toEqual([]);
  });

  it('accepts a limit smaller than the complete population', async () => {
    redis.lRange.mockResolvedValue(['u1']);
    redis.hmGet.mockResolvedValue([JSON.stringify(entries[0])]);
    await expect(
      service.readLeaderboard(RankingPeriod.TOTAL, 1, reference),
    ).resolves.toMatchObject([{ userId: 'u1', rank: 1 }]);
  });

  it('accepts a population smaller than the requested limit', async () => {
    await expect(
      service.readLeaderboard(RankingPeriod.TOTAL, 100, reference),
    ).resolves.toHaveLength(3);
  });

  it('treats entries lost after the list read as a cache miss', async () => {
    redis.hmGet.mockResolvedValue([JSON.stringify(entries[0]), null, null]);
    await expect(
      service.readLeaderboard(RankingPeriod.TOTAL, 3, reference),
    ).resolves.toBeNull();
  });
});

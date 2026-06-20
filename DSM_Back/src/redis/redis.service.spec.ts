import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from 'redis';
import { RedisService } from './redis.service';

jest.mock('redis', () => ({
  createClient: jest.fn(),
}));

const createClientMock = createClient as jest.MockedFunction<
  typeof createClient
>;

type MockRedisClient = {
  connect: jest.Mock;
  get: jest.Mock;
  set: jest.Mock;
  del: jest.Mock;
  scanIterator: jest.Mock;
  duplicate: jest.Mock;
  quit: jest.Mock;
  destroy: jest.Mock;
  on: jest.Mock;
};

const makeConfigMock = (redisUrl?: string) =>
  ({
    get: jest.fn((key: string) => (key === 'REDIS_URL' ? redisUrl : undefined)),
  }) as unknown as ConfigService;

const makeRedisClient = (
  overrides: Partial<MockRedisClient> = {},
): MockRedisClient => ({
  connect: jest.fn().mockResolvedValue(undefined),
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  scanIterator: jest.fn().mockReturnValue(makeScanIterator([])),
  duplicate: jest.fn(),
  quit: jest.fn().mockResolvedValue('OK'),
  destroy: jest.fn(),
  on: jest.fn().mockReturnThis(),
  ...overrides,
});

function makeScanIterator(batches: string[]): AsyncIterableIterator<string[]>;
function makeScanIterator(batches: string[][]): AsyncIterableIterator<string[]>;
function makeScanIterator(
  batches: string[] | string[][],
): AsyncIterableIterator<string[]> {
  const normalizedBatches = Array.isArray(batches[0])
    ? (batches as string[][])
    : [batches as string[]];
  let index = 0;
  const iterator: AsyncIterableIterator<string[]> = {
    [Symbol.asyncIterator]: () => iterator,
    next: jest.fn((): Promise<IteratorResult<string[]>> => {
      const value = normalizedBatches[index];
      index += 1;
      return Promise.resolve(
        value === undefined
          ? { done: true, value: undefined }
          : { done: false, value },
      );
    }),
  };

  return iterator;
}

const makeRejectingScanIterator = (
  error: Error,
): AsyncIterableIterator<string[]> => {
  const iterator: AsyncIterableIterator<string[]> = {
    [Symbol.asyncIterator]: () => iterator,
    next: jest.fn().mockRejectedValue(error),
  };

  return iterator;
};

const makeNeverSettlingScanIterator = (): AsyncIterableIterator<string[]> => {
  const iterator: AsyncIterableIterator<string[]> = {
    [Symbol.asyncIterator]: () => iterator,
    next: jest.fn().mockReturnValue(new Promise(() => undefined)),
  };

  return iterator;
};

const makeDeferred = <T = void>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return { promise, resolve, reject };
};

describe('RedisService', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.useRealTimers();
    warnSpy.mockRestore();
  });

  it.each([undefined, '   '])(
    'keeps Redis disabled when REDIS_URL is absent or blank',
    async (redisUrl) => {
      const service = new RedisService(makeConfigMock(redisUrl));

      expect(service.isEnabled()).toBe(false);
      await expect(service.getJson('rankings:daily')).resolves.toBeNull();
      await expect(
        service.setJson('rankings:daily', { leaders: [] }, 60),
      ).resolves.toBeUndefined();
      await expect(service.delByPrefix('rankings:')).resolves.toBeUndefined();
      await expect(service.createAdapterClients()).resolves.toBeNull();
      expect(createClientMock).not.toHaveBeenCalled();
    },
  );

  it('reads, writes, and deletes JSON cache entries through Redis', async () => {
    const client = makeRedisClient({
      get: jest.fn().mockResolvedValue(JSON.stringify({ score: 120 })),
      scanIterator: jest
        .fn()
        .mockReturnValue(
          makeScanIterator([['rankings:daily', 'rankings:weekly'], []]),
        ),
    });
    createClientMock.mockReturnValue(client as never);
    const service = new RedisService(
      makeConfigMock(' redis://localhost:6379 '),
    );

    await expect(
      service.getJson<{ score: number }>('rankings:daily'),
    ).resolves.toEqual({ score: 120 });
    await service.setJson('rankings:daily', { leaders: [] }, 90);
    await service.delByPrefix('rankings:');

    expect(service.isEnabled()).toBe(true);
    expect(createClientMock).toHaveBeenCalledWith({
      url: 'redis://localhost:6379',
      disableOfflineQueue: true,
      socket: {
        connectTimeout: 1500,
        reconnectStrategy: false,
      },
    });
    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(client.get).toHaveBeenCalledWith('rankings:daily');
    expect(client.set).toHaveBeenCalledWith(
      'rankings:daily',
      JSON.stringify({ leaders: [] }),
      { expiration: { type: 'EX', value: 90 } },
    );
    expect(client.scanIterator).toHaveBeenCalledWith({
      MATCH: 'rankings:*',
      COUNT: 100,
    });
    expect(client.del).toHaveBeenCalledWith([
      'rankings:daily',
      'rankings:weekly',
    ]);
  });

  it('swallows cache read, parse, write, and delete errors', async () => {
    const client = makeRedisClient({
      get: jest
        .fn()
        .mockRejectedValueOnce(new Error('redis unavailable'))
        .mockResolvedValueOnce('not-json'),
      set: jest.fn().mockRejectedValue(new Error('write failed')),
      scanIterator: jest
        .fn()
        .mockReturnValue(makeRejectingScanIterator(new Error('scan failed'))),
    });
    createClientMock.mockReturnValue(client as never);
    const service = new RedisService(makeConfigMock('redis://localhost:6379'));

    await expect(service.getJson('rankings:daily')).resolves.toBeNull();
    await expect(service.getJson('rankings:daily')).resolves.toBeNull();
    await expect(
      service.setJson('rankings:daily', { leaders: [] }, 90),
    ).resolves.toBeUndefined();
    await expect(service.delByPrefix('rankings:')).resolves.toBeUndefined();
  });

  it('returns null and destroys the cache client when connect never settles', async () => {
    jest.useFakeTimers();
    const client = makeRedisClient({
      connect: jest.fn().mockReturnValue(new Promise(() => undefined)),
    });
    createClientMock.mockReturnValue(client as never);
    const service = new RedisService(makeConfigMock('redis://localhost:6379'));

    const resultPromise = service.getJson('rankings:daily');
    await jest.advanceTimersByTimeAsync(2000);

    await expect(
      Promise.race([resultPromise, Promise.resolve('still-pending')]),
    ).resolves.toBeNull();
    expect(client.destroy).toHaveBeenCalledTimes(1);
    expect(client.get).not.toHaveBeenCalled();
  });

  it('returns null and destroys the cache client when GET never settles', async () => {
    jest.useFakeTimers();
    const client = makeRedisClient({
      get: jest.fn().mockReturnValue(new Promise(() => undefined)),
    });
    createClientMock.mockReturnValue(client as never);
    const service = new RedisService(makeConfigMock('redis://localhost:6379'));

    const resultPromise = service.getJson('rankings:daily');
    await jest.advanceTimersByTimeAsync(2000);

    await expect(
      Promise.race([resultPromise, Promise.resolve('still-pending')]),
    ).resolves.toBeNull();
    expect(client.get).toHaveBeenCalledWith('rankings:daily');
    expect(client.destroy).toHaveBeenCalledTimes(1);
  });

  it('resolves and destroys the cache client when SET never settles', async () => {
    jest.useFakeTimers();
    const client = makeRedisClient({
      set: jest.fn().mockReturnValue(new Promise(() => undefined)),
    });
    createClientMock.mockReturnValue(client as never);
    const service = new RedisService(makeConfigMock('redis://localhost:6379'));

    const resultPromise = service.setJson(
      'rankings:daily',
      { leaders: [] },
      90,
    );
    await jest.advanceTimersByTimeAsync(2000);

    await expect(
      Promise.race([resultPromise, Promise.resolve('still-pending')]),
    ).resolves.toBeUndefined();
    expect(client.set).toHaveBeenCalledWith(
      'rankings:daily',
      JSON.stringify({ leaders: [] }),
      { expiration: { type: 'EX', value: 90 } },
    );
    expect(client.destroy).toHaveBeenCalledTimes(1);
  });

  it('resolves and destroys the cache client when SCAN never settles', async () => {
    jest.useFakeTimers();
    const client = makeRedisClient({
      scanIterator: jest.fn().mockReturnValue(makeNeverSettlingScanIterator()),
    });
    createClientMock.mockReturnValue(client as never);
    const service = new RedisService(makeConfigMock('redis://localhost:6379'));

    const resultPromise = service.delByPrefix('rankings:');
    await jest.advanceTimersByTimeAsync(2000);

    await expect(
      Promise.race([resultPromise, Promise.resolve('still-pending')]),
    ).resolves.toBeUndefined();
    expect(client.scanIterator).toHaveBeenCalledWith({
      MATCH: 'rankings:*',
      COUNT: 100,
    });
    expect(client.del).not.toHaveBeenCalled();
    expect(client.destroy).toHaveBeenCalledTimes(1);
  });

  it('resolves and destroys the cache client when DEL never settles', async () => {
    jest.useFakeTimers();
    const client = makeRedisClient({
      scanIterator: jest
        .fn()
        .mockReturnValue(makeScanIterator([['rankings:daily']])),
      del: jest.fn().mockReturnValue(new Promise(() => undefined)),
    });
    createClientMock.mockReturnValue(client as never);
    const service = new RedisService(makeConfigMock('redis://localhost:6379'));

    const resultPromise = service.delByPrefix('rankings:');
    await jest.advanceTimersByTimeAsync(2000);

    await expect(
      Promise.race([resultPromise, Promise.resolve('still-pending')]),
    ).resolves.toBeUndefined();
    expect(client.del).toHaveBeenCalledWith(['rankings:daily']);
    expect(client.destroy).toHaveBeenCalledTimes(1);
  });

  it('creates connected pub/sub clients for the Socket.IO adapter', async () => {
    const subClient = makeRedisClient();
    const pubClient = makeRedisClient({
      duplicate: jest.fn().mockReturnValue(subClient),
    });
    createClientMock.mockReturnValue(pubClient as never);
    const service = new RedisService(makeConfigMock('redis://localhost:6379'));

    await expect(service.createAdapterClients()).resolves.toEqual({
      pubClient,
      subClient,
    });
    expect(pubClient.connect).toHaveBeenCalledTimes(1);
    expect(subClient.connect).toHaveBeenCalledTimes(1);
  });

  it('closes adapter clients on module destroy after successful creation', async () => {
    const subClient = makeRedisClient();
    const pubClient = makeRedisClient({
      duplicate: jest.fn().mockReturnValue(subClient),
    });
    createClientMock.mockReturnValue(pubClient as never);
    const service = new RedisService(makeConfigMock('redis://localhost:6379'));

    await expect(service.createAdapterClients()).resolves.toEqual({
      pubClient,
      subClient,
    });
    await service.onModuleDestroy();

    expect(pubClient.quit).toHaveBeenCalledTimes(1);
    expect(subClient.quit).toHaveBeenCalledTimes(1);
    expect(pubClient.destroy).not.toHaveBeenCalled();
    expect(subClient.destroy).not.toHaveBeenCalled();
  });

  it('does not hang and destroys a client when quit never settles', async () => {
    jest.useFakeTimers();
    const client = makeRedisClient({
      quit: jest.fn().mockReturnValue(new Promise(() => undefined)),
    });
    createClientMock.mockReturnValue(client as never);
    const service = new RedisService(makeConfigMock('redis://localhost:6379'));

    await expect(service.getJson('rankings:daily')).resolves.toBeNull();

    const resultPromise = service.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(2000);

    await expect(
      Promise.race([resultPromise, Promise.resolve('still-pending')]),
    ).resolves.toBeUndefined();
    expect(client.quit).toHaveBeenCalledTimes(1);
    expect(client.destroy).toHaveBeenCalledTimes(1);
  });

  it('reuses connected adapter clients on repeated creation calls', async () => {
    const subClient = makeRedisClient();
    const pubClient = makeRedisClient({
      duplicate: jest.fn().mockReturnValue(subClient),
    });
    createClientMock.mockReturnValue(pubClient as never);
    const service = new RedisService(makeConfigMock('redis://localhost:6379'));

    const firstClients = await service.createAdapterClients();
    const secondClients = await service.createAdapterClients();

    expect(secondClients).toBe(firstClients);
    expect(createClientMock).toHaveBeenCalledTimes(1);
    expect(pubClient.connect).toHaveBeenCalledTimes(1);
    expect(subClient.connect).toHaveBeenCalledTimes(1);
  });

  it('shares in-flight adapter client creation across concurrent calls', async () => {
    const pubConnect = makeDeferred();
    const subClient = makeRedisClient();
    const pubClient = makeRedisClient({
      connect: jest.fn().mockReturnValue(pubConnect.promise),
      duplicate: jest.fn().mockReturnValue(subClient),
    });
    createClientMock.mockReturnValue(pubClient as never);
    const service = new RedisService(makeConfigMock('redis://localhost:6379'));

    const firstClientsPromise = service.createAdapterClients();
    const secondClientsPromise = service.createAdapterClients();

    expect(createClientMock).toHaveBeenCalledTimes(1);
    pubConnect.resolve();

    const [firstClients, secondClients] = await Promise.all([
      firstClientsPromise,
      secondClientsPromise,
    ]);

    expect(secondClients).toBe(firstClients);
    expect(firstClients).toEqual({ pubClient, subClient });
    expect(pubClient.connect).toHaveBeenCalledTimes(1);
    expect(subClient.connect).toHaveBeenCalledTimes(1);
  });

  it('cleans up partial adapter clients when adapter connection fails', async () => {
    const subClient = makeRedisClient({
      connect: jest.fn().mockRejectedValue(new Error('sub failed')),
    });
    const pubClient = makeRedisClient({
      duplicate: jest.fn().mockReturnValue(subClient),
    });
    createClientMock.mockReturnValue(pubClient as never);
    const service = new RedisService(makeConfigMock('redis://localhost:6379'));

    await expect(service.createAdapterClients()).resolves.toBeNull();
    expect(pubClient.destroy).toHaveBeenCalledTimes(1);
    expect(subClient.destroy).toHaveBeenCalledTimes(1);
  });

  it('cleans up partial adapter clients when adapter connect times out', async () => {
    jest.useFakeTimers();
    const subClient = makeRedisClient({
      connect: jest.fn().mockReturnValue(new Promise(() => undefined)),
    });
    const pubClient = makeRedisClient({
      duplicate: jest.fn().mockReturnValue(subClient),
    });
    createClientMock.mockReturnValue(pubClient as never);
    const service = new RedisService(makeConfigMock('redis://localhost:6379'));

    const resultPromise = service.createAdapterClients();
    await jest.advanceTimersByTimeAsync(2000);

    await expect(
      Promise.race([resultPromise, Promise.resolve('still-pending')]),
    ).resolves.toBeNull();
    expect(pubClient.destroy).toHaveBeenCalledTimes(1);
    expect(subClient.destroy).toHaveBeenCalledTimes(1);
  });
});

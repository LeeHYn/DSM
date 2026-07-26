import { TokenStoreCoordinator } from './token-store-coordinator';

function createDeferredStore(initial: string | null = null) {
  let value = initial;
  let releaseGate!: () => void;
  const gate = new Promise<void>((resolve) => {
    releaseGate = resolve;
  });
  let signalWriteStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    signalWriteStarted = resolve;
  });
  const calls: string[] = [];

  return {
    calls,
    release: releaseGate,
    started,
    read: jest.fn(async () => {
      calls.push('read');
      return value;
    }),
    write: jest.fn(async (refreshToken: string) => {
      signalWriteStarted();
      await gate;
      calls.push(`write:${refreshToken}`);
      value = refreshToken;
    }),
    clear: jest.fn(async () => {
      calls.push('clear');
      value = null;
    }),
  };
}

it('skips a stale queued write', async () => {
  let epoch = 1;
  const store = createDeferredStore();
  const coordinator = new TokenStoreCoordinator(store, () => epoch);

  const write = coordinator.writeIfCurrent('record.secret', 1);
  epoch = 2;
  store.release();

  await expect(write).resolves.toBe(false);
  expect(store.write).not.toHaveBeenCalled();
});

it('clears a write whose epoch changes during storage', async () => {
  let epoch = 1;
  const store = {
    read: jest.fn().mockResolvedValue(null),
    write: jest.fn(async () => {
      epoch = 2;
    }),
    clear: jest.fn().mockResolvedValue(undefined),
  };
  const coordinator = new TokenStoreCoordinator(store, () => epoch);

  await expect(
    coordinator.writeIfCurrent('new.secret', 1),
  ).resolves.toBe(false);
  expect(store.clear).toHaveBeenCalledTimes(1);
});

it('orders stale cleanup before logout read-and-clear', async () => {
  let epoch = 1;
  const store = createDeferredStore('old.secret');
  const coordinator = new TokenStoreCoordinator(store, () => epoch);

  const write = coordinator.writeIfCurrent('new.secret', 1);
  const clear = coordinator.readAndClear();
  await store.started;
  epoch = 2;
  store.release();

  await write;
  await expect(clear).resolves.toBeNull();
  expect(store.calls).toEqual([
    'write:new.secret',
    'clear',
    'read',
    'clear',
  ]);
});

it('continues after a queued operation rejects', async () => {
  const store = {
    read: jest
      .fn()
      .mockRejectedValueOnce(new Error('read failed'))
      .mockResolvedValueOnce('record.secret'),
    write: jest.fn().mockResolvedValue(undefined),
    clear: jest.fn().mockResolvedValue(undefined),
  };
  const coordinator = new TokenStoreCoordinator(store, () => 1);

  await expect(coordinator.read()).rejects.toThrow('read failed');
  await expect(coordinator.read()).resolves.toBe('record.secret');
  expect(store.read).toHaveBeenCalledTimes(2);
});

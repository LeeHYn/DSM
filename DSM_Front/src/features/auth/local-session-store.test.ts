import { LocalSessionStore } from './local-session-store';

const user = { userId: 'owner-a', onboardingCompletedAt: '2026-01-01T00:00:00.000Z' };
function setup() {
  let value: string | null = null;
  const storage = {
    read: jest.fn(async () => value),
    write: jest.fn(async (next: string) => { value = next; }),
  };
  const now = () => new Date('2026-09-11T00:00:00.000Z');
  return { storage, now, store: new LocalSessionStore(storage, now) };
}

test('restores only the verified grant bound to the active refresh credential', async () => {
  const { store, storage, now } = setup();
  expect(await store.saveGrant(user, 'fixture.refresh', () => true)).toBe(true);
  const restarted = new LocalSessionStore(storage, now);
  expect(await restarted.readGrant('fixture.refresh')).toEqual(user);
  expect(await restarted.readGrant('other.refresh')).toBeNull();
  const expired = new LocalSessionStore(storage, () => new Date('2026-10-12T00:00:00Z'));
  expect(await expired.readGrant('fixture.refresh')).toBeNull();
});
test('stale invalidation never removes the newer grant while queued or reading', async () => {
  const { store, storage } = setup();
  await store.saveGrant(user, 'new.refresh', () => true);
  let current = true;
  const queued = store.invalidateGrant(() => current);
  current = false;
  await queued;
  expect(await store.readGrant('new.refresh')).toEqual(user);
  const originalRead = storage.read.getMockImplementation()!;
  current = true;
  storage.read.mockImplementationOnce(async () => { const result = await originalRead(); current = false; return result; });
  await store.invalidateGrant(() => current);
  expect(await store.readGrant('new.refresh')).toEqual(user);
});

test('makes local exit durable before active credentials can be cleared', async () => {
  const { store, storage, now } = setup();
  await store.saveGrant(user, 'fixture.refresh', () => true);
  expect(await store.deferRevocation('fixture.refresh', () => true)).toBe(true);
  const restarted = new LocalSessionStore(storage, now);
  expect(await restarted.readGrant('fixture.refresh')).toBeNull();
  const revoke = jest.fn(async (_token: string) => {});
  await restarted.drainRevocations(revoke);
  expect(revoke).toHaveBeenCalledWith('fixture.refresh');
  await restarted.drainRevocations(revoke);
  expect(revoke).toHaveBeenCalledTimes(1);
});

test('preserves pending revocation on network failure and retries the same credential', async () => {
  const { store } = setup();
  await store.deferRevocation('fixture.refresh', () => true);
  const revoke = jest.fn().mockRejectedValueOnce(new Error('synthetic-private-detail')).mockResolvedValue(undefined);
  await store.drainRevocations(revoke);
  await store.drainRevocations(revoke);
  expect(revoke.mock.calls).toEqual([['fixture.refresh'], ['fixture.refresh']]);
});

test('does not report local exit success or erase the grant when durable write fails', async () => {
  const { store, storage } = setup();
  await store.saveGrant(user, 'fixture.refresh', () => true);
  storage.write.mockRejectedValueOnce(new Error('synthetic-private-detail'));
  await expect(store.deferRevocation('fixture.refresh', () => true)).rejects.toThrow('Local session storage failed');
  expect(await store.readGrant('fixture.refresh')).toEqual(user);
  expect(await store.deferRevocation('fixture.refresh', () => true)).toBe(true);
});

test('rejects stale grant writes and invalidates a grant before the next account', async () => {
  const { store, storage } = setup();
  expect(await store.saveGrant(user, 'fixture.refresh', () => false)).toBe(false);
  expect(storage.write).not.toHaveBeenCalled();
  await store.saveGrant(user, 'fixture.refresh', () => true);
  await store.invalidateGrant();
  expect(await store.readGrant('fixture.refresh')).toBeNull();
});

test('deduplicates pending credentials and refuses overflow without dropping any', async () => {
  const { store } = setup();
  for (let i = 0; i < 10; i++) await store.deferRevocation(`fixture.${i}`, () => true);
  await store.deferRevocation('fixture.0', () => true);
  await expect(store.deferRevocation('fixture.overflow', () => true)).rejects.toThrow('Local session storage failed');
  const revoke = jest.fn(async (_token: string) => {});
  await store.drainRevocations(revoke);
  expect(revoke).toHaveBeenCalledTimes(10);
});

test('rejects corrupted storage without overwriting it or exposing its contents', async () => {
  const { store, storage } = setup();
  storage.read.mockResolvedValue('{synthetic-private-detail');
  await expect(store.readGrant('fixture.refresh')).rejects.toThrow('Local session storage failed');
  await expect(store.deferRevocation('fixture.refresh', () => true)).rejects.toThrow('Local session storage failed');
  expect(storage.write).not.toHaveBeenCalled();
});

test('does not let slow revocation block a new grant or delete a newer pending entry', async () => {
  const { store } = setup();
  await store.deferRevocation('fixture.old', () => true);
  let release!: () => void;
  const revoke = jest.fn(() => new Promise<void>(resolve => { release = resolve; }));
  const drain = store.drainRevocations(revoke);
  while (revoke.mock.calls.length === 0) await Promise.resolve();
  await store.saveGrant({ ...user, userId: 'owner-b' }, 'fixture.new', () => true);
  await store.deferRevocation('fixture.new', () => true);
  const duplicateDrain = store.drainRevocations(revoke);
  expect(revoke).toHaveBeenCalledTimes(1);
  release();
  await Promise.all([drain, duplicateDrain]);
  const next = jest.fn(async (_token: string) => {});
  await store.drainRevocations(next);
  expect(next).toHaveBeenCalledWith('fixture.new');
});

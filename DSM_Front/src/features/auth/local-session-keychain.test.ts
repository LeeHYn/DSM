import * as Keychain from 'react-native-keychain';
import { createLocalSessionStore } from './local-session-keychain';

jest.mock('react-native-keychain', () => ({
  ACCESSIBLE: { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only' },
  getGenericPassword: jest.fn(),
  setGenericPassword: jest.fn(),
}));
const get = jest.mocked(Keychain.getGenericPassword);
const set = jest.mocked(Keychain.setGenericPassword);
const user = { userId: 'owner-a', onboardingCompletedAt: '2026-01-01T00:00:00.000Z' };
beforeEach(() => {
  jest.resetAllMocks();
  let password: string | null = null;
  get.mockImplementation(async () => password === null ? false : {
    password, username: 'local-session', service: 'dsm.auth.local-session.v1', storage: 'keychain',
  } as never);
  set.mockImplementation(async (_name, value) => {
    password = value;
    return { service: 'dsm.auth.local-session.v1', storage: 'keychain' } as never;
  });
});

test('persists a separate device-only verified grant and recovers it after runtime recreation', async () => {
  await createLocalSessionStore().saveGrant(user, 'fixture.refresh', () => true);
  expect(set).toHaveBeenCalledWith('local-session', expect.any(String), {
    service: 'dsm.auth.local-session.v1', accessible: 'device-only',
  });
  expect(await createLocalSessionStore().readGrant('fixture.refresh')).toEqual(user);
  expect(get).toHaveBeenCalledWith({ service: 'dsm.auth.local-session.v1' });
});

test('cannot report a successful write when native storage silently drops it', async () => {
  set.mockResolvedValue(false);
  await expect(createLocalSessionStore().saveGrant(user, 'fixture.refresh', () => true))
    .rejects.toMatchObject({ kind: 'storage', message: 'Local session storage failed' });
});

test('keeps native exception contents out of surfaced errors', async () => {
  get.mockRejectedValue(new Error('fixture.private-credential'));
  await expect(createLocalSessionStore().readGrant('fixture.refresh'))
    .rejects.toMatchObject({ kind: 'storage', message: 'Local session storage failed', cause: undefined });
});

test('survives local exit restart and revokes only the deferred credential', async () => {
  await createLocalSessionStore().deferRevocation('fixture.refresh', () => true);
  const restored = createLocalSessionStore();
  expect(await restored.readGrant('fixture.refresh')).toBeNull();
  const revoke = jest.fn(async (_credential: string) => {});
  await restored.drainRevocations(revoke);
  await createLocalSessionStore().drainRevocations(revoke);
  expect(revoke).toHaveBeenCalledTimes(1);
  expect(revoke).toHaveBeenCalledWith('fixture.refresh');
});

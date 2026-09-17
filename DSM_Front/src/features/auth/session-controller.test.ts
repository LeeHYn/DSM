import { ApiError } from '../../lib/api/api-error';
import { AuthApi } from '../../lib/api/auth-api';
import { parseCurrentUser } from '../../lib/api/auth-contracts';
import {
  AuthenticatedClient,
  createAuthenticatedClient,
} from '../../lib/api/authenticated-client';
import { createHttpClient } from '../../lib/api/http-client';
import { LocalSessionStore } from './local-session-store';
import { TokenStoreCoordinator } from './token-store-coordinator';
import {
  SessionController,
  SessionTokenStore,
} from './session-controller';

const TOKEN_PAIR = {
  accessToken: 'header.payload.signature',
  refreshToken: 'record.secret',
};

describe('durable local workspace and deferred offline exit', () => {
  const verifiedUser = { userId: 'local-owner', onboardingCompletedAt: '2026-01-01T00:00:00.000Z' };
  function localRuntime() {
    let credential: string | null = 'old.refresh';
    let raw: string | null = null;
    const secure = {
      read: jest.fn(async () => raw),
      write: jest.fn(async (value: string) => { raw = value; }),
    };
    const localSession = new LocalSessionStore(secure);
    const tokens: SessionTokenStore = {
      read: jest.fn(async () => credential),
      writeIfCurrent: jest.fn(async (value: string) => { credential = value; return true; }),
      readAndClear: jest.fn(async () => { const old = credential; credential = null; return old; }),
    };
    const makeController = () => new SessionController({ authApi, authenticatedClient, tokenStore: tokens, localSession });
    return { controller: makeController(), makeController, localSession, secure, tokens, readEnvelope: () => raw };
  }
  async function loginLocal(runtime: ReturnType<typeof localRuntime>) {
    authApi.rotateRefreshToken.mockResolvedValue(TOKEN_PAIR);
    authenticatedClient.request.mockResolvedValue(verifiedUser);
    await runtime.controller.bootstrap();
    expect(await runtime.localSession.readGrant(TOKEN_PAIR.refreshToken)).toEqual(verifiedUser);
  }
  it('preserves a verified local user and epoch after refresh network failure, including restart', async () => {
    const runtime = localRuntime();
    await loginLocal(runtime);
    const epoch = runtime.controller.getEpoch();
    authApi.rotateRefreshToken.mockRejectedValue(new ApiError('network', 'offline'));
    await expect(runtime.controller.refreshAccessToken()).rejects.toMatchObject({ kind: 'network' });
    expect(runtime.controller.getSnapshot().state).toEqual({ status: 'offline-workspace', retry: 'bootstrap', ...verifiedUser });
    expect(runtime.controller.getEpoch()).toBe(epoch);
    const restarted = runtime.makeController();
    await restarted.bootstrap();
    expect(restarted.getSnapshot().state).toEqual({ status: 'offline-workspace', retry: 'bootstrap', ...verifiedUser });
  });
  it('invalidates the prior local grant even when switching provider login fails', async () => {
    const runtime = localRuntime();
    await loginLocal(runtime);
    authApi.exchangeProviderToken.mockRejectedValue(new ApiError('network', 'offline'));
    await runtime.controller.signIn('APPLE', 'fixture.provider');
    expect(await runtime.localSession.readGrant(TOKEN_PAIR.refreshToken)).toBeNull();
    expect(runtime.controller.getSnapshot().state.status).toBe('unauthenticated');
  });
  it('records deferred revocation before local logout and never reopens its grant on restart', async () => {
    const runtime = localRuntime();
    await loginLocal(runtime);
    authApi.rotateRefreshToken.mockRejectedValue(new ApiError('network', 'offline'));
    await runtime.controller.refreshAccessToken().catch(() => undefined);
    const before = authApi.revokeSession.mock.calls.length;
    authApi.revokeSession.mockRejectedValue(new ApiError('network', 'offline'));
    expect(await runtime.controller.leaveOffline()).toBe(true);
    expect(runtime.controller.getSnapshot().state.status).toBe('unauthenticated');
    expect(await runtime.tokens.read()).toBeNull();
    await runtime.controller.drainPendingRevocations();
    expect(authApi.revokeSession.mock.calls.length).toBeGreaterThan(before);
    const revoke = jest.fn(async (_token: string) => {});
    await runtime.localSession.drainRevocations(revoke);
    expect(revoke).toHaveBeenCalledWith(TOKEN_PAIR.refreshToken);
    expect(await runtime.localSession.readGrant(TOKEN_PAIR.refreshToken)).toBeNull();
  });
  it('refuses offline exit if durable revocation cannot be saved', async () => {
    const runtime = localRuntime();
    await loginLocal(runtime);
    authApi.rotateRefreshToken.mockRejectedValue(new ApiError('network', 'offline'));
    await runtime.controller.refreshAccessToken().catch(() => undefined);
    runtime.secure.write.mockRejectedValueOnce(new Error('private-detail'));
    expect(await runtime.controller.leaveOffline()).toBe(false);
    expect(await runtime.tokens.read()).toBe(TOKEN_PAIR.refreshToken);
    expect(runtime.controller.getSnapshot().error?.kind).toBe('storage');
  });
  it.each(['retry', 'bootstrap', 'refresh', 'subscriber'] as const)('cannot resurrect an offline exit through concurrent %s', async entry => {
    let credential: string | null = 'old.refresh';
    let raw: string | null = null;
    let current!: SessionController;
    const localSession = new LocalSessionStore({ read: async () => raw, write: async value => { raw = value; } });
    const tokenCoordinator = new TokenStoreCoordinator({ read: async () => credential,
      write: async value => { credential = value; }, clear: async () => { credential = null; } }, () => current.getEpoch());
    current = new SessionController({ authApi, authenticatedClient, tokenStore: tokenCoordinator, localSession });
    await localSession.saveGrant(verifiedUser, credential, () => true);
    authApi.rotateRefreshToken.mockRejectedValue(new ApiError('network', 'offline'));
    authApi.revokeSession.mockRejectedValue(new ApiError('network', 'offline'));
    authenticatedClient.request.mockResolvedValue(verifiedUser);
    await current.bootstrap();
    expect(current.getSnapshot().state.status).toBe('offline-workspace');
    let release!: (pair: typeof TOKEN_PAIR) => void;
    const delayed = new Promise<typeof TOKEN_PAIR>(resolve => { release = resolve; });
    authApi.rotateRefreshToken.mockReturnValue(delayed);
    const before = authApi.rotateRefreshToken.mock.calls.length;
    let recovery: Promise<unknown> | undefined;
    if (entry === 'subscriber') current.subscribe(() => {
      if (current.getSnapshot().action === 'logging-out') recovery = current.retryRecovery();
    });
    const exiting = current.leaveOffline();
    if (entry !== 'subscriber') recovery = (entry === 'retry' ? current.retryRecovery() :
      entry === 'bootstrap' ? current.bootstrap() : current.refreshAccessToken()).catch(() => undefined);
    expect(await exiting).toBe(true);
    release(TOKEN_PAIR);
    await recovery;
    expect(authApi.rotateRefreshToken.mock.calls.length).toBe(before);
    expect(credential).toBeNull();
    expect(current.getAccessToken()).toBeNull();
    expect(current.getSnapshot().state.status).toBe('unauthenticated');
  });
  it('invalidates the local grant on an unauthorized session', async () => {
    const runtime = localRuntime();
    await loginLocal(runtime);
    await runtime.controller.endUnauthorizedSession();
    expect(await runtime.localSession.readGrant(TOKEN_PAIR.refreshToken)).toBeNull();
    expect(await runtime.tokens.read()).toBeNull();
  });

  it.each(['bootstrap', 'refresh'] as const)('%s converges after grant read fails following committed token rotation', async flow => {
    const runtime = localRuntime();
    await runtime.localSession.deferRevocation('pending.fixture', () => true);
    await runtime.localSession.saveGrant(verifiedUser, 'old.refresh', () => true);
    authApi.revokeSession.mockRejectedValue(new ApiError('network', 'offline'));
    authApi.rotateRefreshToken.mockResolvedValue(TOKEN_PAIR);
    const readGrant = runtime.localSession.readGrant.bind(runtime.localSession);
    jest.spyOn(runtime.localSession, 'readGrant').mockImplementationOnce(token => {
      runtime.secure.read.mockRejectedValueOnce(new Error('private local read detail'));
      return readGrant(token);
    });
    if (flow === 'bootstrap') await runtime.controller.bootstrap();
    else await expect(runtime.controller.refreshAccessToken()).rejects.toMatchObject({ kind: 'storage' });
    expect(runtime.controller.getSnapshot()).toMatchObject({
      state: { status: 'storage-error', operation: 'read' }, action: 'idle', error: { kind: 'storage' },
    });
    expect(runtime.controller.getAccessToken()).toBeNull();
    expect(await runtime.tokens.read()).toBe(TOKEN_PAIR.refreshToken);
    expect(runtime.tokens.readAndClear).not.toHaveBeenCalled();
    expect(JSON.parse(runtime.readEnvelope()!).pendingRevocations).toEqual(['pending.fixture']);
    expect(JSON.stringify(runtime.controller.getSnapshot())).not.toContain('private');
    expect(authApi.revokeSession).not.toHaveBeenCalledWith(TOKEN_PAIR.refreshToken);

    const recovered = { accessToken: 'recovered-access', refreshToken: 'recovered.refresh' };
    authApi.rotateRefreshToken.mockResolvedValue(recovered);
    authenticatedClient.request.mockResolvedValue(verifiedUser);
    await runtime.controller.retryRecovery();
    expect(runtime.controller.getSnapshot().state).toEqual({ status: 'authenticated', ...verifiedUser });
    expect(await runtime.localSession.readGrant(recovered.refreshToken)).toEqual(verifiedUser);
    expect(JSON.parse(runtime.readEnvelope()!).pendingRevocations).toEqual(['pending.fixture']);
  });

  it.each(['bootstrap', 'refresh'] as const)('%s converges after migrated grant write fails and preserves rotated credentials', async flow => {
    const runtime = localRuntime();
    await runtime.localSession.deferRevocation('pending.fixture', () => true);
    await runtime.localSession.saveGrant(verifiedUser, 'old.refresh', () => true);
    authApi.revokeSession.mockRejectedValue(new ApiError('network', 'offline'));
    authApi.rotateRefreshToken.mockResolvedValue(TOKEN_PAIR);
    runtime.secure.write.mockRejectedValueOnce(new Error('private local write detail'));
    if (flow === 'bootstrap') await runtime.controller.bootstrap();
    else await expect(runtime.controller.refreshAccessToken()).rejects.toMatchObject({ kind: 'storage' });
    expect(runtime.controller.getSnapshot()).toMatchObject({
      state: { status: 'storage-error', operation: 'write' }, action: 'idle', error: { kind: 'storage' },
    });
    expect(await runtime.tokens.read()).toBe(TOKEN_PAIR.refreshToken);
    expect(runtime.tokens.readAndClear).not.toHaveBeenCalled();
    expect(JSON.parse(runtime.readEnvelope()!).pendingRevocations).toEqual(['pending.fixture']);
    expect(JSON.stringify(runtime.controller.getSnapshot())).not.toContain('private');
  });

  it('attempts deferred revocation immediately after local exit without waiting for the server', async () => {
    const runtime = localRuntime(); await loginLocal(runtime);
    authApi.rotateRefreshToken.mockRejectedValue(new ApiError('network', 'offline'));
    await runtime.controller.refreshAccessToken().catch(() => undefined);
    let acknowledge!: () => void;
    const pending = new Promise<void>(resolve => { acknowledge = resolve; });
    authApi.revokeSession.mockReturnValue(pending);
    expect(await runtime.controller.leaveOffline()).toBe(true);
    expect(runtime.controller.getSnapshot().state.status).toBe('unauthenticated');
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(authApi.revokeSession).toHaveBeenCalledWith(TOKEN_PAIR.refreshToken);
    expect(JSON.parse(runtime.readEnvelope()!).pendingRevocations).toEqual([TOKEN_PAIR.refreshToken]);
    acknowledge(); await runtime.controller.drainPendingRevocations();
    expect(JSON.parse(runtime.readEnvelope()!).pendingRevocations).toEqual([]);
  });

  it('successful new sign-in drains old pending revocations and preserves the new account grant', async () => {
    const runtime = localRuntime();
    await runtime.localSession.deferRevocation('old-account.pending', () => true);
    const newUser = { userId: 'new-owner', onboardingCompletedAt: verifiedUser.onboardingCompletedAt };
    const newPair = { accessToken: 'new-access', refreshToken: 'new-owner.refresh' };
    authApi.exchangeProviderToken.mockResolvedValue(newPair);
    authenticatedClient.request.mockResolvedValue(newUser);
    await runtime.controller.signIn('GOOGLE', 'fixture.provider');
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(authApi.revokeSession).toHaveBeenCalledWith('old-account.pending');
    await runtime.controller.drainPendingRevocations();
    expect(await runtime.localSession.readGrant(newPair.refreshToken)).toEqual(newUser);
    expect(JSON.parse(runtime.readEnvelope()!).pendingRevocations).toEqual([]);
    expect(runtime.controller.getSnapshot().state).toEqual({ status: 'authenticated', ...newUser });
  });

  it('coalesces public revocation drains and never deletes pending work before server ACK', async () => {
    const runtime = localRuntime();
    await runtime.localSession.deferRevocation('pending.fixture', () => true);
    let acknowledge!: () => void;
    const pending = new Promise<void>(resolve => { acknowledge = resolve; });
    authApi.revokeSession.mockReturnValue(pending);
    const first = runtime.controller.drainPendingRevocations();
    const second = runtime.controller.drainPendingRevocations();
    expect(second).toBe(first);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(JSON.parse(runtime.readEnvelope()!).pendingRevocations).toEqual(['pending.fixture']);
    acknowledge(); await first;
    expect(authApi.revokeSession).toHaveBeenCalledTimes(1);
    expect(JSON.parse(runtime.readEnvelope()!).pendingRevocations).toEqual([]);
  });

  it('sanitizes background storage failures and allows a later drain retry', async () => {
    const runtime = localRuntime();
    await runtime.localSession.deferRevocation('pending.fixture', () => true);
    runtime.secure.read.mockRejectedValueOnce(new Error('private detail'));
    await expect(runtime.controller.drainPendingRevocations()).rejects.toMatchObject({ kind: 'storage', message: 'Secure token storage failed' });
    expect(JSON.parse(runtime.readEnvelope()!).pendingRevocations).toEqual(['pending.fixture']);
    await runtime.controller.drainPendingRevocations();
    expect(JSON.parse(runtime.readEnvelope()!).pendingRevocations).toEqual([]);
  });

  it('preserves a committed credential when initial verified profile grant storage fails', async () => {
    const runtime = localRuntime();
    await runtime.localSession.deferRevocation('pending.fixture', () => true);
    authApi.revokeSession.mockRejectedValue(new ApiError('network', 'offline'));
    authApi.rotateRefreshToken.mockResolvedValue(TOKEN_PAIR);
    authenticatedClient.request.mockResolvedValue(verifiedUser);
    runtime.secure.write.mockRejectedValueOnce(new Error('private grant detail'));
    await runtime.controller.bootstrap();
    expect(runtime.controller.getSnapshot()).toMatchObject({
      state: { status: 'storage-error', operation: 'write' }, action: 'idle', error: { kind: 'storage' },
    });
    expect(await runtime.tokens.read()).toBe(TOKEN_PAIR.refreshToken);
    expect(runtime.tokens.readAndClear).not.toHaveBeenCalled();
    expect(JSON.parse(runtime.readEnvelope()!).pendingRevocations).toEqual(['pending.fixture']);
    expect(runtime.controller.getAccessToken()).toBeNull();
  });
});

let resolveRefresh!: (pair: typeof TOKEN_PAIR) => void;
let refreshDeferred!: Promise<typeof TOKEN_PAIR>;

const tokenStore: jest.Mocked<SessionTokenStore> = {
  read: jest.fn(),
  writeIfCurrent: jest.fn(),
  readAndClear: jest.fn(),
};
const authApi: jest.Mocked<AuthApi> = {
  exchangeProviderToken: jest.fn(),
  rotateRefreshToken: jest.fn(),
  revokeSession: jest.fn().mockResolvedValue(undefined),
};
const authenticatedClient: jest.Mocked<AuthenticatedClient> = {
  request: jest.fn(),
};

let controller: SessionController;

beforeEach(() => {
  jest.clearAllMocks();
  authenticatedClient.request.mockReset();
  refreshDeferred = new Promise<typeof TOKEN_PAIR>((resolve) => {
    resolveRefresh = resolve;
  });
  authApi.rotateRefreshToken.mockReturnValue(refreshDeferred);
  authApi.revokeSession.mockResolvedValue(undefined);
  tokenStore.read.mockResolvedValue(null);
  tokenStore.writeIfCurrent.mockResolvedValue(true);
  tokenStore.readAndClear.mockResolvedValue(null);
  controller = new SessionController({
    authApi,
    authenticatedClient,
    tokenStore,
  });
});

async function authenticateCurrentUser(): Promise<void> {
  tokenStore.read.mockResolvedValue('old.secret');
  authApi.rotateRefreshToken.mockResolvedValue(TOKEN_PAIR);
  authenticatedClient.request.mockResolvedValueOnce({
    userId: 'user-1',
    onboardingCompletedAt: '2026-07-25T00:00:00.000Z',
  });
  await controller.bootstrap();
  authenticatedClient.request.mockReset();
}

it('starts in bootstrapping before the provider effect runs', () => {
  expect(controller.getSnapshot()).toEqual({
    state: { status: 'bootstrapping' },
    action: 'recovering',
    error: null,
  });
});

it('publishes profile recovery after the authenticated client rotates within the same epoch', async () => {
  const user = {
    userId: 'user-1',
    onboardingCompletedAt: '2026-07-25T00:00:00.000Z',
  };
  const fetchImpl = jest.fn()
    .mockResolvedValueOnce({ ok: false, status: 503 })
    .mockResolvedValueOnce({ ok: false, status: 401 })
    .mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify(user) });
  const http = createHttpClient({ baseUrl: 'https://api.example.invalid', fetchImpl });
  const client = createAuthenticatedClient(http, {
    getAccessToken: () => controller.getAccessToken(),
    refreshAccessToken: () => controller.refreshAccessToken(),
    onUnauthorized: () => controller.endUnauthorizedSession(),
  });
  controller = new SessionController({ authApi, authenticatedClient: client, tokenStore });
  authApi.exchangeProviderToken.mockResolvedValue(TOKEN_PAIR);
  await controller.signIn('GOOGLE', 'synthetic-provider-token');
  expect(controller.getSnapshot().state.status).toBe('offline');
  const epoch = controller.getEpoch();
  tokenStore.read.mockResolvedValue(TOKEN_PAIR.refreshToken);
  authApi.rotateRefreshToken.mockResolvedValue({
    accessToken: 'rotated-access', refreshToken: 'rotated.refresh',
  });

  await controller.retryRecovery();

  expect(controller.getSnapshot().state).toEqual({ status: 'authenticated', ...user });
  expect(controller.getSnapshot().error).toBeNull();
  expect(controller.getAccessToken()).toBe('rotated-access');
  expect(controller.getEpoch()).toBe(epoch);
  expect(tokenStore.readAndClear).not.toHaveBeenCalled();
  expect(fetchImpl).toHaveBeenCalledTimes(3);
});

it.each([401, 200])('ignores an older profile retry %s after a newer recovery succeeds', async lateStatus => {
  const user = { userId: 'user-1', onboardingCompletedAt: '2026-07-25T00:00:00.000Z' };
  let replayStarted!: () => void;
  const started = new Promise<void>(resolve => { replayStarted = resolve; });
  let settleReplay!: (response: unknown) => void;
  const oldReplay = new Promise(resolve => { settleReplay = resolve; });
  const fetchImpl = jest.fn()
    .mockResolvedValueOnce({ ok: false, status: 503 })
    .mockResolvedValueOnce({ ok: false, status: 401 })
    .mockImplementationOnce(() => { replayStarted(); return oldReplay; })
    .mockResolvedValueOnce({ ok: false, status: 401 })
    .mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify(user) });
  const http = createHttpClient({ baseUrl: 'https://api.example.invalid', fetchImpl });
  const client = createAuthenticatedClient(http, {
    getAccessToken: () => controller.getAccessToken(),
    refreshAccessToken: () => controller.refreshAccessToken(),
    onUnauthorized: () => controller.endUnauthorizedSession(),
  });
  controller = new SessionController({ authApi, authenticatedClient: client, tokenStore });
  authApi.exchangeProviderToken.mockResolvedValue(TOKEN_PAIR);
  await controller.signIn('GOOGLE', 'synthetic-provider-token');
  tokenStore.read.mockResolvedValueOnce(TOKEN_PAIR.refreshToken).mockResolvedValueOnce('first.refresh');
  authApi.rotateRefreshToken
    .mockResolvedValueOnce({ accessToken: 'first-access', refreshToken: 'first.refresh' })
    .mockResolvedValueOnce({ accessToken: 'second-access', refreshToken: 'second.refresh' });
  const firstRetry = controller.retryRecovery();
  await started;
  await controller.retryRecovery();
  expect(controller.getSnapshot().state).toEqual({ status: 'authenticated', ...user });
  settleReplay({
    ok: lateStatus === 200, status: lateStatus,
    text: async () => JSON.stringify({ ...user, onboardingCompletedAt: null }),
  });
  await firstRetry;
  expect(controller.getSnapshot().state).toEqual({ status: 'authenticated', ...user });
  expect(controller.getAccessToken()).toBe('second-access');
  expect(tokenStore.readAndClear).not.toHaveBeenCalled();
});

it.each([
  ['missing token', null, 'unauthenticated'],
  ['completed account', 'record.secret', 'authenticated'],
  ['new account', 'record.secret', 'onboarding'],
] as const)('bootstraps %s to %s', async (_label, stored, expected) => {
  tokenStore.read.mockResolvedValue(stored);
  authApi.rotateRefreshToken.mockResolvedValue(TOKEN_PAIR);
  authenticatedClient.request.mockResolvedValue({
    userId: 'user-1',
    onboardingCompletedAt:
      expected === 'authenticated' ? '2026-07-25T00:00:00.000Z' : null,
  });

  await controller.bootstrap();

  expect(controller.getSnapshot().state.status).toBe(expected);
});

it('preserves the stored token on bootstrap network failure', async () => {
  tokenStore.read.mockResolvedValue('record.secret');
  authApi.rotateRefreshToken.mockRejectedValue(
    new ApiError('network', 'Network unavailable'),
  );

  await controller.bootstrap();

  expect(controller.getSnapshot().state.status).toBe('offline');
  expect(tokenStore.readAndClear).not.toHaveBeenCalled();
});

it.each([
  new ApiError('network', 'unavailable'),
  new ApiError('http', 'unavailable', { status: 503 }),
  new ApiError('unauthorized', 'expired', { status: 401 }),
])('ignores an old bootstrap refresh failure of kind $kind after sign-in', async (error) => {
  tokenStore.read.mockResolvedValue('old.secret');
  let rejectRefresh!: (reason: unknown) => void;
  let signalRefreshStarted!: () => void;
  const refreshStarted = new Promise<void>((resolve) => { signalRefreshStarted = resolve; });
  authApi.rotateRefreshToken.mockImplementationOnce(() => {
    signalRefreshStarted();
    return new Promise((_resolve, reject) => { rejectRefresh = reject; });
  });
  const bootstrap = controller.bootstrap();
  await refreshStarted;
  authApi.exchangeProviderToken.mockResolvedValue(TOKEN_PAIR);
  authenticatedClient.request.mockResolvedValueOnce({
    userId: 'user-2',
    onboardingCompletedAt: '2026-07-25T00:00:00.000Z',
  });
  await controller.signIn('GOOGLE', 'new-provider-token');
  rejectRefresh(error);
  await bootstrap;

  expect(controller.getSnapshot().state).toMatchObject({ status: 'authenticated', userId: 'user-2' });
  expect(controller.getAccessToken()).toBe(TOKEN_PAIR.accessToken);
  expect(tokenStore.readAndClear).not.toHaveBeenCalled();
});

it('does not clear a new sign-in when an old refresh read reports no token', async () => {
  let resolveRead!: (value: string | null) => void;
  tokenStore.read.mockReturnValueOnce(new Promise((resolve) => { resolveRead = resolve; }));
  const refresh = controller.refreshAccessToken();
  authApi.exchangeProviderToken.mockResolvedValue(TOKEN_PAIR);
  authenticatedClient.request.mockResolvedValueOnce({
    userId: 'user-2',
    onboardingCompletedAt: '2026-07-25T00:00:00.000Z',
  });
  await controller.signIn('GOOGLE', 'new-provider-token');
  resolveRead(null);
  await expect(refresh).rejects.toMatchObject({ kind: 'unauthorized' });

  expect(controller.getSnapshot().state).toMatchObject({ status: 'authenticated', userId: 'user-2' });
  expect(controller.getAccessToken()).toBe(TOKEN_PAIR.accessToken);
  expect(tokenStore.readAndClear).not.toHaveBeenCalled();
  expect(authApi.rotateRefreshToken).not.toHaveBeenCalled();
});

it('logout fences a late refresh write', async () => {
  tokenStore.read.mockResolvedValue('old.secret');
  const refresh = controller.refreshAccessToken();
  const logout = controller.logout();
  resolveRefresh(TOKEN_PAIR);

  await Promise.allSettled([refresh, logout]);

  await expect(logout).resolves.toBe(true);
  expect(authApi.revokeSession).toHaveBeenCalledWith('old.secret');
  expect(authApi.revokeSession.mock.invocationCallOrder[0]).toBeLessThan(
    tokenStore.readAndClear.mock.invocationCallOrder[0],
  );
  expect(controller.getSnapshot().state.status).toBe('unauthenticated');
  expect(controller.getAccessToken()).toBeNull();
});

it('coalesces duplicate logout calls into one server revocation', async () => {
  await authenticateCurrentUser();
  let signalRevocationStarted!: () => void;
  const revocationStarted = new Promise<void>((resolve) => {
    signalRevocationStarted = resolve;
  });
  let resolveRevocation!: () => void;
  const revocationResponse = new Promise<void>((resolve) => {
      resolveRevocation = resolve;
  });
  authApi.revokeSession.mockImplementation(() => {
    signalRevocationStarted();
    return revocationResponse;
  });

  const first = controller.logout();
  const second = controller.logout();

  expect(first).toBe(second);
  await revocationStarted;
  expect(authApi.revokeSession).toHaveBeenCalledTimes(1);
  resolveRevocation();
  await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
  expect(tokenStore.readAndClear).toHaveBeenCalledTimes(1);
});

it('does not clear a newer sign-in when an old logout response arrives late', async () => {
  await authenticateCurrentUser();
  let signalRevocationStarted!: () => void;
  const revocationStarted = new Promise<void>((resolve) => {
    signalRevocationStarted = resolve;
  });
  let resolveRevocation!: () => void;
  const revocationResponse = new Promise<void>((resolve) => {
    resolveRevocation = resolve;
  });
  authApi.revokeSession.mockImplementation(() => {
    signalRevocationStarted();
    return revocationResponse;
  });
  const newerPair = {
    accessToken: 'new.header.payload.signature',
    refreshToken: 'new.record.secret',
  };
  authApi.exchangeProviderToken.mockResolvedValue(newerPair);
  authenticatedClient.request.mockResolvedValue({
    userId: 'user-2',
    onboardingCompletedAt: '2026-07-25T00:00:00.000Z',
  });

  const oldLogout = controller.logout();
  await revocationStarted;
  await controller.signIn('GOOGLE', 'new-provider-token');
  resolveRevocation();

  await expect(oldLogout).resolves.toBe(false);
  expect(tokenStore.readAndClear).not.toHaveBeenCalled();
  expect(controller.getAccessToken()).toBe(newerPair.accessToken);
  expect(controller.getSnapshot().state).toEqual({
    status: 'authenticated',
    userId: 'user-2',
    onboardingCompletedAt: '2026-07-25T00:00:00.000Z',
  });
});

it('clears the session after refresh returns 401', async () => {
  tokenStore.read.mockResolvedValue('record.secret');
  tokenStore.readAndClear.mockResolvedValue('record.secret');
  authApi.rotateRefreshToken.mockRejectedValue(
    new ApiError('unauthorized', 'expired', { status: 401 }),
  );

  await expect(controller.refreshAccessToken()).rejects.toMatchObject({
    kind: 'unauthorized',
  });

  expect(tokenStore.readAndClear).toHaveBeenCalledTimes(1);
  expect(controller.getSnapshot().state.status).toBe('unauthenticated');
});

it.each(['resolve', 'reject', 'pending'] as const)(
  'hides the account before unauthorized cleanup can %s',
  async (outcome) => {
    await authenticateCurrentUser();
    const previousEpoch = controller.getEpoch();
    let resolveClear!: (value: string | null) => void;
    let rejectClear!: (error: unknown) => void;
    const clearResponse = new Promise<string | null>((resolve, reject) => {
      resolveClear = resolve;
      rejectClear = reject;
    });
    const visibleStates: string[] = [];
    controller.subscribe(() => {
      visibleStates.push(controller.getSnapshot().state.status);
    });
    tokenStore.readAndClear.mockReturnValueOnce(clearResponse);

    const cleanup = controller.endUnauthorizedSession();

    expect(controller.getEpoch()).toBeGreaterThan(previousEpoch);
    expect(controller.getAccessToken()).toBeNull();
    expect(controller.getSnapshot()).toEqual({
      state: { status: 'bootstrapping' },
      action: 'recovering',
      error: null,
    });
    expect(visibleStates).toEqual(['bootstrapping']);
    expect(controller.endUnauthorizedSession()).toBe(cleanup);
    expect(tokenStore.readAndClear).toHaveBeenCalledTimes(1);
    if (outcome === 'pending') {
      return;
    }
    if (outcome === 'resolve') {
      resolveClear(TOKEN_PAIR.refreshToken);
    } else {
      rejectClear(new ApiError('storage', 'clear failed'));
    }
    await cleanup;
    expect(controller.getSnapshot().state).toEqual(
      outcome === 'resolve'
        ? { status: 'unauthenticated' }
        : { status: 'storage-error', operation: 'clear' },
    );
  },
);

it('fences a pending onboarding response while unauthorized cleanup is blocked', async () => {
  authApi.exchangeProviderToken.mockResolvedValue(TOKEN_PAIR);
  authenticatedClient.request.mockResolvedValueOnce({
    userId: 'user-1',
    onboardingCompletedAt: null,
  });
  await controller.signIn('GOOGLE', 'provider-token');
  let resolveCompletion!: (user: unknown) => void;
  authenticatedClient.request.mockReturnValueOnce(
    new Promise((resolve) => { resolveCompletion = resolve; }),
  );
  const completion = controller.completeOnboarding();
  tokenStore.readAndClear.mockReturnValueOnce(new Promise(() => {}));

  controller.endUnauthorizedSession();
  resolveCompletion({
    userId: 'user-1',
    onboardingCompletedAt: '2026-07-25T00:00:00.000Z',
  });
  await completion;

  expect(controller.getSnapshot().state).toEqual({ status: 'bootstrapping' });
  expect(controller.getAccessToken()).toBeNull();
});

it('shares unauthorized cleanup with a subscriber reacting to the blocking state', async () => {
  await authenticateCurrentUser();
  let reentered = false;
  let subscriberCleanup: Promise<void> | undefined;
  controller.subscribe(() => {
    if (!reentered && controller.getSnapshot().state.status === 'bootstrapping') {
      reentered = true;
      subscriberCleanup = controller.endUnauthorizedSession();
    }
  });

  const cleanup = controller.endUnauthorizedSession();
  await cleanup;

  expect(subscriberCleanup).toBe(cleanup);
  expect(tokenStore.readAndClear).toHaveBeenCalledTimes(1);
  expect(controller.getSnapshot().state).toEqual({ status: 'unauthenticated' });
});

it.each(['logout', 'delete-account'] as const)(
  'blocks account state after server %s succeeds but storage cleanup is pending',
  async (flow) => {
    await authenticateCurrentUser();
    let signalClearStarted!: () => void;
    const clearStarted = new Promise<void>((resolve) => { signalClearStarted = resolve; });
    let resolveClear!: (value: string | null) => void;
    const clearResponse = new Promise<string | null>((resolve) => { resolveClear = resolve; });
    tokenStore.readAndClear.mockImplementationOnce(() => {
      signalClearStarted();
      return clearResponse;
    });
    authenticatedClient.request.mockResolvedValueOnce(undefined);

    const operation = flow === 'logout' ? controller.logout() : controller.deleteAccount();
    await clearStarted;

    expect(controller.getAccessToken()).toBeNull();
    expect(controller.getSnapshot()).toEqual({
      state: { status: 'bootstrapping' },
      action: 'recovering',
      error: null,
    });
    resolveClear(TOKEN_PAIR.refreshToken);
    await expect(operation).resolves.toBe(true);
    expect(controller.getSnapshot().state).toEqual({ status: 'unauthenticated' });
  },
);

it('revokes a rotated pair when secure storage write fails', async () => {
  tokenStore.read.mockResolvedValue('old.secret');
  tokenStore.writeIfCurrent.mockRejectedValue(
    new ApiError('storage', 'Secure token storage failed'),
  );
  authApi.rotateRefreshToken.mockResolvedValue(TOKEN_PAIR);

  await controller.bootstrap();

  expect(authApi.revokeSession).toHaveBeenCalledWith(
    TOKEN_PAIR.refreshToken,
  );
  expect(controller.getSnapshot().state).toEqual({
    status: 'storage-error',
    operation: 'write',
  });
});

it('does not persist or authenticate a malformed login response', async () => {
  authApi.exchangeProviderToken.mockRejectedValue(
    new ApiError('protocol', 'Invalid token response'),
  );

  await controller.signIn('GOOGLE', 'provider-token');

  expect(tokenStore.writeIfCurrent).not.toHaveBeenCalled();
  expect(controller.getSnapshot().state.status).toBe('unauthenticated');
});

it('retains a storage write failure during sign-in', async () => {
  authApi.exchangeProviderToken.mockResolvedValue(TOKEN_PAIR);
  tokenStore.writeIfCurrent.mockRejectedValue(
    new ApiError('storage', 'Secure token storage failed'),
  );

  await controller.signIn('GOOGLE', 'provider-token');

  expect(controller.getSnapshot().state).toEqual({
    status: 'storage-error',
    operation: 'write',
  });
});

it('keeps the rotated token when profile loading is offline', async () => {
  tokenStore.read.mockResolvedValue('old.secret');
  tokenStore.writeIfCurrent.mockResolvedValue(true);
  authApi.rotateRefreshToken.mockResolvedValue(TOKEN_PAIR);
  authenticatedClient.request.mockRejectedValue(
    new ApiError('network', 'Network unavailable'),
  );

  await controller.bootstrap();

  expect(controller.getSnapshot().state).toEqual({
    status: 'offline',
    retry: 'profile',
  });
  expect(tokenStore.readAndClear).not.toHaveBeenCalled();
});

describe.each(['bootstrap', 'sign-in'] as const)('%s profile recovery', (flow) => {
  it.each([500, 502, 503])('preserves the session through HTTP %s and retry', async (status) => {
    tokenStore.read.mockResolvedValue('old.secret');
    authApi.rotateRefreshToken.mockResolvedValue(TOKEN_PAIR);
    authApi.exchangeProviderToken.mockResolvedValue(TOKEN_PAIR);
    authenticatedClient.request
      .mockRejectedValueOnce(new ApiError('http', 'private diagnostics', { status }))
      .mockRejectedValueOnce(new ApiError('http', 'private diagnostics', { status }))
      .mockResolvedValueOnce({
        userId: 'user-1',
        onboardingCompletedAt: '2026-07-25T00:00:00.000Z',
      });

    if (flow === 'bootstrap') {
      await controller.bootstrap();
    } else {
      await controller.signIn('GOOGLE', 'provider-token');
    }
    const epoch = controller.getEpoch();
    expect(controller.getSnapshot()).toMatchObject({
      state: { status: 'offline', retry: 'profile' },
      action: 'idle',
      error: { kind: 'http', status },
    });
    expect(controller.getSnapshot().error?.message).not.toBe('private diagnostics');
    expect(controller.getAccessToken()).toBe(TOKEN_PAIR.accessToken);
    await controller.retryRecovery();
    expect(controller.getSnapshot().state).toEqual({ status: 'offline', retry: 'profile' });
    await controller.retryRecovery();

    expect(controller.getEpoch()).toBe(epoch);
    expect(controller.getAccessToken()).toBe(TOKEN_PAIR.accessToken);
    expect(controller.getSnapshot().state).toEqual({
      status: 'authenticated',
      userId: 'user-1',
      onboardingCompletedAt: '2026-07-25T00:00:00.000Z',
    });
    expect(tokenStore.readAndClear).not.toHaveBeenCalled();
    expect(authApi.revokeSession).not.toHaveBeenCalled();
    expect(tokenStore.writeIfCurrent).toHaveBeenCalledTimes(1);
    expect(authApi.rotateRefreshToken).toHaveBeenCalledTimes(flow === 'bootstrap' ? 1 : 0);
  });
});

it.each([500, 502, 503])('ignores an old account profile HTTP %s after a new sign-in', async (status) => {
  authApi.exchangeProviderToken.mockResolvedValue(TOKEN_PAIR);
  authenticatedClient.request.mockRejectedValueOnce(new ApiError('http', 'unavailable', { status }));
  await controller.signIn('GOOGLE', 'first-provider-token');
  expect(controller.getSnapshot().state).toEqual({ status: 'offline', retry: 'profile' });
  let rejectProfile!: (error: unknown) => void;
  authenticatedClient.request.mockReturnValueOnce(new Promise((_resolve, reject) => {
    rejectProfile = reject;
  }));
  const retry = controller.retryRecovery();
  const newerPair = { accessToken: 'new.access.token', refreshToken: 'new.record.secret' };
  authApi.exchangeProviderToken.mockResolvedValueOnce(newerPair);
  authenticatedClient.request.mockResolvedValueOnce({
    userId: 'user-2',
    onboardingCompletedAt: '2026-07-25T00:00:00.000Z',
  });
  await controller.signIn('GOOGLE', 'second-provider-token');
  rejectProfile(new ApiError('http', 'unavailable', { status }));
  await retry;

  expect(controller.getSnapshot().state).toMatchObject({ status: 'authenticated', userId: 'user-2' });
  expect(controller.getAccessToken()).toBe(newerPair.accessToken);
  expect(tokenStore.readAndClear).not.toHaveBeenCalled();
});

it('does not restore a logged-out session when an obsolete profile succeeds', async () => {
  let signalProfileStarted!: () => void;
  const profileStarted = new Promise<void>((resolve) => {
    signalProfileStarted = resolve;
  });
  let resolveProfile!: (user: {
    userId: string;
    onboardingCompletedAt: string;
  }) => void;
  const profileResponse = new Promise<{
    userId: string;
    onboardingCompletedAt: string;
  }>((resolve) => {
    resolveProfile = resolve;
  });
  authApi.exchangeProviderToken.mockResolvedValue(TOKEN_PAIR);
  tokenStore.read.mockResolvedValue(TOKEN_PAIR.refreshToken);
  authenticatedClient.request.mockImplementationOnce(() => {
    signalProfileStarted();
    return profileResponse;
  });

  const signIn = controller.signIn('GOOGLE', 'provider-token');
  await profileStarted;
  await controller.logout();
  resolveProfile({
    userId: 'user-1',
    onboardingCompletedAt: '2026-07-25T00:00:00.000Z',
  });
  await signIn;

  expect(controller.getAccessToken()).toBeNull();
  expect(controller.getSnapshot()).toEqual({
    state: { status: 'unauthenticated' },
    action: 'idle',
    error: null,
  });
});

it('does not replace a newer sign-in with an obsolete profile success', async () => {
  let signalFirstProfileStarted!: () => void;
  const firstProfileStarted = new Promise<void>((resolve) => {
    signalFirstProfileStarted = resolve;
  });
  let resolveFirstProfile!: (user: {
    userId: string;
    onboardingCompletedAt: string;
  }) => void;
  const firstProfileResponse = new Promise<{
    userId: string;
    onboardingCompletedAt: string;
  }>((resolve) => {
    resolveFirstProfile = resolve;
  });
  authApi.exchangeProviderToken.mockResolvedValue(TOKEN_PAIR);
  authenticatedClient.request
    .mockImplementationOnce(() => {
      signalFirstProfileStarted();
      return firstProfileResponse;
    })
    .mockResolvedValueOnce({
      userId: 'user-2',
      onboardingCompletedAt: '2026-07-25T00:00:00.000Z',
    });

  const firstSignIn = controller.signIn('GOOGLE', 'first-provider-token');
  await firstProfileStarted;
  await controller.signIn('GOOGLE', 'second-provider-token');
  resolveFirstProfile({
    userId: 'user-1',
    onboardingCompletedAt: '2026-07-25T00:00:00.000Z',
  });
  await firstSignIn;

  expect(controller.getSnapshot().state).toEqual({
    status: 'authenticated',
    userId: 'user-2',
    onboardingCompletedAt: '2026-07-25T00:00:00.000Z',
  });
});

it('uses the canonical onboarding timestamp returned by the server', async () => {
  tokenStore.read.mockResolvedValue('old.secret');
  tokenStore.writeIfCurrent.mockResolvedValue(true);
  authApi.rotateRefreshToken.mockResolvedValue(TOKEN_PAIR);
  authenticatedClient.request
    .mockResolvedValueOnce({
      userId: 'user-1',
      onboardingCompletedAt: null,
    })
    .mockResolvedValueOnce({
      userId: 'user-1',
      onboardingCompletedAt: '2026-07-25T00:00:00.000Z',
    });

  await controller.bootstrap();
  await controller.completeOnboarding();

  expect(controller.getSnapshot().state).toEqual({
    status: 'authenticated',
    userId: 'user-1',
    onboardingCompletedAt: '2026-07-25T00:00:00.000Z',
  });
});

it('shares a pending onboarding completion with concurrent callers', async () => {
  let resolveCompletion!: (user: {
    userId: string;
    onboardingCompletedAt: string;
  }) => void;
  const completionResponse = new Promise<{
    userId: string;
    onboardingCompletedAt: string;
  }>((resolve) => {
    resolveCompletion = resolve;
  });
  tokenStore.read.mockResolvedValue('old.secret');
  authApi.rotateRefreshToken.mockResolvedValue(TOKEN_PAIR);
  authenticatedClient.request
    .mockResolvedValueOnce({
      userId: 'user-1',
      onboardingCompletedAt: null,
    })
    .mockReturnValueOnce(completionResponse);

  await controller.bootstrap();
  const firstCompletion = controller.completeOnboarding();
  const secondCompletion = controller.completeOnboarding();

  expect(firstCompletion).toBe(secondCompletion);
  expect(authenticatedClient.request).toHaveBeenCalledTimes(2);
  expect(authenticatedClient.request).toHaveBeenLastCalledWith({
    path: '/auth/me/onboarding',
    method: 'PATCH',
    validate: parseCurrentUser,
  });

  resolveCompletion({
    userId: 'user-1',
    onboardingCompletedAt: '2026-07-25T00:00:00.000Z',
  });
  await expect(Promise.all([firstCompletion, secondCompletion])).resolves.toEqual([
    undefined,
    undefined,
  ]);
  expect(controller.getSnapshot().state).toEqual({
    status: 'authenticated',
    userId: 'user-1',
    onboardingCompletedAt: '2026-07-25T00:00:00.000Z',
  });
});

it('does not share an obsolete onboarding completion with a newer session', async () => {
  let resolveFirstCompletion!: (user: {
    userId: string;
    onboardingCompletedAt: string;
  }) => void;
  const firstCompletionResponse = new Promise<{
    userId: string;
    onboardingCompletedAt: string;
  }>((resolve) => {
    resolveFirstCompletion = resolve;
  });
  const secondTokenPair = {
    accessToken: 'second.header.payload.signature',
    refreshToken: 'second.record.secret',
  };
  tokenStore.read.mockResolvedValue('old.secret');
  authApi.rotateRefreshToken.mockResolvedValue(TOKEN_PAIR);
  authApi.exchangeProviderToken.mockResolvedValue(secondTokenPair);
  authenticatedClient.request
    .mockResolvedValueOnce({
      userId: 'user-1',
      onboardingCompletedAt: null,
    })
    .mockReturnValueOnce(firstCompletionResponse)
    .mockResolvedValueOnce({
      userId: 'user-2',
      onboardingCompletedAt: null,
    })
    .mockResolvedValueOnce({
      userId: 'user-2',
      onboardingCompletedAt: '2026-07-25T00:00:00.000Z',
    });

  await controller.bootstrap();
  const firstCompletion = controller.completeOnboarding();
  await controller.logout();
  await controller.signIn('GOOGLE', 'second-provider-token');
  const secondCompletion = controller.completeOnboarding();

  expect(secondCompletion).not.toBe(firstCompletion);
  expect(authenticatedClient.request).toHaveBeenCalledTimes(4);
  expect(authenticatedClient.request).toHaveBeenLastCalledWith({
    path: '/auth/me/onboarding',
    method: 'PATCH',
    validate: parseCurrentUser,
  });
  await secondCompletion;
  resolveFirstCompletion({
    userId: 'user-1',
    onboardingCompletedAt: '2026-07-25T00:00:00.000Z',
  });
  await firstCompletion;

  expect(controller.getSnapshot().state).toEqual({
    status: 'authenticated',
    userId: 'user-2',
    onboardingCompletedAt: '2026-07-25T00:00:00.000Z',
  });
});

it.each([
  ['network', new ApiError('network', 'diagnostic-network-message', { status: 503 })],
  ['timeout', new ApiError('timeout', 'diagnostic-timeout-message')],
  ['HTTP 500', new ApiError('http', 'diagnostic-http-message', { status: 500 })],
  ['HTTP 502', new ApiError('http', 'diagnostic-http-message', { status: 502 })],
  ['HTTP 503', new ApiError('http', 'diagnostic-http-message', { status: 503 })],
] as const)(
  'keeps onboarding retryable after a %s completion failure',
  async (_kind, error) => {
    tokenStore.read.mockResolvedValue('old.secret');
    authApi.rotateRefreshToken.mockResolvedValue(TOKEN_PAIR);
    authenticatedClient.request
      .mockResolvedValueOnce({
        userId: 'user-1',
        onboardingCompletedAt: null,
      })
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce({
        userId: 'user-1',
        onboardingCompletedAt: '2026-07-25T00:00:00.000Z',
      });

    await controller.bootstrap();
    await controller.completeOnboarding();

    expect(controller.getSnapshot().state).toEqual({
      status: 'onboarding',
      userId: 'user-1',
      onboardingCompletedAt: null,
    });
    expect(controller.getSnapshot().action).toBe('idle');
    expect(controller.getSnapshot().error).toMatchObject({
      kind: error.kind,
      message:
        error.kind === 'network'
          ? 'Network unavailable'
          : error.kind === 'timeout'
            ? 'Request timed out'
            : 'Session request failed',
      status: error.status,
    });
    expect(controller.getSnapshot().error).not.toMatchObject({
      message: error.message,
    });
    expect(controller.getSnapshot().error?.cause).toBeUndefined();
    expect(controller.getAccessToken()).toBe(TOKEN_PAIR.accessToken);
    expect(tokenStore.readAndClear).not.toHaveBeenCalled();

    await controller.completeOnboarding();

    expect(authenticatedClient.request).toHaveBeenCalledTimes(3);
    expect(authenticatedClient.request).toHaveBeenLastCalledWith({
      path: '/auth/me/onboarding',
      method: 'PATCH',
      validate: parseCurrentUser,
    });
    expect(controller.getSnapshot().state).toEqual({
      status: 'authenticated',
      userId: 'user-1',
      onboardingCompletedAt: '2026-07-25T00:00:00.000Z',
    });
  },
);

it('does not publish a late onboarding completion after logout', async () => {
  tokenStore.read.mockResolvedValue('old.secret');
  authApi.rotateRefreshToken.mockResolvedValue(TOKEN_PAIR);
  let resolveCompletion!: (user: {
    userId: string;
    onboardingCompletedAt: string;
  }) => void;
  const completionResponse = new Promise<{
    userId: string;
    onboardingCompletedAt: string;
  }>((resolve) => {
    resolveCompletion = resolve;
  });
  authenticatedClient.request
    .mockResolvedValueOnce({
      userId: 'user-1',
      onboardingCompletedAt: null,
    })
    .mockReturnValueOnce(completionResponse);

  await controller.bootstrap();
  const completion = controller.completeOnboarding();

  expect(authenticatedClient.request).toHaveBeenCalledTimes(2);
  await controller.logout();
  resolveCompletion({
    userId: 'user-1',
    onboardingCompletedAt: '2026-07-25T00:00:00.000Z',
  });
  await completion;

  expect(controller.getAccessToken()).toBeNull();
  expect(controller.getSnapshot()).toEqual({
    state: { status: 'unauthenticated' },
    action: 'idle',
    error: null,
  });
});

it.each(['pending', 'cleanup-subscriber'] as const)('prevents new rotation during online logout %s', async entry => {
  await authenticateCurrentUser();
  tokenStore.read.mockResolvedValue(TOKEN_PAIR.refreshToken);
  tokenStore.readAndClear.mockResolvedValue(TOKEN_PAIR.refreshToken);
  let finishRevoke!: () => void;
  authApi.revokeSession.mockReturnValue(new Promise<void>(resolve => { finishRevoke = resolve; }));
  const before = authApi.rotateRefreshToken.mock.calls.length;
  let forbidden: Promise<unknown> | undefined;
  if (entry === 'cleanup-subscriber') controller.subscribe(() => {
    if (controller.getSnapshot().state.status === 'bootstrapping')
      forbidden = controller.refreshAccessToken().catch(() => undefined);
  });
  const logout = controller.logout();
  if (entry === 'pending') forbidden = controller.refreshAccessToken().catch(() => undefined);
  finishRevoke();
  expect(await logout).toBe(true);
  await forbidden;
  expect(authApi.rotateRefreshToken.mock.calls.length).toBe(before);
  expect(controller.getAccessToken()).toBeNull();
  expect(controller.getSnapshot().state.status).toBe('unauthenticated');
});

it('keeps the authenticated session retryable when server revocation is offline', async () => {
  await authenticateCurrentUser();
  authApi.revokeSession.mockRejectedValue(
    new ApiError('network', 'diagnostic-network-message'),
  );

  await expect(controller.logout()).resolves.toBe(false);

  expect(authApi.revokeSession).toHaveBeenCalledWith('old.secret');
  expect(tokenStore.readAndClear).not.toHaveBeenCalled();
  expect(controller.getAccessToken()).toBe(TOKEN_PAIR.accessToken);
  expect(controller.getSnapshot()).toEqual({
    state: {
      status: 'authenticated',
      userId: 'user-1',
      onboardingCompletedAt: '2026-07-25T00:00:00.000Z',
    },
    action: 'idle',
    error: expect.objectContaining({
      kind: 'network',
      message: 'Network unavailable',
    }),
  });
  expect(controller.getSnapshot().error?.message).not.toBe(
    'diagnostic-network-message',
  );
});

it('blocks in storage-error when local clear cannot be verified', async () => {
  tokenStore.read.mockResolvedValue('record.secret');
  tokenStore.readAndClear.mockRejectedValue(
    new ApiError('storage', 'Secure token storage failed'),
  );

  await expect(controller.logout()).resolves.toBe(false);

  expect(authApi.revokeSession).toHaveBeenCalledWith('record.secret');
  expect(controller.getAccessToken()).toBeNull();
  expect(controller.getSnapshot().state).toEqual({
    status: 'storage-error',
    operation: 'clear',
  });
});

it('revokes and never publishes a pair whose storage epoch is stale', async () => {
  tokenStore.read.mockResolvedValue('old.secret');
  tokenStore.writeIfCurrent.mockResolvedValue(false);
  authApi.rotateRefreshToken.mockResolvedValue(TOKEN_PAIR);

  await controller.bootstrap();

  expect(authApi.revokeSession).toHaveBeenCalledWith(
    TOKEN_PAIR.refreshToken,
  );
  expect(controller.getAccessToken()).toBeNull();
});

it('persists a successful sign-in before loading the authenticated profile', async () => {
  authApi.exchangeProviderToken.mockResolvedValue(TOKEN_PAIR);
  authenticatedClient.request.mockResolvedValue({
    userId: 'user-1',
    onboardingCompletedAt: '2026-07-25T00:00:00.000Z',
  });

  await controller.signIn('GOOGLE', 'provider-token');

  expect(tokenStore.writeIfCurrent).toHaveBeenCalledWith(
    TOKEN_PAIR.refreshToken,
    controller.getEpoch(),
  );
  expect(authenticatedClient.request).toHaveBeenCalledWith({
    path: '/auth/me',
    validate: parseCurrentUser,
  });
  expect(controller.getSnapshot().state).toEqual({
    status: 'authenticated',
    userId: 'user-1',
    onboardingCompletedAt: '2026-07-25T00:00:00.000Z',
  });
});

it('coalesces concurrent refreshes into one token rotation', async () => {
  tokenStore.read.mockResolvedValue('old.secret');
  const first = controller.refreshAccessToken();
  const second = controller.refreshAccessToken();
  resolveRefresh(TOKEN_PAIR);

  await expect(Promise.all([first, second])).resolves.toEqual([
    TOKEN_PAIR.accessToken,
    TOKEN_PAIR.accessToken,
  ]);

  expect(authApi.rotateRefreshToken).toHaveBeenCalledTimes(1);
});

it('retries a profile recovery without rotating the already committed token', async () => {
  tokenStore.read.mockResolvedValue('old.secret');
  authApi.rotateRefreshToken.mockResolvedValue(TOKEN_PAIR);
  authenticatedClient.request
    .mockRejectedValueOnce(new ApiError('network', 'Network unavailable'))
    .mockResolvedValueOnce({
      userId: 'user-1',
      onboardingCompletedAt: null,
    });

  await controller.bootstrap();
  await controller.retryRecovery();

  expect(authApi.rotateRefreshToken).toHaveBeenCalledTimes(1);
  expect(controller.getSnapshot().state).toEqual({
    status: 'onboarding',
    userId: 'user-1',
    onboardingCompletedAt: null,
  });
});

it('clears an unreadable refresh record before reporting bootstrap recovery', async () => {
  tokenStore.read.mockRejectedValue(
    new ApiError('storage', 'Secure token storage failed'),
  );
  tokenStore.readAndClear.mockResolvedValue('record.secret');

  await controller.bootstrap();

  expect(tokenStore.readAndClear).toHaveBeenCalledTimes(1);
  expect(controller.getSnapshot().state).toEqual({
    status: 'unauthenticated',
  });
});

it('blocks in clear storage-error when an unreadable refresh record cannot be cleared', async () => {
  tokenStore.read.mockRejectedValue(
    new ApiError('storage', 'Secure token storage failed'),
  );
  tokenStore.readAndClear.mockRejectedValue(
    new ApiError('storage', 'Secure token storage failed'),
  );

  await controller.bootstrap();

  expect(tokenStore.readAndClear).toHaveBeenCalledTimes(1);
  expect(controller.getSnapshot().state).toEqual({
    status: 'storage-error',
    operation: 'clear',
  });
});

it.each([
  ['network', new ApiError('network', 'Network unavailable')],
  ['timeout', new ApiError('timeout', 'Request timed out')],
] as const)(
  'settles a direct %s refresh as retryable without clearing its stored token',
  async (_kind, error) => {
    tokenStore.read.mockResolvedValue('record.secret');
    authApi.rotateRefreshToken.mockRejectedValue(error);

    await expect(controller.refreshAccessToken()).rejects.toMatchObject({
      kind: error.kind,
    });

    expect(controller.getSnapshot().state).toEqual({
      status: 'offline',
      retry: 'bootstrap',
    });
    expect(controller.getSnapshot().action).toBe('idle');
    expect(tokenStore.readAndClear).not.toHaveBeenCalled();
  },
);

it('does not clear a newer sign-in after replay 401 cleanup already finished', async () => {
  const NEW_TOKEN_PAIR = {
    accessToken: 'new.header.payload.signature',
    refreshToken: 'new.record.secret',
  };
  tokenStore.read.mockResolvedValue('old.record.secret');
  tokenStore.readAndClear.mockResolvedValue('old.record.secret');
  authApi.rotateRefreshToken.mockResolvedValue(TOKEN_PAIR);
  authApi.exchangeProviderToken.mockResolvedValue(NEW_TOKEN_PAIR);
  authenticatedClient.request
    .mockImplementationOnce(async () => {
      await controller.endUnauthorizedSession();
      await controller.signIn('GOOGLE', 'provider-token');
      throw new ApiError('unauthorized', 'Access token revoked', {
        status: 401,
      });
    })
    .mockResolvedValueOnce({
      userId: 'user-2',
      onboardingCompletedAt: '2026-07-25T00:00:00.000Z',
    });

  await controller.bootstrap();

  expect(tokenStore.readAndClear).toHaveBeenCalledTimes(1);
  expect(controller.getAccessToken()).toBe(NEW_TOKEN_PAIR.accessToken);
  expect(controller.getSnapshot().state).toEqual({
    status: 'authenticated',
    userId: 'user-2',
    onboardingCompletedAt: '2026-07-25T00:00:00.000Z',
  });
});

it.each([
  ['authenticated', '2026-07-25T00:00:00.000Z'],
  ['offline profile', undefined],
] as const)(
  'does not PATCH onboarding outside the %s state',
  async (_label, onboardingCompletedAt) => {
    tokenStore.read.mockResolvedValue('record.secret');
    authApi.rotateRefreshToken.mockResolvedValue(TOKEN_PAIR);
    if (onboardingCompletedAt === undefined) {
      authenticatedClient.request.mockRejectedValue(
        new ApiError('network', 'Network unavailable'),
      );
    } else {
      authenticatedClient.request.mockResolvedValue({
        userId: 'user-1',
        onboardingCompletedAt,
      });
    }

    await controller.bootstrap();
    await controller.completeOnboarding();

    expect(authenticatedClient.request).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().action).toBe('idle');
  },
);

it.each(['bootstrap', 'sign-in'] as const)(
  'best-effort revokes the issued pair after a malformed %s profile',
  async (flow) => {
    tokenStore.read.mockResolvedValue('old.record.secret');
    tokenStore.readAndClear.mockResolvedValue(TOKEN_PAIR.refreshToken);
    authApi.rotateRefreshToken.mockResolvedValue(TOKEN_PAIR);
    authApi.exchangeProviderToken.mockResolvedValue(TOKEN_PAIR);
    authenticatedClient.request.mockRejectedValue(
      new ApiError('protocol', 'Invalid current user response'),
    );

    if (flow === 'bootstrap') {
      await controller.bootstrap();
    } else {
      await controller.signIn('GOOGLE', 'provider-token');
    }

    expect(authApi.revokeSession).toHaveBeenCalledWith(
      TOKEN_PAIR.refreshToken,
    );
    expect(controller.getSnapshot().state.status).toBe('unauthenticated');
  },
);

it('keeps local malformed-profile cleanup successful when server revoke is offline', async () => {
  tokenStore.read.mockResolvedValue('old.record.secret');
  tokenStore.readAndClear.mockResolvedValue(TOKEN_PAIR.refreshToken);
  authApi.rotateRefreshToken.mockResolvedValue(TOKEN_PAIR);
  authenticatedClient.request.mockRejectedValue(
    new ApiError('protocol', 'Invalid current user response'),
  );
  authApi.revokeSession.mockRejectedValue(
    new ApiError('network', 'Network unavailable'),
  );

  await controller.bootstrap();

  expect(authApi.revokeSession).toHaveBeenCalledWith(
    TOKEN_PAIR.refreshToken,
  );
  expect(controller.getSnapshot().state.status).toBe('unauthenticated');
});

it('deletes the authenticated account before clearing the local session', async () => {
  await authenticateCurrentUser();
  tokenStore.readAndClear.mockResolvedValue('record.secret');
  authenticatedClient.request.mockResolvedValue(undefined);

  await expect(controller.deleteAccount()).resolves.toBe(true);

  expect(authenticatedClient.request).toHaveBeenCalledWith({
    path: '/auth/me',
    method: 'DELETE',
    responseMode: 'empty',
  });
  expect(tokenStore.readAndClear).toHaveBeenCalledTimes(1);
  expect(controller.getAccessToken()).toBeNull();
  expect(controller.getSnapshot()).toEqual({
    state: { status: 'unauthenticated' },
    action: 'idle',
    error: null,
  });
});

it('shares one pending account deletion between duplicate callers', async () => {
  await authenticateCurrentUser();
  let resolveDeletion!: () => void;
  const deletionResponse = new Promise<void>((resolve) => {
    resolveDeletion = resolve;
  });
  authenticatedClient.request.mockReturnValue(deletionResponse);

  const first = controller.deleteAccount();
  const second = controller.deleteAccount();

  expect(first).toBe(second);
  expect(controller.getSnapshot().action).toBe('deleting-account');
  expect(authenticatedClient.request).toHaveBeenCalledTimes(1);

  resolveDeletion();
  await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
});

it('keeps sharing the deletion while confirmed server success is clearing storage', async () => {
  await authenticateCurrentUser();
  let signalClearStarted!: () => void;
  const clearStarted = new Promise<void>((resolve) => {
    signalClearStarted = resolve;
  });
  let resolveClear!: () => void;
  const clearGate = new Promise<void>((resolve) => {
    resolveClear = resolve;
  });
  authenticatedClient.request.mockResolvedValue(undefined);
  tokenStore.readAndClear.mockImplementation(async () => {
    signalClearStarted();
    await clearGate;
    return 'record.secret';
  });

  const first = controller.deleteAccount();
  await clearStarted;
  const second = controller.deleteAccount();

  expect(second).toBe(first);
  expect(authenticatedClient.request).toHaveBeenCalledTimes(1);

  resolveClear();
  await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
});

it.each([
  ['network', new ApiError('network', 'diagnostic-network-message')],
  ['timeout', new ApiError('timeout', 'diagnostic-timeout-message')],
  ['http', new ApiError('http', 'diagnostic-http-message', { status: 503 })],
] as const)(
  'keeps the current session after a %s account deletion failure',
  async (_kind, error) => {
    await authenticateCurrentUser();
    authenticatedClient.request.mockRejectedValue(error);

    await expect(controller.deleteAccount()).resolves.toBe(false);

    expect(controller.getSnapshot().state.status).toBe('authenticated');
    expect(controller.getSnapshot().action).toBe('idle');
    expect(controller.getSnapshot().error).toMatchObject({
      kind: error.kind,
      status: error.status,
    });
    expect(controller.getSnapshot().error?.message).not.toBe(error.message);
    expect(controller.getAccessToken()).toBe(TOKEN_PAIR.accessToken);
    expect(tokenStore.readAndClear).not.toHaveBeenCalled();
  },
);

it('reports a clear recovery state after confirmed server deletion', async () => {
  await authenticateCurrentUser();
  authenticatedClient.request.mockResolvedValue(undefined);
  tokenStore.readAndClear.mockRejectedValue(
    new ApiError('storage', 'diagnostic-storage-message'),
  );

  await expect(controller.deleteAccount()).resolves.toBe(true);

  expect(controller.getAccessToken()).toBeNull();
  expect(controller.getSnapshot().state).toEqual({
    status: 'storage-error',
    operation: 'clear',
  });
});

it('fences a late refresh after confirmed account deletion', async () => {
  await authenticateCurrentUser();
  tokenStore.read.mockResolvedValue('record.secret');
  authApi.rotateRefreshToken.mockReturnValue(refreshDeferred);
  authenticatedClient.request.mockResolvedValue(undefined);

  const refresh = controller.refreshAccessToken();
  await expect(controller.deleteAccount()).resolves.toBe(true);
  resolveRefresh(TOKEN_PAIR);
  await Promise.allSettled([refresh]);

  expect(controller.getAccessToken()).toBeNull();
  expect(controller.getSnapshot().state.status).toBe('unauthenticated');
});

it('does not coalesce new account unauthorized cleanup with an older pending revocation', async () => {
  let credential: string | null = null;
  let raw: string | null = null;
  let current!: SessionController;
  const localSession = new LocalSessionStore({ read: async () => raw, write: async value => { raw = value; } });
  const coordinator = new TokenStoreCoordinator({ read: async () => credential,
    write: async value => { credential = value; }, clear: async () => { credential = null; } }, () => current.getEpoch());
  current = new SessionController({ authApi, authenticatedClient, tokenStore: coordinator, localSession });
  let release!: () => void; let started!: () => void;
  const revocation = new Promise<void>(resolve => { release = resolve; });
  const revoking = new Promise<void>(resolve => { started = resolve; });
  authApi.revokeSession.mockImplementationOnce(async () => { started(); await revocation; });
  authApi.exchangeProviderToken.mockResolvedValue(TOKEN_PAIR);
  authenticatedClient.request.mockRejectedValueOnce(new ApiError('protocol', 'Invalid profile response'));
  const oldLogin = current.signIn('GOOGLE', 'synthetic-a');
  await revoking;
  const nextPair = { accessToken: 'b.access', refreshToken: 'b.refresh' };
  const nextUser = { userId: 'owner-b', onboardingCompletedAt: '2026-01-01T00:00:00.000Z' };
  authApi.exchangeProviderToken.mockResolvedValue(nextPair);
  authenticatedClient.request.mockResolvedValue(nextUser);
  await current.signIn('GOOGLE', 'synthetic-b');
  const cleanup = jest.spyOn(current, 'endUnauthorizedSession');
  authApi.rotateRefreshToken.mockRejectedValue(new ApiError('unauthorized', 'revoked'));
  const denied = current.refreshAccessToken().catch(() => undefined);
  for (let turn = 0; turn < 50 && cleanup.mock.calls.length === 0; turn++) await Promise.resolve();
  expect(cleanup).toHaveBeenCalled();
  release(); await Promise.all([oldLogin, denied]);
  expect(credential).toBeNull();
  expect(current.getAccessToken()).toBeNull();
  expect(current.getSnapshot().state.status).toBe('unauthenticated');
  expect(await localSession.readGrant(nextPair.refreshToken)).toBeNull();
});

it.each(['logout', 'delete', 'unauthorized'] as const)('preserves a new login begun by the %s cleanup subscriber', async method => {
  let credential: string | null = null;
  let raw: string | null = null;
  let current!: SessionController;
  const localSession = new LocalSessionStore({ read: async () => raw, write: async value => { raw = value; } });
  const coordinator = new TokenStoreCoordinator({ read: async () => credential,
    write: async value => { credential = value; }, clear: async () => { credential = null; } }, () => current.getEpoch());
  current = new SessionController({ authApi, authenticatedClient, tokenStore: coordinator, localSession });
  authApi.exchangeProviderToken.mockResolvedValue(TOKEN_PAIR);
  authenticatedClient.request.mockResolvedValue({ userId: 'owner-a', onboardingCompletedAt: '2026-01-01T00:00:00.000Z' });
  await current.signIn('GOOGLE', 'synthetic-a');
  const nextPair = { accessToken: 'next.access', refreshToken: 'next.refresh' };
  const nextUser = { userId: 'owner-b', onboardingCompletedAt: '2026-01-01T00:00:00.000Z' };
  authApi.exchangeProviderToken.mockResolvedValue(nextPair);
  authenticatedClient.request.mockResolvedValue(nextUser);
  authApi.revokeSession.mockResolvedValue(undefined);
  let nextLogin: Promise<void> | undefined;
  const unsubscribe = current.subscribe(() => {
    if (current.getSnapshot().state.status === 'bootstrapping' && !nextLogin) {
      unsubscribe();
      nextLogin = current.signIn('GOOGLE', 'synthetic-b');
    }
  });
  if (method === 'logout') await current.logout();
  else if (method === 'delete') await current.deleteAccount();
  else await current.endUnauthorizedSession();
  await nextLogin;
  expect(credential).toBe(nextPair.refreshToken);
  expect(current.getAccessToken()).toBe(nextPair.accessToken);
  expect(current.getSnapshot().state).toEqual({ status: 'authenticated', ...nextUser });
  expect(await localSession.readGrant(nextPair.refreshToken)).toEqual(nextUser);
});

it.each(['refresh', 'bootstrap'] as const)('blocks %s only after account deletion server success', async method => {
  await authenticateCurrentUser();
  authenticatedClient.request.mockResolvedValue(undefined);
  authApi.rotateRefreshToken.mockClear();
  let recovery: Promise<unknown> | undefined;
  const unsubscribe = controller.subscribe(() => {
    if (controller.getSnapshot().state.status === 'bootstrapping' && !recovery) {
      unsubscribe();
      recovery = (method === 'refresh' ? controller.refreshAccessToken() : controller.bootstrap()).catch(() => undefined);
    }
  });
  await controller.deleteAccount();
  await recovery;
  expect(authApi.rotateRefreshToken).not.toHaveBeenCalled();
  expect(controller.getAccessToken()).toBeNull();
});

it.each(['refresh', 'bootstrap', 'retry'] as const)('does not start %s during unauthorized cleanup publication', async method => {
  await authenticateCurrentUser();
  authApi.rotateRefreshToken.mockClear();
  let recovery: Promise<unknown> | undefined;
  const unsubscribe = controller.subscribe(() => {
    if (controller.getSnapshot().state.status === 'bootstrapping' && !recovery) {
      unsubscribe();
      recovery = (method === 'refresh' ? controller.refreshAccessToken() : method === 'bootstrap' ? controller.bootstrap() : controller.retryRecovery()).catch(() => undefined);
    }
  });
  await controller.endUnauthorizedSession();
  await recovery;
  expect(authApi.rotateRefreshToken).not.toHaveBeenCalled();
  expect(controller.getAccessToken()).toBeNull();
  expect(controller.getSnapshot().state.status).toBe('unauthenticated');
});

it('does not clear a newer session when an old account deletion finishes late', async () => {
  await authenticateCurrentUser();
  let resolveDeletion!: () => void;
  const deletionResponse = new Promise<void>((resolve) => {
    resolveDeletion = resolve;
  });
  const newerPair = {
    accessToken: 'new.header.payload.signature',
    refreshToken: 'new.record.secret',
  };
  authenticatedClient.request
    .mockReturnValueOnce(deletionResponse)
    .mockResolvedValueOnce({
      userId: 'user-2',
      onboardingCompletedAt: '2026-07-25T00:00:00.000Z',
    });
  authApi.exchangeProviderToken.mockResolvedValue(newerPair);

  const deletion = controller.deleteAccount();
  await controller.signIn('GOOGLE', 'new-provider-token');
  resolveDeletion();

  await expect(deletion).resolves.toBe(false);
  expect(tokenStore.readAndClear).not.toHaveBeenCalled();
  expect(controller.getAccessToken()).toBe(newerPair.accessToken);
  expect(controller.getSnapshot().state).toEqual({
    status: 'authenticated',
    userId: 'user-2',
    onboardingCompletedAt: '2026-07-25T00:00:00.000Z',
  });
});

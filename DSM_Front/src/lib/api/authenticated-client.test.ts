import { createAuthenticatedClient } from './authenticated-client';
import { ApiError } from './api-error';
import { HttpClient, HttpRequest } from './http-client';

type Deferred<T> = {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

it('injects the current token while preserving every other request field', async () => {
  const request = jest.fn().mockResolvedValue({ id: 7 });
  const http: HttpClient = { request };
  const validate = (value: unknown) => value as { id: number };
  const client = createAuthenticatedClient(http, {
    getAccessToken: () => 'current-token',
    refreshAccessToken: jest.fn(),
    onUnauthorized: jest.fn(),
  });

  await expect(
    client.request({
      path: '/tasks/7',
      method: 'PATCH',
      body: { completed: true },
      accessToken: 'caller-token',
      responseMode: 'json',
      validate,
      timeoutMs: 4_000,
    }),
  ).resolves.toEqual({ id: 7 });

  expect(request).toHaveBeenCalledWith({
    path: '/tasks/7',
    method: 'PATCH',
    body: { completed: true },
    accessToken: 'current-token',
    responseMode: 'json',
    validate,
    timeoutMs: 4_000,
  });
});

it('coalesces concurrent initial 401 recovery and replays each request once', async () => {
  const initialFailure = createDeferred<never>();
  const refresh = createDeferred<string>();
  const refreshStarted = createDeferred<void>();
  const request = jest.fn();
  request.mockImplementation((httpRequest: HttpRequest<unknown>) => {
    if (httpRequest.accessToken === 'expired-token') {
      return initialFailure.promise;
    }
    if (httpRequest.path === '/one') {
      return Promise.resolve({ id: 1 });
    }
    return Promise.resolve({ id: 2 });
  });
  const http: HttpClient = { request };
  const refreshAccessToken = jest.fn(() => {
    refreshStarted.resolve();
    return refresh.promise;
  });
  const client = createAuthenticatedClient(http, {
    getAccessToken: () => 'expired-token',
    refreshAccessToken,
    onUnauthorized: jest.fn(),
  });

  const first = client.request({
    path: '/one',
    method: 'POST',
    body: { source: 'first' },
    accessToken: 'caller-one',
  });
  const second = client.request({
    path: '/two',
    method: 'DELETE',
    accessToken: 'caller-two',
    timeoutMs: 2_000,
  });

  initialFailure.reject(
    new ApiError('unauthorized', 'Access token expired', { status: 401 }),
  );
  await refreshStarted.promise;

  expect(refreshAccessToken).toHaveBeenCalledTimes(1);
  expect(request).toHaveBeenCalledTimes(2);

  refresh.resolve('refreshed-token');

  await expect(Promise.all([first, second])).resolves.toEqual([
    { id: 1 },
    { id: 2 },
  ]);
  expect(refreshAccessToken).toHaveBeenCalledTimes(1);
  expect(request).toHaveBeenCalledTimes(4);
  expect(request).toHaveBeenNthCalledWith(1, {
    path: '/one',
    method: 'POST',
    body: { source: 'first' },
    accessToken: 'expired-token',
  });
  expect(request).toHaveBeenNthCalledWith(2, {
    path: '/two',
    method: 'DELETE',
    accessToken: 'expired-token',
    timeoutMs: 2_000,
  });
  expect(request).toHaveBeenNthCalledWith(3, {
    path: '/one',
    method: 'POST',
    body: { source: 'first' },
    accessToken: 'refreshed-token',
  });
  expect(request).toHaveBeenNthCalledWith(4, {
    path: '/two',
    method: 'DELETE',
    accessToken: 'refreshed-token',
    timeoutMs: 2_000,
  });
});

it('awaits session end and rethrows when the single replay also returns 401', async () => {
  const initialError = new ApiError('unauthorized', 'Access token expired', {
    status: 401,
  });
  const replayError = new ApiError('unauthorized', 'Access token revoked', {
    status: 401,
  });
  const sessionEnd = createDeferred<void>();
  const sessionEndStarted = createDeferred<void>();
  const request = jest
    .fn()
    .mockRejectedValueOnce(initialError)
    .mockRejectedValueOnce(replayError);
  const http: HttpClient = { request };
  const refreshAccessToken = jest.fn().mockResolvedValue('refreshed-token');
  const onUnauthorized = jest.fn(() => {
    sessionEndStarted.resolve();
    return sessionEnd.promise;
  });
  const client = createAuthenticatedClient(http, {
    getAccessToken: () => 'expired-token',
    refreshAccessToken,
    onUnauthorized,
  });
  const outcome = client.request({ path: '/one', accessToken: 'caller-token' });
  let settled = false;
  void outcome.catch(() => {
    settled = true;
  });

  await sessionEndStarted.promise;

  expect(settled).toBe(false);
  expect(request).toHaveBeenCalledTimes(2);
  expect(request).toHaveBeenLastCalledWith({
    path: '/one',
    accessToken: 'refreshed-token',
  });
  expect(refreshAccessToken).toHaveBeenCalledTimes(1);
  expect(onUnauthorized).toHaveBeenCalledTimes(1);

  sessionEnd.resolve();

  await expect(outcome).rejects.toBe(replayError);
});

it.each([
  ['network', new ApiError('network', 'Network unavailable')],
  ['timeout', new ApiError('timeout', 'Request timed out')],
  ['non-ApiError', new Error('Unexpected failure')],
] as const)('rethrows an initial %s failure without refreshing', async (_, error) => {
  const request = jest.fn().mockRejectedValue(error);
  const http: HttpClient = { request };
  const refreshAccessToken = jest.fn();
  const onUnauthorized = jest.fn();
  const client = createAuthenticatedClient(http, {
    getAccessToken: () => 'current-token',
    refreshAccessToken,
    onUnauthorized,
  });

  await expect(client.request({ path: '/one' })).rejects.toBe(error);

  expect(request).toHaveBeenCalledTimes(1);
  expect(refreshAccessToken).not.toHaveBeenCalled();
  expect(onUnauthorized).not.toHaveBeenCalled();
});

it('rethrows a non-401 replay failure without a second refresh or session end', async () => {
  const initialError = new ApiError('unauthorized', 'Access token expired', {
    status: 401,
  });
  const replayError = new ApiError('network', 'Network unavailable');
  const request = jest
    .fn()
    .mockRejectedValueOnce(initialError)
    .mockRejectedValueOnce(replayError);
  const http: HttpClient = { request };
  const refreshAccessToken = jest.fn().mockResolvedValue('refreshed-token');
  const onUnauthorized = jest.fn();
  const client = createAuthenticatedClient(http, {
    getAccessToken: () => 'expired-token',
    refreshAccessToken,
    onUnauthorized,
  });

  await expect(client.request({ path: '/one' })).rejects.toBe(replayError);

  expect(request).toHaveBeenCalledTimes(2);
  expect(refreshAccessToken).toHaveBeenCalledTimes(1);
  expect(onUnauthorized).not.toHaveBeenCalled();
});

it('propagates a refresh callback failure unchanged', async () => {
  const initialError = new ApiError('unauthorized', 'Access token expired', {
    status: 401,
  });
  const refreshError = new Error('Refresh unavailable');
  const request = jest.fn().mockRejectedValue(initialError);
  const http: HttpClient = { request };
  const refreshAccessToken = jest.fn().mockRejectedValue(refreshError);
  const onUnauthorized = jest.fn();
  const client = createAuthenticatedClient(http, {
    getAccessToken: () => 'expired-token',
    refreshAccessToken,
    onUnauthorized,
  });

  await expect(client.request({ path: '/one' })).rejects.toBe(refreshError);

  expect(request).toHaveBeenCalledTimes(1);
  expect(refreshAccessToken).toHaveBeenCalledTimes(1);
  expect(onUnauthorized).not.toHaveBeenCalled();
});

it('returns a delayed account A 401 without recovery after switching to account B', async () => {
  const initialFailure = createDeferred<never>();
  const initialError = new ApiError('unauthorized', 'Access token expired', {
    status: 401,
  });
  let currentAccessToken: string | null = 'account-a-token';
  const request = jest.fn().mockReturnValue(initialFailure.promise);
  const http: HttpClient = { request };
  const refreshAccessToken = jest.fn().mockResolvedValue('account-b-token');
  const onUnauthorized = jest.fn();
  const client = createAuthenticatedClient(http, {
    getAccessToken: () => currentAccessToken,
    refreshAccessToken,
    onUnauthorized,
  });

  const outcome = client.request({ path: '/account-a-operation' });
  currentAccessToken = 'account-b-token';
  initialFailure.reject(initialError);

  await expect(outcome).rejects.toBe(initialError);
  expect(request).toHaveBeenCalledTimes(1);
  expect(request).toHaveBeenCalledWith({
    path: '/account-a-operation',
    accessToken: 'account-a-token',
  });
  expect(refreshAccessToken).not.toHaveBeenCalled();
  expect(onUnauthorized).not.toHaveBeenCalled();
});

it('returns account B 401 instead of joining account A pending refresh', async () => {
  const accountAInitialError = new ApiError(
    'unauthorized',
    'Account A access token expired',
    { status: 401 },
  );
  const accountBInitialError = new ApiError(
    'unauthorized',
    'Account B access token expired',
    { status: 401 },
  );
  const refresh = createDeferred<string>();
  const refreshStarted = createDeferred<void>();
  let currentAccessToken: string | null = 'account-a-token';
  const request = jest.fn().mockImplementation((httpRequest: HttpRequest<unknown>) => {
    if (httpRequest.accessToken === 'account-a-token') {
      return Promise.reject(accountAInitialError);
    }
    if (httpRequest.accessToken === 'account-b-token') {
      return Promise.reject(accountBInitialError);
    }
    return Promise.resolve({ id: httpRequest.path });
  });
  const http: HttpClient = { request };
  const refreshAccessToken = jest.fn(() => {
    refreshStarted.resolve();
    return refresh.promise;
  });
  const onUnauthorized = jest.fn();
  const client = createAuthenticatedClient(http, {
    getAccessToken: () => currentAccessToken,
    refreshAccessToken,
    onUnauthorized,
  });

  const accountARequest = client.request({ path: '/account-a-operation' });
  await refreshStarted.promise;
  currentAccessToken = 'account-b-token';
  const accountBRequest = client.request({ path: '/account-b-operation' });

  refresh.resolve('account-a-refreshed-token');

  await expect(accountBRequest).rejects.toBe(accountBInitialError);
  await expect(accountARequest).resolves.toEqual({ id: '/account-a-operation' });
  expect(refreshAccessToken).toHaveBeenCalledTimes(1);
  expect(request).toHaveBeenCalledTimes(3);
  expect(request).toHaveBeenLastCalledWith({
    path: '/account-a-operation',
    accessToken: 'account-a-refreshed-token',
  });
  expect(onUnauthorized).not.toHaveBeenCalled();
});

it('reuses a completed refresh for a delayed initial 401 from the same token generation', async () => {
  const firstInitialFailure = createDeferred<never>();
  const secondInitialFailure = createDeferred<never>();
  const refresh = createDeferred<string>();
  const refreshStarted = createDeferred<void>();
  let currentAccessToken: string | null = 'expired-token';
  const request = jest.fn();
  request.mockImplementation((httpRequest: HttpRequest<unknown>) => {
    if (httpRequest.accessToken === 'expired-token') {
      return httpRequest.path === '/first'
        ? firstInitialFailure.promise
        : secondInitialFailure.promise;
    }
    return Promise.resolve(
      httpRequest.path === '/first' ? { id: 1 } : { id: 2 },
    );
  });
  const http: HttpClient = { request };
  const refreshAccessToken = jest.fn(async () => {
    refreshStarted.resolve();
    const refreshedAccessToken = await refresh.promise;
    currentAccessToken = refreshedAccessToken;
    return refreshedAccessToken;
  });
  const onUnauthorized = jest.fn();
  const client = createAuthenticatedClient(http, {
    getAccessToken: () => currentAccessToken,
    refreshAccessToken,
    onUnauthorized,
  });

  const first = client.request({ path: '/first' });
  const second = client.request({ path: '/second' });

  firstInitialFailure.reject(
    new ApiError('unauthorized', 'Access token expired', { status: 401 }),
  );
  await refreshStarted.promise;
  refresh.resolve('refreshed-token');

  await expect(first).resolves.toEqual({ id: 1 });

  secondInitialFailure.reject(
    new ApiError('unauthorized', 'Access token expired', { status: 401 }),
  );

  await expect(second).resolves.toEqual({ id: 2 });
  expect(refreshAccessToken).toHaveBeenCalledTimes(1);
  expect(request).toHaveBeenCalledTimes(4);
  expect(request).toHaveBeenLastCalledWith({
    path: '/second',
    accessToken: 'refreshed-token',
  });
  expect(onUnauthorized).not.toHaveBeenCalled();
});

it.each([
  ['logout', null],
  ['account switch', 'account-switch-token'],
] as const)(
  'does not replay a delayed initial 401 after %s',
  async (_sessionChange, nextAccessToken) => {
    const firstInitialFailure = createDeferred<never>();
    const secondInitialFailure = createDeferred<never>();
    const refresh = createDeferred<string>();
    const refreshStarted = createDeferred<void>();
    const secondInitialError = new ApiError(
      'unauthorized',
      'Access token expired',
      { status: 401 },
    );
    let currentAccessToken: string | null = 'expired-token';
    const request = jest.fn();
    request.mockImplementation((httpRequest: HttpRequest<unknown>) => {
      if (httpRequest.accessToken === 'expired-token') {
        return httpRequest.path === '/first'
          ? firstInitialFailure.promise
          : secondInitialFailure.promise;
      }
      return Promise.resolve(
        httpRequest.path === '/first' ? { id: 1 } : { id: 2 },
      );
    });
    const http: HttpClient = { request };
    const refreshAccessToken = jest.fn(async () => {
      refreshStarted.resolve();
      const refreshedAccessToken = await refresh.promise;
      currentAccessToken = refreshedAccessToken;
      return refreshedAccessToken;
    });
    const onUnauthorized = jest.fn();
    const client = createAuthenticatedClient(http, {
      getAccessToken: () => currentAccessToken,
      refreshAccessToken,
      onUnauthorized,
    });

    const first = client.request({ path: '/first' });
    const second = client.request({ path: '/second' });

    firstInitialFailure.reject(
      new ApiError('unauthorized', 'Access token expired', { status: 401 }),
    );
    await refreshStarted.promise;
    refresh.resolve('refreshed-token');

    await expect(first).resolves.toEqual({ id: 1 });
    currentAccessToken = nextAccessToken;

    secondInitialFailure.reject(secondInitialError);

    await expect(second).rejects.toBe(secondInitialError);
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(3);
    expect(onUnauthorized).not.toHaveBeenCalled();
  },
);

it('clears a synchronously thrown refresh failure before a later 401 recovery', async () => {
  const initialError = new ApiError('unauthorized', 'Access token expired', {
    status: 401,
  });
  const refreshError = new Error('Refresh unavailable');
  const request = jest.fn();
  request.mockImplementation((httpRequest: HttpRequest<unknown>) => {
    if (httpRequest.accessToken === 'expired-token') {
      return Promise.reject(initialError);
    }
    return Promise.resolve({ id: 2 });
  });
  const http: HttpClient = { request };
  const refreshAccessToken = jest
    .fn()
    .mockImplementationOnce(() => {
      throw refreshError;
    })
    .mockResolvedValueOnce('refreshed-token');
  const onUnauthorized = jest.fn();
  const client = createAuthenticatedClient(http, {
    getAccessToken: () => 'expired-token',
    refreshAccessToken,
    onUnauthorized,
  });

  await expect(client.request({ path: '/first' })).rejects.toBe(refreshError);
  await expect(client.request({ path: '/second' })).resolves.toEqual({ id: 2 });

  expect(refreshAccessToken).toHaveBeenCalledTimes(2);
  expect(request).toHaveBeenCalledTimes(3);
  expect(request).toHaveBeenLastCalledWith({
    path: '/second',
    accessToken: 'refreshed-token',
  });
  expect(onUnauthorized).not.toHaveBeenCalled();
});

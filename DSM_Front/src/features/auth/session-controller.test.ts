import { ApiError } from '../../lib/api/api-error';
import { AuthApi } from '../../lib/api/auth-api';
import { parseCurrentUser } from '../../lib/api/auth-contracts';
import { AuthenticatedClient } from '../../lib/api/authenticated-client';
import {
  SessionController,
  SessionTokenStore,
} from './session-controller';

const TOKEN_PAIR = {
  accessToken: 'header.payload.signature',
  refreshToken: 'record.secret',
};

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

it('logout fences a late refresh write', async () => {
  tokenStore.read.mockResolvedValue('old.secret');
  const refresh = controller.refreshAccessToken();
  const logout = controller.logout();
  resolveRefresh(TOKEN_PAIR);

  await Promise.allSettled([refresh, logout]);

  expect(controller.getSnapshot().state.status).toBe('unauthenticated');
  expect(controller.getAccessToken()).toBeNull();
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

it('revokes a rotated pair when secure storage write fails', async () => {
  tokenStore.read.mockResolvedValue('old.secret');
  tokenStore.writeIfCurrent.mockRejectedValue(
    new ApiError('storage', 'Secure token storage failed'),
  );
  authApi.rotateRefreshToken.mockResolvedValue(TOKEN_PAIR);

  await controller.bootstrap();

  expect(authApi.revokeSession).toHaveBeenCalledWith(
    TOKEN_PAIR.accessToken,
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
        error.kind === 'network' ? 'Network unavailable' : 'Request timed out',
      status: error.status,
    });
    expect(controller.getSnapshot().error).not.toMatchObject({
      message: error.message,
    });
    expect(controller.getSnapshot().error?.cause).toBeUndefined();

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

it('logs out locally when server revocation is offline', async () => {
  tokenStore.readAndClear.mockResolvedValue('record.secret');
  authApi.revokeSession.mockRejectedValue(
    new ApiError('network', 'Network unavailable'),
  );

  await controller.logout();

  expect(controller.getSnapshot().state.status).toBe('unauthenticated');
  expect(controller.getAccessToken()).toBeNull();
});

it('blocks in storage-error when local clear cannot be verified', async () => {
  tokenStore.readAndClear.mockRejectedValue(
    new ApiError('storage', 'Secure token storage failed'),
  );

  await controller.logout();

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
    TOKEN_PAIR.accessToken,
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
      TOKEN_PAIR.accessToken,
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
    TOKEN_PAIR.accessToken,
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

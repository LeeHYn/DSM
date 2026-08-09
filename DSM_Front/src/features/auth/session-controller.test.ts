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

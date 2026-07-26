import { ApiError, ApiErrorKind, isApiError } from '../../lib/api/api-error';
import { AuthApi } from '../../lib/api/auth-api';
import {
  CurrentUser,
  parseCurrentUser,
  SocialProvider,
  TokenPair,
} from '../../lib/api/auth-contracts';
import { AuthenticatedClient } from '../../lib/api/authenticated-client';
import { TokenStoreCoordinator } from './token-store-coordinator';

export type SessionState =
  | { status: 'bootstrapping' }
  | { status: 'offline'; retry: 'bootstrap' | 'profile' }
  | { status: 'storage-error'; operation: 'read' | 'write' | 'clear' }
  | { status: 'unauthenticated' }
  | {
      status: 'onboarding';
      userId: string;
      onboardingCompletedAt: null;
    }
  | {
      status: 'authenticated';
      userId: string;
      onboardingCompletedAt: string;
    };

export type SessionAction =
  | 'idle'
  | 'signing-in'
  | 'refreshing'
  | 'completing-onboarding'
  | 'logging-out'
  | 'recovering';

export type SessionSnapshot = {
  state: SessionState;
  action: SessionAction;
  error: ApiError | null;
};

export type SessionTokenStore = Pick<
  TokenStoreCoordinator,
  'read' | 'writeIfCurrent' | 'readAndClear'
>;

export type SessionControllerDependencies = {
  authApi: AuthApi;
  authenticatedClient: AuthenticatedClient;
  tokenStore: SessionTokenStore;
};

export interface SessionControllerPort {
  bootstrap(): Promise<void>;
  completeOnboarding(): Promise<void>;
  endUnauthorizedSession(): Promise<void>;
  getAccessToken(): string | null;
  getEpoch(): number;
  getSnapshot(): SessionSnapshot;
  logout(): Promise<void>;
  refreshAccessToken(): Promise<string>;
  retryRecovery(): Promise<void>;
  signIn(provider: SocialProvider, providerToken: string): Promise<void>;
  subscribe(listener: () => void): () => void;
}

const SAFE_ERROR_MESSAGES: Record<ApiErrorKind, string> = {
  network: 'Network unavailable',
  timeout: 'Request timed out',
  http: 'Session request failed',
  unauthorized: 'Session is unavailable',
  protocol: 'Invalid session response',
  storage: 'Secure token storage failed',
};

export class SessionController implements SessionControllerPort {
  private accessToken: string | null = null;
  private bootstrapPromise: Promise<void> | null = null;
  private epoch = 0;
  private refreshPromise: Promise<string> | null = null;
  private unauthorizedCleanupPromise: Promise<void> | null = null;
  private snapshot: SessionSnapshot = {
    state: { status: 'unauthenticated' },
    action: 'idle',
    error: null,
  };
  private readonly listeners = new Set<() => void>();

  constructor(private readonly dependencies: SessionControllerDependencies) {}

  getAccessToken(): string | null {
    return this.accessToken;
  }

  getEpoch(): number {
    return this.epoch;
  }

  getSnapshot(): SessionSnapshot {
    return {
      ...this.snapshot,
      state: { ...this.snapshot.state },
    } as SessionSnapshot;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  bootstrap(): Promise<void> {
    if (this.bootstrapPromise) {
      return this.bootstrapPromise;
    }

    const operation = this.bootstrapInternal();
    this.bootstrapPromise = operation;
    const clear = () => {
      if (this.bootstrapPromise === operation) {
        this.bootstrapPromise = null;
      }
    };
    void operation.then(clear, clear);
    return operation;
  }

  async signIn(provider: SocialProvider, providerToken: string): Promise<void> {
    const epoch = ++this.epoch;
    this.accessToken = null;
    this.publish({
      state: { status: 'unauthenticated' },
      action: 'signing-in',
      error: null,
    });

    let pair: TokenPair;
    try {
      pair = await this.dependencies.authApi.exchangeProviderToken(
        provider,
        providerToken,
      );
      await this.commitPair(pair, epoch);
    } catch (error) {
      if (epoch === this.epoch) {
        const sanitized = this.sanitizeError(error);
        if (this.snapshot.state.status === 'storage-error') {
          this.publish({ ...this.snapshot, action: 'idle', error: sanitized });
        } else {
          this.publishUnauthenticated(sanitized);
        }
      }
      return;
    }

    if (epoch !== this.epoch) {
      await this.revokeBestEffort(pair);
      return;
    }

    this.accessToken = pair.accessToken;
    await this.loadProfile();
  }

  refreshAccessToken(): Promise<string> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    const epoch = this.epoch;
    this.setAction('refreshing');
    const operation = this.rotateAndCommit(epoch);
    this.refreshPromise = operation;
    const clear = () => {
      if (this.refreshPromise === operation) {
        this.refreshPromise = null;
      }
    };
    void operation.then(clear, clear);
    return operation;
  }

  async completeOnboarding(): Promise<void> {
    if (!this.accessToken) {
      return;
    }

    this.setAction('completing-onboarding');
    try {
      this.publishUser(await this.patchOnboarding());
    } catch (error) {
      await this.handleProfileError(error);
    }
  }

  async logout(): Promise<void> {
    const accessToken = this.accessToken;
    this.epoch += 1;
    this.accessToken = null;
    this.setAction('logging-out');

    try {
      const refreshToken = await this.dependencies.tokenStore.readAndClear();
      this.publishUnauthenticated();
      if (accessToken && refreshToken) {
        await this.revokeCapturedBestEffort(accessToken, refreshToken);
      }
    } catch (error) {
      this.publishStorageError('clear', error);
    }
  }

  endUnauthorizedSession(): Promise<void> {
    if (this.unauthorizedCleanupPromise) {
      return this.unauthorizedCleanupPromise;
    }

    const operation = this.clearUnauthorizedSession();
    this.unauthorizedCleanupPromise = operation;
    const clear = () => {
      if (this.unauthorizedCleanupPromise === operation) {
        this.unauthorizedCleanupPromise = null;
      }
    };
    void operation.then(clear, clear);
    return operation;
  }

  async retryRecovery(): Promise<void> {
    const { state } = this.snapshot;
    if (state.status === 'offline') {
      if (state.retry === 'bootstrap') {
        await this.bootstrap();
        return;
      }

      this.setAction('recovering');
      await this.loadProfile();
      return;
    }

    if (state.status === 'storage-error') {
      if (state.operation === 'clear') {
        await this.endUnauthorizedSession();
        return;
      }

      await this.bootstrap();
    }
  }

  private async bootstrapInternal(): Promise<void> {
    this.publish({
      state: { status: 'bootstrapping' },
      action: 'recovering',
      error: null,
    });

    try {
      await this.refreshAccessToken();
    } catch (error) {
      const sanitized = this.sanitizeError(error);
      if (sanitized.kind === 'network' || sanitized.kind === 'timeout') {
        this.publish({
          state: { status: 'offline', retry: 'bootstrap' },
          action: 'idle',
          error: sanitized,
        });
      } else if (sanitized.kind === 'storage') {
        if (this.snapshot.state.status !== 'storage-error') {
          this.publishStorageError('read', sanitized);
        }
      } else if (sanitized.kind !== 'unauthorized') {
        await this.endUnauthorizedSession();
      }
      return;
    }

    await this.loadProfile();
  }

  private async clearUnauthorizedSession(): Promise<void> {
    this.epoch += 1;
    this.accessToken = null;
    try {
      await this.dependencies.tokenStore.readAndClear();
      this.publishUnauthenticated();
    } catch (error) {
      this.publishStorageError('clear', error);
    }
  }

  private async rotateAndCommit(epoch: number): Promise<string> {
    let currentRefreshToken: string | null;
    try {
      currentRefreshToken = await this.dependencies.tokenStore.read();
    } catch (error) {
      const sanitized = this.sanitizeError(error);
      if (epoch === this.epoch) {
        this.publishStorageError('read', sanitized);
      }
      throw sanitized;
    }

    if (!currentRefreshToken) {
      const error = new ApiError('unauthorized', 'Session is unavailable');
      await this.endUnauthorizedSession();
      throw error;
    }

    let pair: TokenPair;
    try {
      pair = await this.dependencies.authApi.rotateRefreshToken(currentRefreshToken);
    } catch (error) {
      const sanitized = this.sanitizeError(error);
      if (sanitized.kind === 'unauthorized') {
        await this.endUnauthorizedSession();
      }
      throw sanitized;
    }

    await this.commitPair(pair, epoch);
    if (epoch !== this.epoch) {
      await this.revokeBestEffort(pair);
      throw new ApiError('unauthorized', 'Session changed during refresh');
    }

    this.accessToken = pair.accessToken;
    this.setAction('idle');
    return pair.accessToken;
  }

  private async commitPair(pair: TokenPair, epoch: number): Promise<void> {
    try {
      const committed = await this.dependencies.tokenStore.writeIfCurrent(
        pair.refreshToken,
        epoch,
      );
      if (!committed || epoch !== this.epoch) {
        throw new ApiError('unauthorized', 'Session changed during refresh');
      }
    } catch (error) {
      const sanitized = this.sanitizeError(error);
      await this.revokeBestEffort(pair);
      if (sanitized.kind === 'storage' && epoch === this.epoch) {
        this.publishStorageError('write', sanitized);
      }
      throw sanitized;
    }
  }

  private async loadProfile(): Promise<void> {
    try {
      this.publishUser(await this.getCurrentUser());
    } catch (error) {
      await this.handleProfileError(error);
    }
  }

  private async handleProfileError(error: unknown): Promise<void> {
    const sanitized = this.sanitizeError(error);
    if (sanitized.kind === 'network' || sanitized.kind === 'timeout') {
      this.publish({
        state: { status: 'offline', retry: 'profile' },
        action: 'idle',
        error: sanitized,
      });
      return;
    }

    await this.endUnauthorizedSession();
  }

  private getCurrentUser(): Promise<CurrentUser> {
    return this.dependencies.authenticatedClient.request({
      path: '/auth/me',
      validate: parseCurrentUser,
    });
  }

  private patchOnboarding(): Promise<CurrentUser> {
    return this.dependencies.authenticatedClient.request({
      path: '/auth/me/onboarding',
      method: 'PATCH',
      validate: parseCurrentUser,
    });
  }

  private publishUser(user: CurrentUser): void {
    this.publish({
      state:
        user.onboardingCompletedAt === null
          ? {
              status: 'onboarding',
              userId: user.userId,
              onboardingCompletedAt: null,
            }
          : {
              status: 'authenticated',
              userId: user.userId,
              onboardingCompletedAt: user.onboardingCompletedAt,
            },
      action: 'idle',
      error: null,
    });
  }

  private publishUnauthenticated(error: ApiError | null = null): void {
    this.publish({
      state: { status: 'unauthenticated' },
      action: 'idle',
      error,
    });
  }

  private publishStorageError(
    operation: 'read' | 'write' | 'clear',
    error: unknown,
  ): void {
    this.publish({
      state: { status: 'storage-error', operation },
      action: 'idle',
      error: this.sanitizeError(error),
    });
  }

  private setAction(action: SessionAction): void {
    this.publish({ ...this.snapshot, action });
  }

  private publish(snapshot: SessionSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // A subscriber cannot interrupt session cleanup or recovery.
      }
    }
  }

  private sanitizeError(error: unknown): ApiError {
    if (isApiError(error)) {
      return new ApiError(error.kind, SAFE_ERROR_MESSAGES[error.kind], {
        status: error.status,
      });
    }

    return new ApiError('network', SAFE_ERROR_MESSAGES.network);
  }

  private async revokeBestEffort(pair: TokenPair): Promise<void> {
    await this.revokeCapturedBestEffort(pair.accessToken, pair.refreshToken);
  }

  private async revokeCapturedBestEffort(
    accessToken: string,
    refreshToken: string,
  ): Promise<void> {
    try {
      await this.dependencies.authApi.revokeSession(accessToken, refreshToken);
    } catch {
      // Logout and stale-pair cleanup are intentionally best effort.
    }
  }
}

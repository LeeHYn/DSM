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
import type { LocalSessionStore } from './local-session-store';

export type SessionState =
  | { status: 'bootstrapping' }
  | { status: 'offline'; retry: 'bootstrap' | 'profile' }
  | { status: 'offline-workspace'; retry: 'bootstrap' | 'profile'; userId: string; onboardingCompletedAt: string }
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
  | 'deleting-account'
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
  localSession?: LocalSessionStore;
};

export interface SessionControllerPort {
  bootstrap(): Promise<void>;
  completeOnboarding(): Promise<void>;
  deleteAccount(): Promise<boolean>;
  endUnauthorizedSession(): Promise<void>;
  getAccessToken(): string | null;
  getEpoch(): number;
  getSnapshot(): SessionSnapshot;
  logout(): Promise<boolean>;
  leaveOffline(): Promise<boolean>;
  drainPendingRevocations?(): Promise<void>;
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

function isRetryableSessionError(error: ApiError): boolean {
  return error.kind === 'network' || error.kind === 'timeout' || (
    error.kind === 'http' &&
    error.status !== undefined &&
    error.status >= 500 &&
    error.status < 600
  );
}

export class SessionController implements SessionControllerPort {
  private accessToken: string | null = null;
  private accountDeletion:
    | { epoch: number; operation: Promise<boolean> }
    | null = null;
  private accountCleanupEpoch: number | null = null;
  private bootstrapPromise: Promise<void> | null = null;
  private epoch = 0;
  private profileGeneration = 0;
  private onboardingCompletion:
    | { epoch: number; operation: Promise<void> }
    | null = null;
  private refreshPromise: Promise<string> | null = null;
  private sessionLogout:
    | { epoch: number; operation: Promise<boolean> }
    | null = null;
  private unauthorizedCleanupPromise: Promise<void> | null = null;
  private unauthorizedCleanupEpoch: number | null = null;
  private offlineExit: Promise<boolean> | null = null;
  private offlineExitEpoch: number | null = null;

  private isEndingSession(): boolean {
    return this.snapshot.action === 'logging-out' || this.offlineExitEpoch === this.epoch || this.sessionLogout?.epoch === this.epoch || this.unauthorizedCleanupEpoch === this.epoch || this.accountCleanupEpoch === this.epoch;
  }
  private pendingRevocations: Promise<void> | null = null;
  private snapshot: SessionSnapshot = {
    state: { status: 'bootstrapping' },
    action: 'recovering',
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
    if (this.isEndingSession()) return Promise.resolve();
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
      if (this.dependencies.localSession) {
        await this.dependencies.localSession.invalidateGrant(() => epoch === this.epoch);
        if (epoch !== this.epoch) return;
      }
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
    await this.loadProfile(epoch);
    if (epoch === this.epoch &&
      (this.snapshot.state.status === 'authenticated' || this.snapshot.state.status === 'onboarding')) {
      this.drainPendingRevocations().catch(() => undefined);
    }
  }

  refreshAccessToken(): Promise<string> {
    if (this.isEndingSession()) return Promise.reject(new ApiError('unauthorized', SAFE_ERROR_MESSAGES.unauthorized));
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    const epoch = this.epoch;
    if (this.accountDeletion?.epoch !== epoch) {
      this.setAction('refreshing');
    }
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

  completeOnboarding(): Promise<void> {
    if (this.onboardingCompletion?.epoch === this.epoch) {
      return this.onboardingCompletion.operation;
    }

    if (
      !this.accessToken ||
      this.snapshot.state.status !== 'onboarding'
    ) {
      return Promise.resolve();
    }

    const epoch = this.epoch;
    const operation = this.completeOnboardingInternal(epoch);
    const completion = { epoch, operation };
    this.onboardingCompletion = completion;
    const clear = () => {
      if (this.onboardingCompletion === completion) {
        this.onboardingCompletion = null;
      }
    };
    void operation.then(clear, clear);
    return operation;
  }

  private async completeOnboardingInternal(epoch: number): Promise<void> {
    this.setAction('completing-onboarding');
    try {
      const user = await this.patchOnboarding();
      if (
        epoch === this.epoch &&
        this.snapshot.state.status === 'onboarding'
      ) {
        await this.acceptUser(user, epoch);
      }
    } catch (error) {
      const sanitized = this.sanitizeError(error);
      if (
        epoch === this.epoch &&
        this.snapshot.state.status === 'onboarding' &&
        isRetryableSessionError(sanitized)
      ) {
        this.publish({
          state: this.snapshot.state,
          action: 'idle',
          error: sanitized,
        });
        return;
      }

      await this.handleProfileError(error, epoch);
    }
  }

  deleteAccount(): Promise<boolean> {
    if (this.accountDeletion?.epoch === this.epoch) {
      return this.accountDeletion.operation;
    }

    const { state } = this.snapshot;
    if (!this.accessToken || state.status !== 'authenticated') {
      return Promise.resolve(false);
    }

    const epoch = this.epoch;
    const operation = this.deleteAccountInternal(epoch, state);
    const deletion = { epoch, operation };
    this.accountDeletion = deletion;
    const clear = () => {
      if (this.accountDeletion === deletion) {
        this.accountDeletion = null;
        this.accountCleanupEpoch = null;
      }
    };
    operation.then(clear, clear).catch(() => undefined);
    return operation;
  }

  private async deleteAccountInternal(
    epoch: number,
    authenticatedState: Extract<SessionState, { status: 'authenticated' }>,
  ): Promise<boolean> {
    this.setAction('deleting-account');
    try {
      await this.dependencies.authenticatedClient.request<void>({
        path: '/auth/me',
        method: 'DELETE',
        responseMode: 'empty',
      });
    } catch (error) {
      if (epoch === this.epoch) {
        this.publish({
          state: authenticatedState,
          action: 'idle',
          error: this.sanitizeError(error),
        });
      }
      return false;
    }

    if (epoch !== this.epoch) {
      return false;
    }

    const cleanupEpoch = ++this.epoch;
    this.accountCleanupEpoch = cleanupEpoch;
    if (this.accountDeletion?.epoch === epoch) {
      this.accountDeletion.epoch = cleanupEpoch;
    }
    this.accessToken = null;
    this.publish({
      state: { status: 'bootstrapping' },
      action: 'recovering',
      error: null,
    });
    try {
      if (this.dependencies.localSession) await this.dependencies.localSession.invalidateGrant(() => cleanupEpoch === this.epoch);
      if (cleanupEpoch !== this.epoch) return false;
      await this.dependencies.tokenStore.readAndClear(cleanupEpoch);
      if (cleanupEpoch !== this.epoch) {
        return false;
      }
      this.accountCleanupEpoch = ++this.epoch;
      if (this.accountDeletion?.epoch === cleanupEpoch) this.accountDeletion.epoch = this.epoch;
      this.publishUnauthenticated();
    } catch (error) {
      if (cleanupEpoch !== this.epoch) {
        return false;
      }
      this.publishStorageError('clear', error);
    }
    return true;
  }

  logout(): Promise<boolean> {
    if (this.sessionLogout?.epoch === this.epoch) {
      return this.sessionLogout.operation;
    }

    const state = this.snapshot.state;
    const epoch = ++this.epoch;
    this.setAction('logging-out');
    const operation = this.logoutInternal(epoch, state);
    const logout = { epoch, operation };
    this.sessionLogout = logout;
    const clear = () => {
      if (this.sessionLogout === logout) {
        this.sessionLogout = null;
      }
    };
    void operation.then(clear, clear);
    return operation;
  }

  leaveOffline(): Promise<boolean> {
    if (this.offlineExit && this.offlineExitEpoch === this.epoch) return this.offlineExit;
    const state = this.snapshot.state;
    if (!this.dependencies.localSession ||
      (state.status !== 'offline' && state.status !== 'offline-workspace')) return Promise.resolve(false);
    const epoch = ++this.epoch;
    this.offlineExitEpoch = epoch;
    const operation = this.leaveOfflineInternal(epoch, state);
    this.offlineExit = operation;
    operation.finally(() => {
      if (this.offlineExit === operation) { this.offlineExit = null; this.offlineExitEpoch = null; }
    }).catch(() => undefined);
    return operation;
  }

  drainPendingRevocations(): Promise<void> {
    if (this.pendingRevocations) return this.pendingRevocations;
    const localSession = this.dependencies.localSession;
    if (!localSession) return Promise.resolve();
    const operation = localSession.drainRevocations(token => this.dependencies.authApi.revokeSession(token))
      .catch(() => { throw new ApiError('storage', SAFE_ERROR_MESSAGES.storage); });
    this.pendingRevocations = operation;
    const clear = () => {
      if (this.pendingRevocations === operation) this.pendingRevocations = null;
    };
    operation.then(clear, clear).catch(() => undefined);
    return operation;
  }

  private async leaveOfflineInternal(epoch: number, state: SessionState): Promise<boolean> {
    this.setAction('logging-out');
    try {
      const refreshToken = await this.dependencies.tokenStore.read();
      if (epoch !== this.epoch) return false;
      if (refreshToken) {
        const saved = await this.dependencies.localSession!.deferRevocation(refreshToken, () => epoch === this.epoch);
        if (!saved) return false;
      } else {
        await this.dependencies.localSession!.invalidateGrant(() => epoch === this.epoch);
      }
      if (epoch !== this.epoch) return false;
      this.accessToken = null;
      await this.dependencies.tokenStore.readAndClear(epoch);
      if (epoch !== this.epoch) return false;
      this.offlineExitEpoch = ++this.epoch;
      this.publishUnauthenticated();
      this.drainPendingRevocations().catch(() => undefined);
      return true;
    } catch (error) {
      if (epoch === this.epoch) this.publish({ state, action: 'idle', error: this.sanitizeError(error) });
      return false;
    }
  }

  private async logoutInternal(
    epoch: number,
    state: SessionState,
  ): Promise<boolean> {
    let refreshToken: string | null;
    try {
      refreshToken = await this.dependencies.tokenStore.read();
    } catch (error) {
      if (epoch === this.epoch) {
        this.publishStorageError('read', error);
      }
      return false;
    }

    if (epoch !== this.epoch) {
      return false;
    }

    if (!refreshToken) {
      this.publish({
        state,
        action: 'idle',
        error: new ApiError('unauthorized', SAFE_ERROR_MESSAGES.unauthorized),
      });
      return false;
    }

    try {
      await this.dependencies.authApi.revokeSession(refreshToken);
    } catch (error) {
      if (epoch === this.epoch) {
        this.publish({
          state,
          action: 'idle',
          error: this.sanitizeError(error),
        });
      }
      return false;
    }

    if (epoch !== this.epoch) {
      return false;
    }

    this.accessToken = null;
    this.publish({
      state: { status: 'bootstrapping' },
      action: 'recovering',
      error: null,
    });
    try {
      if (this.dependencies.localSession) await this.dependencies.localSession.invalidateGrant(() => epoch === this.epoch);
      if (epoch !== this.epoch) return false;
      await this.dependencies.tokenStore.readAndClear(epoch);
      if (epoch !== this.epoch) {
        return false;
      }
      const finalEpoch = ++this.epoch;
      if (this.sessionLogout?.epoch === epoch) this.sessionLogout.epoch = finalEpoch;
      this.publishUnauthenticated();
      return true;
    } catch (error) {
      if (epoch === this.epoch) {
        this.publishStorageError('clear', error);
      }
      return false;
    }
  }

  endUnauthorizedSession(): Promise<void> {
    return this.startUnauthorizedCleanup(false);
  }

  private startUnauthorizedCleanup(revokeSession: boolean): Promise<void> {
    if (this.unauthorizedCleanupPromise && this.unauthorizedCleanupEpoch === this.epoch) {
      return this.unauthorizedCleanupPromise;
    }

    let resolveCleanup!: () => void;
    let rejectCleanup!: (error: unknown) => void;
    const operation = new Promise<void>((resolve, reject) => {
      resolveCleanup = resolve;
      rejectCleanup = reject;
    });
    // Publish can synchronously re-enter cleanup through a subscriber.
    this.unauthorizedCleanupPromise = operation;
    const clear = () => {
      if (this.unauthorizedCleanupPromise === operation) {
        this.unauthorizedCleanupPromise = null;
        this.unauthorizedCleanupEpoch = null;
      }
    };
    void operation.then(clear, clear);
    this.clearUnauthorizedSession(revokeSession).then(resolveCleanup, rejectCleanup);
    return operation;
  }

  async retryRecovery(): Promise<void> {
    if (this.isEndingSession()) return;
    const { state } = this.snapshot;
    if (state.status === 'offline' || state.status === 'offline-workspace') {
      if (state.retry === 'bootstrap') {
        await this.bootstrap();
        return;
      }

      this.setAction('recovering');
      await this.loadProfile(this.epoch);
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
    const epoch = this.epoch;
    this.drainPendingRevocations().catch(() => undefined);
    this.publish({
      state: this.snapshot.state.status === 'offline-workspace' ? this.snapshot.state : { status: 'bootstrapping' },
      action: 'recovering',
      error: null,
    });

    try {
      await this.refreshAccessToken();
    } catch (error) {
      if (epoch !== this.epoch) {
        return;
      }
      const sanitized = this.sanitizeError(error);
      if (isRetryableSessionError(sanitized)) {
        await this.publishOffline('bootstrap', sanitized, epoch);
      } else if (sanitized.kind === 'storage') {
        // Rotation either published a storage error or fenced a completed cleanup.
        if (this.snapshot.state.status !== 'storage-error') {
          this.accessToken = null;
          this.publishStorageError('write', sanitized);
        }
      } else if (sanitized.kind !== 'unauthorized') {
        await this.endUnauthorizedSession();
      }
      return;
    }

    if (epoch === this.epoch) {
      await this.loadProfile(epoch);
    }
  }

  private async clearUnauthorizedSession(revokeSession: boolean): Promise<void> {
    const cleanupEpoch = this.epoch + 1;
    this.epoch = cleanupEpoch;
    this.unauthorizedCleanupEpoch = cleanupEpoch;
    this.accessToken = null;
    this.publish({
      state: { status: 'bootstrapping' },
      action: 'recovering',
      error: null,
    });
    try {
      if (this.dependencies.localSession) await this.dependencies.localSession.invalidateGrant(() => cleanupEpoch === this.epoch);
      if (cleanupEpoch !== this.epoch) return;
      const refreshToken = await this.dependencies.tokenStore.readAndClear(cleanupEpoch);
      if (revokeSession && refreshToken) {
        await this.revokeCapturedBestEffort(refreshToken);
      }
      if (this.epoch === cleanupEpoch) {
        this.unauthorizedCleanupEpoch = ++this.epoch;
        this.publishUnauthenticated();
      }
    } catch (error) {
      if (this.epoch === cleanupEpoch) {
        this.publishStorageError('clear', error);
      }
    }
  }

  private async rotateAndCommit(epoch: number): Promise<string> {
    let currentRefreshToken: string | null;
    try {
      currentRefreshToken = await this.dependencies.tokenStore.read();
    } catch (error) {
      const sanitized = this.sanitizeError(error);
      if (sanitized.kind === 'storage' && epoch === this.epoch) {
        await this.endUnauthorizedSession();
      }
      throw sanitized;
    }

    if (epoch !== this.epoch) {
      throw new ApiError('unauthorized', 'Session changed during refresh');
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
      if (epoch === this.epoch && sanitized.kind === 'unauthorized') {
        await this.endUnauthorizedSession();
      } else if (
        epoch === this.epoch &&
        isRetryableSessionError(sanitized)
      ) {
        await this.publishOffline('bootstrap', sanitized, epoch);
      }
      throw sanitized;
    }

    await this.commitPair(pair, epoch);
    if (epoch !== this.epoch) {
      await this.revokeBestEffort(pair);
      throw new ApiError('unauthorized', 'Session changed during refresh');
    }

    if (this.dependencies.localSession) {
      let operation: 'read' | 'write' = 'read';
      try {
        const prior = await this.dependencies.localSession.readGrant(currentRefreshToken);
        if (prior && epoch === this.epoch) {
          operation = 'write';
          await this.dependencies.localSession.saveGrant(prior, pair.refreshToken, () => epoch === this.epoch);
        }
      } catch {
        const error = new ApiError('storage', SAFE_ERROR_MESSAGES.storage);
        if (epoch === this.epoch) {
          // The rotated credential is already committed. Keep it for recovery;
          // local grant failure must not clear it or pending server revocations.
          this.accessToken = null;
          this.publishStorageError(operation, error);
        }
        throw error;
      }
      if (epoch !== this.epoch) throw new ApiError('unauthorized', 'Session changed during refresh');
    }
    this.accessToken = pair.accessToken;
    this.setAction(
      this.accountDeletion?.epoch === epoch ? 'deleting-account' : 'idle',
    );
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

  private async loadProfile(epoch: number): Promise<void> {
    const generation = ++this.profileGeneration;
    try {
      const user = await this.getCurrentUser();
      // Rotation changes the token within this session; account changes and
      // cleanup change the epoch. Accept the former while fencing the latter.
      if (epoch === this.epoch && generation === this.profileGeneration && this.accessToken) {
        await this.acceptUser(user, epoch, generation);
      }
    } catch (error) {
      if (generation === this.profileGeneration) {
        await this.handleProfileError(error, epoch);
      }
    }
  }

  private async handleProfileError(
    error: unknown,
    operationEpoch: number,
  ): Promise<void> {
    const sanitized = this.sanitizeError(error);
    if (operationEpoch !== this.epoch) {
      return;
    }

    if (isRetryableSessionError(sanitized)) {
      await this.publishOffline('profile', sanitized, operationEpoch);
      return;
    }

    if (sanitized.kind === 'storage') {
      this.accessToken = null;
      this.publishStorageError('write', sanitized);
      return;
    }

    await this.startUnauthorizedCleanup(sanitized.kind === 'protocol');
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

  private async acceptUser(user: CurrentUser, epoch: number, generation?: number): Promise<void> {
    const current = () => epoch === this.epoch && (generation === undefined || generation === this.profileGeneration);
    if (this.dependencies.localSession && user.onboardingCompletedAt !== null) {
      const credential = await this.dependencies.tokenStore.read();
      if (!current()) return;
      if (!credential) throw new ApiError('storage', 'Secure token storage failed');
      if (!await this.dependencies.localSession.saveGrant({ ...user, onboardingCompletedAt: user.onboardingCompletedAt }, credential, current)) return;
    }
    if (current()) this.publishUser(user);
  }

  private async publishOffline(retry: 'bootstrap' | 'profile', error: ApiError, epoch: number): Promise<void> {
    let state: SessionState = { status: 'offline', retry };
    try {
      if (this.dependencies.localSession) {
        const credential = await this.dependencies.tokenStore.read();
        if (epoch !== this.epoch) return;
        const grant = credential ? await this.dependencies.localSession.readGrant(credential) : null;
        if (grant) state = { status: 'offline-workspace', retry, ...grant };
      }
    } catch (storageError) {
      if (epoch === this.epoch) this.publishStorageError('read', storageError);
      return;
    }
    if (epoch === this.epoch) this.publish({ state, action: 'idle', error });
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
    await this.revokeCapturedBestEffort(pair.refreshToken);
  }

  private async revokeCapturedBestEffort(refreshToken: string): Promise<void> {
    try {
      await this.dependencies.authApi.revokeSession(refreshToken);
    } catch {
      // Logout and stale-pair cleanup are intentionally best effort.
    }
  }
}

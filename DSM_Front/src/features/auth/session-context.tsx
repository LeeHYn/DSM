import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from 'react';

import { getApiBaseUrl } from '../../config/api-config';
import { createAuthenticatedClient } from '../../lib/api/authenticated-client';
import { createAuthApi } from '../../lib/api/auth-api';
import { createHttpClient } from '../../lib/api/http-client';
import { TokenStoreCoordinator } from './token-store-coordinator';
import {
  SessionController,
  SessionControllerPort,
  SessionSnapshot,
} from './session-controller';
import { createRefreshTokenStore } from './token-store';

export type SessionContextValue = SessionSnapshot & Pick<
  SessionControllerPort,
  'completeOnboarding' | 'logout' | 'retryRecovery' | 'signIn'
>;

type SessionProviderProps = PropsWithChildren<{
  controller?: SessionControllerPort;
}>;

type SessionSnapshotStore = {
  getSnapshot(): SessionSnapshot;
  subscribe(listener: () => void): () => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

function createSessionController(): SessionController {
  const http = createHttpClient({ baseUrl: getApiBaseUrl() });
  const authApi = createAuthApi(http);
  const store = createRefreshTokenStore();
  let controller!: SessionController;
  const coordinator = new TokenStoreCoordinator(
    store,
    () => controller.getEpoch(),
  );
  const authenticatedClient = createAuthenticatedClient(http, {
    getAccessToken: () => controller.getAccessToken(),
    refreshAccessToken: () => controller.refreshAccessToken(),
    onUnauthorized: () => controller.endUnauthorizedSession(),
  });
  controller = new SessionController({
    authApi,
    authenticatedClient,
    tokenStore: coordinator,
  });
  return controller;
}

function createSessionSnapshotStore(
  controller: SessionControllerPort,
): SessionSnapshotStore {
  let snapshot = controller.getSnapshot();

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      const unsubscribe = controller.subscribe(() => {
        snapshot = controller.getSnapshot();
        listener();
      });
      snapshot = controller.getSnapshot();
      return unsubscribe;
    },
  };
}

export function SessionProvider({
  children,
  controller: injectedController,
}: SessionProviderProps) {
  const controller = useMemo(
    () => injectedController ?? createSessionController(),
    [injectedController],
  );
  const snapshotStore = useMemo(
    () => createSessionSnapshotStore(controller),
    [controller],
  );
  const snapshot = useSyncExternalStore(
    snapshotStore.subscribe,
    snapshotStore.getSnapshot,
    snapshotStore.getSnapshot,
  );
  const completeOnboarding: SessionControllerPort['completeOnboarding'] =
    useCallback(() => controller.completeOnboarding(), [controller]);
  const logout: SessionControllerPort['logout'] = useCallback(
    () => controller.logout(),
    [controller],
  );
  const retryRecovery: SessionControllerPort['retryRecovery'] = useCallback(
    () => controller.retryRecovery(),
    [controller],
  );
  const signIn: SessionControllerPort['signIn'] = useCallback(
    (provider, providerToken) => controller.signIn(provider, providerToken),
    [controller],
  );
  const value = useMemo<SessionContextValue>(
    () => ({
      ...snapshot,
      completeOnboarding,
      logout,
      retryRecovery,
      signIn,
    }),
    [completeOnboarding, logout, retryRecovery, signIn, snapshot],
  );

  useEffect(() => {
    void controller.bootstrap();
  }, [controller]);

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const session = useContext(SessionContext);

  if (session === null) {
    throw new Error('useSession must be used inside SessionProvider');
  }

  return session;
}

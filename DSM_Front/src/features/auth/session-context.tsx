import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { AppState } from 'react-native';

import type { AuthenticatedClient } from '../../lib/api/authenticated-client';
import { getSessionRuntime } from './session-runtime';
import type { NotificationRuntime } from '../notifications/notification-runtime';
import {
  SessionControllerPort,
  SessionSnapshot,
} from './session-controller';

export type SessionContextValue = SessionSnapshot & { epoch: number } & Pick<
  SessionControllerPort,
  | 'completeOnboarding'
  | 'deleteAccount'
  | 'logout'
  | 'leaveOffline'
  | 'retryRecovery'
  | 'signIn'
>;

type SessionProviderProps = PropsWithChildren<{
  controller?: SessionControllerPort;
  client?: AuthenticatedClient;
  notificationLifecycle?: Pick<NotificationRuntime, 'prepareLogout' | 'resume'>;
}>;

type SessionSnapshotStore = {
  getSnapshot(): SessionSnapshot;
  subscribe(listener: () => void): () => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);
const ClientContext = createContext<AuthenticatedClient | null>(null);

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
  client: injectedClient,
  notificationLifecycle,
}: SessionProviderProps) {
  const runtime = useMemo(
    () => injectedController ? { controller: injectedController, client: injectedClient ?? null } : getSessionRuntime(),
    [injectedController, injectedClient],
  );
  const { controller, client } = runtime;
  type EndKind = 'logout' | 'deleteAccount';
  type EndOperation = { epoch: number; kind: EndKind; promise: Promise<boolean> };
  const endScope = useMemo(() => ({ controller, notificationLifecycle, active: true, operation: null as EndOperation | null }), [controller, notificationLifecycle]);
  const [pendingEnd, setPendingEnd] = useState<{ scope: typeof endScope; operation: EndOperation } | null>(null);
  useEffect(() => {
    endScope.active = true;
    return () => { endScope.active = false; };
  }, [endScope]);
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
  const endSession = useCallback((kind: EndKind): Promise<boolean> => {
    if (!endScope.active) return Promise.resolve(false);
    const epoch = controller.getEpoch();
    const previous = endScope.operation;
    if (previous?.epoch === epoch) return previous.kind === kind ? previous.promise : Promise.resolve(false);
    if ((!notificationLifecycle && injectedController) || controller.getSnapshot().state.status !== 'authenticated') return controller[kind]();
    const lifecycle = notificationLifecycle ?? require('../notifications/notification-runtime-native').getNotificationRuntime() as Pick<NotificationRuntime, 'prepareLogout' | 'resume'>;
    const operation: EndOperation = { epoch, kind, promise: Promise.resolve(false) };
    endScope.operation = operation;
    setPendingEnd({ scope: endScope, operation });
    const current = () => endScope.active && endScope.operation === operation && controller.getEpoch() === operation.epoch;
    operation.promise = Promise.resolve().then(async () => {
      if (!current()) return false;
      const prepared = await lifecycle.prepareLogout();
      if (!current()) return false;
      if (!prepared) { await lifecycle.resume(); return false; }
      const result = controller[kind]();
      // The controller advances its epoch synchronously when logout starts.
      const nextEpoch = controller.getEpoch();
      const nextAction = controller.getSnapshot().action;
      if (kind === 'logout' && nextEpoch === epoch + 1 && nextAction === 'logging-out') operation.epoch = nextEpoch;
      const success = await result;
      if (!success && current()) await lifecycle.resume();
      return success;
    }).catch(async () => {
      if (current()) await lifecycle.resume().catch(() => false);
      return false;
    }).finally(() => {
      if (endScope.operation === operation) endScope.operation = null;
      if (endScope.active) setPendingEnd(value => value?.operation === operation ? null : value);
    });
    return operation.promise;
  }, [controller, endScope, injectedController, notificationLifecycle]);
  const deleteAccount: SessionControllerPort['deleteAccount'] = useCallback(() => endSession('deleteAccount'), [endSession]);
  const logout: SessionControllerPort['logout'] = useCallback(() => endSession('logout'), [endSession]);
  const retryRecovery: SessionControllerPort['retryRecovery'] = useCallback(
    () => controller.retryRecovery(),
    [controller],
  );
  const leaveOffline: SessionControllerPort['leaveOffline'] = useCallback(
    () => controller.leaveOffline(), [controller],
  );
  const signIn: SessionControllerPort['signIn'] = useCallback(
    (provider, providerToken) => controller.signIn(provider, providerToken),
    [controller],
  );
  const value = useMemo<SessionContextValue>(
    () => ({
      ...snapshot,
      action: pendingEnd?.scope === endScope && pendingEnd.operation.epoch === controller.getEpoch()
        ? pendingEnd.operation.kind === 'logout' ? 'logging-out' : 'deleting-account'
        : snapshot.action,
      epoch: controller.getEpoch(),
      completeOnboarding,
      deleteAccount,
      logout,
      leaveOffline,
      retryRecovery,
      signIn,
    }),
    [
      completeOnboarding,
      controller,
      deleteAccount,
      logout,
      leaveOffline,
      retryRecovery,
      signIn,
      snapshot,
      pendingEnd,
      endScope,
    ],
  );

  useEffect(() => {
    void controller.bootstrap();
  }, [controller]);

  useEffect(() => {
    if (!controller.drainPendingRevocations) return;
    let mounted = true;
    let active = AppState.currentState === 'active';
    let pending = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const retry = () => {
      if (!mounted || !active || pending) return;
      pending = true;
      Promise.resolve().then(() => {
        if (mounted && active) return controller.drainPendingRevocations?.();
      }).catch(() => undefined).finally(() => { pending = false; });
    };
    const schedule = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      if (!mounted || !active) return;
      timer = setTimeout(() => { timer = undefined; retry(); schedule(); }, 30000);
    };
    const subscription = AppState.addEventListener('change', state => {
      active = state === 'active';
      if (active) retry();
      schedule();
    });
    retry();
    schedule();
    return () => {
      mounted = false;
      subscription.remove();
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [controller]);

  useEffect(() => {
    if (snapshot.state.status !== 'offline' && snapshot.state.status !== 'offline-workspace') return;
    const recover = () => { controller.retryRecovery().catch(() => undefined); };
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') recover(); });
    const timer = snapshot.action === 'idle' ? setTimeout(() => {
      if (AppState.currentState === 'active') recover();
    }, 5000) : undefined;
    return () => { subscription.remove(); if (timer !== undefined) clearTimeout(timer); };
  }, [controller, snapshot.state, snapshot.action]);

  return (
    <ClientContext.Provider value={client}>
      <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
    </ClientContext.Provider>
  );
}

export function useAuthenticatedClient(): AuthenticatedClient {
  const client = useContext(ClientContext);
  if (!client) throw new Error('Authenticated client is unavailable');
  return client;
}

export function useSession(): SessionContextValue {
  const session = useContext(SessionContext);

  if (session === null) {
    throw new Error('useSession must be used inside SessionProvider');
  }

  return session;
}

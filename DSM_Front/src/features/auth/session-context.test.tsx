import { act, cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import { AppState, Text, Pressable, type AppStateStatus } from 'react-native';

import type { SessionSnapshot } from './session-controller';
import { SessionProvider, useSession, useAuthenticatedClient } from './session-context';

function Probe() {
  const session = useSession();
  return <Text>{session.state.status}</Text>;
}
function EndSessionProbe() {
  const session = useSession();
  return <><Text>{session.action}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="end-session" onPress={() => { session.logout().catch(() => undefined); }} />
    <Pressable accessibilityRole="button" accessibilityLabel="delete-session" onPress={() => { session.deleteAccount().catch(() => undefined); }} />
  </>;
}

it.each(['logout', 'deleteAccount'] as const)('waits for notification cleanup before %s and resumes after failure', async kind => {
  const controller = createFakeController();
  controller.emit({ state: { status: 'authenticated', userId: 'owner', onboardingCompletedAt: '2026-01-01T00:00:00.000Z' }, action: 'idle', error: null });
  controller[kind].mockResolvedValue(false);
  let resolve!: (ok: boolean) => void;
  const notifications = { prepareLogout: jest.fn(() => new Promise<boolean>(done => { resolve = done; })), resume: jest.fn(async () => true) };
  await render(<SessionProvider controller={controller} notificationLifecycle={notifications}><EndSessionProbe /></SessionProvider>);
  await act(() => fireEvent.press(screen.getByLabelText(kind === 'logout' ? 'end-session' : 'delete-session')));
  expect(controller[kind]).not.toHaveBeenCalled();
  expect(screen.getByText(kind === 'logout' ? 'logging-out' : 'deleting-account')).toBeOnTheScreen();
  await act(() => resolve(true));
  expect(controller[kind]).toHaveBeenCalledTimes(1);
  expect(notifications.resume).toHaveBeenCalledTimes(1);
});
it('does not end a newer session after delayed notification preparation', async () => {
  const controller = createFakeController();
  controller.emit({ state: { status: 'authenticated', userId: 'owner', onboardingCompletedAt: '2026-01-01T00:00:00.000Z' }, action: 'idle', error: null });
  let resolve!: (ok: boolean) => void;
  const notifications = { prepareLogout: jest.fn(() => new Promise<boolean>(done => { resolve = done; })), resume: jest.fn(async () => true) };
  await render(<SessionProvider controller={controller} notificationLifecycle={notifications}><EndSessionProbe /></SessionProvider>);
  await act(() => fireEvent.press(screen.getByLabelText('end-session')));
  controller.getEpoch.mockReturnValue(1);
  await act(() => resolve(true));
  expect(controller.logout).not.toHaveBeenCalled();
});

function createFakeController() {
  let snapshot: SessionSnapshot = {
    state: { status: 'bootstrapping' },
    action: 'idle',
    error: null,
  };
  const listeners = new Set<() => void>();

  return {
    bootstrap: jest.fn().mockResolvedValue(undefined),
    completeOnboarding: jest.fn().mockResolvedValue(undefined),
    deleteAccount: jest.fn().mockResolvedValue(true),
    endUnauthorizedSession: jest.fn().mockResolvedValue(undefined),
    getAccessToken: jest.fn().mockReturnValue(null),
    getEpoch: jest.fn().mockReturnValue(0),
    getSnapshot: jest.fn(() => snapshot),
    logout: jest.fn().mockResolvedValue(true),
    leaveOffline: jest.fn().mockResolvedValue(true),
    drainPendingRevocations: jest.fn().mockResolvedValue(undefined),
    refreshAccessToken: jest.fn().mockResolvedValue('access'),
    retryRecovery: jest.fn().mockResolvedValue(undefined),
    signIn: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn((listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
    emit(next: SessionSnapshot) {
      snapshot = next;
      listeners.forEach((listener) => listener());
    },
  };
}

it.each(['false', 'throw'] as const)('preserves the session when notification cleanup returns %s', async result => {
  const controller = createFakeController();
  controller.emit({ state: { status: 'authenticated', userId: 'owner', onboardingCompletedAt: '2026-01-01T00:00:00.000Z' }, action: 'idle', error: null });
  const notifications = { prepareLogout: jest.fn(async () => { if (result === 'throw') throw new Error('native failure'); return false; }), resume: jest.fn(async () => true) };
  await render(<SessionProvider controller={controller} notificationLifecycle={notifications}><EndSessionProbe /></SessionProvider>);
  await act(() => fireEvent.press(screen.getByLabelText('end-session')));
  expect(controller.logout).not.toHaveBeenCalled();
  expect(notifications.resume).toHaveBeenCalledTimes(1);
  expect(screen.getByText('idle')).toBeOnTheScreen();
});

it('coalesces identical logout requests and rejects competing deletion during preparation', async () => {
  const controller = createFakeController();
  controller.emit({ state: { status: 'authenticated', userId: 'owner', onboardingCompletedAt: '2026-01-01T00:00:00.000Z' }, action: 'idle', error: null });
  let resolve!: (ok: boolean) => void;
  const notifications = { prepareLogout: jest.fn(() => new Promise<boolean>(done => { resolve = done; })), resume: jest.fn(async () => true) };
  let session!: ReturnType<typeof useSession>;
  function Capture() { session = useSession(); return null; }
  await render(<SessionProvider controller={controller} notificationLifecycle={notifications}><Capture /></SessionProvider>);
  let first!: Promise<boolean>;
  await act(async () => {
    first = session.logout();
    expect(session.logout()).toBe(first);
    expect(await session.deleteAccount()).toBe(false);
  });
  await act(() => resolve(true));
  expect(await first).toBe(true);
  expect(controller.logout).toHaveBeenCalledTimes(1);
  expect(controller.deleteAccount).not.toHaveBeenCalled();
  expect(notifications.resume).not.toHaveBeenCalled();
});

it('does not run an auth operation after its provider unmounts during preparation', async () => {
  const controller = createFakeController();
  controller.emit({ state: { status: 'authenticated', userId: 'owner', onboardingCompletedAt: '2026-01-01T00:00:00.000Z' }, action: 'idle', error: null });
  let resolve!: (ok: boolean) => void;
  const notifications = { prepareLogout: jest.fn(() => new Promise<boolean>(done => { resolve = done; })), resume: jest.fn(async () => true) };
  const view = await render(<SessionProvider controller={controller} notificationLifecycle={notifications}><EndSessionProbe /></SessionProvider>);
  await act(() => fireEvent.press(screen.getByLabelText('end-session')));
  await view.unmount();
  await act(() => resolve(true));
  expect(controller.logout).not.toHaveBeenCalled();
  expect(notifications.resume).not.toHaveBeenCalled();
});

it('starts bootstrap once and publishes controller snapshots', async () => {
  // Catches a provider that omits bootstrap or does not subscribe to its controller.
  const controller = createFakeController();
  await render(
    <SessionProvider controller={controller}>
      <Probe />
    </SessionProvider>,
  );

  expect(controller.bootstrap).toHaveBeenCalledTimes(1);
  await act(() =>
    controller.emit({
      state: { status: 'unauthenticated' },
      action: 'idle',
      error: null,
    }),
  );
  expect(await screen.findByText('unauthenticated')).toBeOnTheScreen();
});

it('rejects useSession outside SessionProvider', async () => {
  // Catches consumers that silently receive an invalid default session value.
  function OutsideProbe() {
    useSession();
    return null;
  }

  await expect(render(<OutsideProbe />)).rejects.toThrow(
    'useSession must be used inside SessionProvider',
  );
});

it('shares the injected authenticated client and publishes the session epoch', async () => {
  const controller = createFakeController();
  const client = { request: jest.fn() };
  let seen: unknown;
  function ClientProbe() {
    seen = useAuthenticatedClient();
    return <Text>{`epoch:${useSession().epoch}`}</Text>;
  }
  await render(<SessionProvider controller={controller} client={client}><ClientProbe /></SessionProvider>);
  expect(seen).toBe(client);
  controller.getEpoch.mockReturnValue(2);
  await act(() => controller.emit({ state: { status: 'unauthenticated' }, action: 'idle', error: null }));
  expect(screen.getByText('epoch:2')).toBeOnTheScreen();
  expect(seen).toBe(client);
});

it('exposes the controller account deletion operation unchanged', async () => {
  const controller = createFakeController();
  const deletion = Promise.resolve(true);
  controller.deleteAccount.mockReturnValue(deletion);
  let deleteAccount: (() => Promise<boolean>) | undefined;
  function DeleteProbe() {
    deleteAccount = useSession().deleteAccount;
    return null;
  }

  await render(
    <SessionProvider controller={controller}>
      <DeleteProbe />
    </SessionProvider>,
  );

  expect(deleteAccount?.()).toBe(deletion);
  expect(controller.deleteAccount).toHaveBeenCalledTimes(1);
});

describe('pending revocation foreground and periodic retry', () => {
  let callbacks: Set<(state: AppStateStatus) => void>;
  let previousState: PropertyDescriptor | undefined;
  beforeEach(() => {
    jest.useFakeTimers();
    callbacks = new Set();
    previousState = Object.getOwnPropertyDescriptor(AppState, 'currentState');
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
    jest.spyOn(AppState, 'addEventListener').mockImplementation((type, callback) => {
      if (type === 'change') callbacks.add(callback);
      return { remove: () => { callbacks.delete(callback); } };
    });
  });
  afterEach(async () => {
    await cleanup();
    jest.restoreAllMocks();
    if (previousState) Object.defineProperty(AppState, 'currentState', previousState);
    jest.useRealTimers();
  });
  async function appState(state: AppStateStatus) {
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: state });
    await act(async () => { callbacks.forEach(callback => callback(state)); });
  }
  const user = { userId: 'owner', onboardingCompletedAt: '2026-09-11T00:00:00.000Z' };
  it.each<SessionSnapshot['state']>([
    { status: 'authenticated', ...user }, { status: 'unauthenticated' },
    { status: 'bootstrapping' }, { status: 'storage-error', operation: 'write' },
    { status: 'onboarding', userId: user.userId, onboardingCompletedAt: null },
    { status: 'offline', retry: 'bootstrap' }, { status: 'offline-workspace', retry: 'bootstrap', ...user },
  ])('retries in the foreground and every 30 seconds with state %p', async state => {
    const controller = createFakeController();
    controller.emit({ state, action: 'idle', error: null });
    await render(<SessionProvider controller={controller}><Probe /></SessionProvider>);
    expect(controller.drainPendingRevocations).toHaveBeenCalledTimes(1);
    await act(() => jest.advanceTimersByTimeAsync(29999));
    expect(controller.drainPendingRevocations).toHaveBeenCalledTimes(1);
    await act(() => jest.advanceTimersByTimeAsync(1));
    expect(controller.drainPendingRevocations).toHaveBeenCalledTimes(2);
    await appState('background'); await appState('active');
    expect(controller.drainPendingRevocations).toHaveBeenCalledTimes(3);
    expect(screen.getByText(state.status)).toBeOnTheScreen();
  });

  it('does not start retries while inactive and cleans timers/listeners on unmount', async () => {
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'background' });
    const controller = createFakeController();
    const view = await render(<SessionProvider controller={controller}><Probe /></SessionProvider>);
    await act(() => jest.advanceTimersByTimeAsync(90000));
    expect(controller.drainPendingRevocations).not.toHaveBeenCalled();
    await appState('active');
    expect(controller.drainPendingRevocations).toHaveBeenCalledTimes(1);
    await appState('inactive');
    await act(() => jest.advanceTimersByTimeAsync(90000));
    expect(controller.drainPendingRevocations).toHaveBeenCalledTimes(1);
    await view.unmount();
    expect(callbacks.size).toBe(0);
    await appState('active');
    await act(() => jest.advanceTimersByTimeAsync(90000));
    expect(controller.drainPendingRevocations).toHaveBeenCalledTimes(1);
  });

  it('keeps at most one pending drain across timer and foreground events', async () => {
    const controller = createFakeController();
    let finish!: () => void;
    const pending = new Promise<void>(resolve => { finish = resolve; });
    controller.drainPendingRevocations.mockReturnValueOnce(pending);
    await render(<SessionProvider controller={controller}><Probe /></SessionProvider>);
    await act(() => jest.advanceTimersByTimeAsync(120000));
    await appState('background'); await appState('active');
    expect(controller.drainPendingRevocations).toHaveBeenCalledTimes(1);
    await act(async () => { finish(); await pending; });
    await act(() => jest.advanceTimersByTimeAsync(30000));
    expect(controller.drainPendingRevocations).toHaveBeenCalledTimes(2);
  });

  it('swallows storage rejection and retries later without changing session state', async () => {
    const controller = createFakeController();
    controller.emit({ state: { status: 'authenticated', ...user }, action: 'idle', error: null });
    controller.drainPendingRevocations.mockRejectedValueOnce(new Error('synthetic storage failure'));
    await render(<SessionProvider controller={controller}><Probe /></SessionProvider>);
    await act(() => jest.advanceTimersByTimeAsync(30000));
    expect(controller.drainPendingRevocations).toHaveBeenCalledTimes(2);
    expect(screen.getByText('authenticated')).toBeOnTheScreen();
    expect(controller.getSnapshot().error).toBeNull();
    expect(controller.logout).not.toHaveBeenCalled();
    expect(controller.endUnauthorizedSession).not.toHaveBeenCalled();
  });

  it('does not reset the periodic retry when authentication state changes', async () => {
    const controller = createFakeController();
    await render(<SessionProvider controller={controller}><Probe /></SessionProvider>);
    await act(() => jest.advanceTimersByTimeAsync(15000));
    await act(() => controller.emit({ state: { status: 'unauthenticated' }, action: 'idle', error: null }));
    await act(() => jest.advanceTimersByTimeAsync(15000));
    expect(controller.drainPendingRevocations).toHaveBeenCalledTimes(2);
  });

  it('preserves the optional port contract for older controller fakes', async () => {
    const { drainPendingRevocations: omitted, ...controller } = createFakeController();
    await render(<SessionProvider controller={controller}><Probe /></SessionProvider>);
    await act(() => jest.advanceTimersByTimeAsync(60000));
    await appState('background'); await appState('active');
    expect(omitted).not.toHaveBeenCalled();
    expect(controller.bootstrap).toHaveBeenCalledTimes(1);
  });

  it('keeps the existing offline five-second recovery separate from revocation retry', async () => {
    const controller = createFakeController();
    controller.emit({ state: { status: 'offline', retry: 'bootstrap' }, action: 'idle', error: null });
    await render(<SessionProvider controller={controller}><Probe /></SessionProvider>);
    await act(() => jest.advanceTimersByTimeAsync(5000));
    expect(controller.retryRecovery).toHaveBeenCalledTimes(1);
    expect(controller.drainPendingRevocations).toHaveBeenCalledTimes(1);
    await appState('background'); await appState('active');
    expect(controller.retryRecovery).toHaveBeenCalledTimes(2);
    expect(controller.drainPendingRevocations).toHaveBeenCalledTimes(2);
  });

  it('unmounts while active with a pending request without leaving timers or follow-up calls', async () => {
    const controller = createFakeController();
    let finish!: () => void;
    const pending = new Promise<void>(resolve => { finish = resolve; });
    controller.drainPendingRevocations.mockReturnValueOnce(pending);
    const view = await render(<SessionProvider controller={controller}><Probe /></SessionProvider>);
    expect(controller.drainPendingRevocations).toHaveBeenCalledTimes(1);
    await view.unmount();
    await act(async () => { finish(); await pending; });
    await act(() => jest.advanceTimersByTimeAsync(120000));
    expect(callbacks.size).toBe(0);
    expect(controller.drainPendingRevocations).toHaveBeenCalledTimes(1);
  });

  it('replaces the controller subscription and timer without resuming an old pending drain', async () => {
    const oldController = createFakeController();
    const nextController = createFakeController();
    let finish!: () => void;
    const pending = new Promise<void>(resolve => { finish = resolve; });
    oldController.drainPendingRevocations.mockReturnValueOnce(pending);
    const view = await render(<SessionProvider controller={oldController}><Probe /></SessionProvider>);
    await view.rerender(<SessionProvider controller={nextController}><Probe /></SessionProvider>);
    await act(async () => { finish(); await pending; });
    await act(() => jest.advanceTimersByTimeAsync(30000));
    expect(oldController.drainPendingRevocations).toHaveBeenCalledTimes(1);
    expect(nextController.drainPendingRevocations).toHaveBeenCalledTimes(2);
  });
});

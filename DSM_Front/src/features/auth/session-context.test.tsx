import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import type { SessionSnapshot } from './session-controller';
import { SessionProvider, useSession, useAuthenticatedClient } from './session-context';

function Probe() {
  const session = useSession();
  return <Text>{session.state.status}</Text>;
}

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
